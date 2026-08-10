import { describe, expect, it } from "vitest";

import { emptyCareerEvidence } from "../domain/conversation-machine";
import { processOnboardingTurn } from "./process-onboarding-turn";

describe("processOnboardingTurn", () => {
  it("applies LLM operations and appends assistant + user messages", async () => {
    const evidence = emptyCareerEvidence();
    evidence.profile.full_name = "Ada";
    evidence.profile.email = "ada@example.com";
    evidence.profile.location = "Colombo";

    const result = await processOnboardingTurn(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        message: "I was a Software Developer Intern at Teejay Lanka.",
        clientMessageId: "msg-1",
        stage: "experience",
        evidence,
        messages: [],
        completedScriptKeys: ["phone", "summary"],
      },
      {
        createId: () => "assistant-1",
        conversationalist: {
          async completeTurn() {
            return {
              assistantMessage:
                "I've added that role. What did you personally build there?",
              intent: "provide_information",
              profileOperations: [
                {
                  operation: "create",
                  entityType: "experience",
                  temporaryRecordId: "tmp-1",
                  fields: {
                    role: "Software Developer Intern",
                    employer: "Teejay Lanka",
                  },
                },
              ],
              clarificationRequired: false,
              sectionStatus: "in_progress",
              suggestedReplies: ["I maintained .NET apps"],
            };
          },
        },
      },
    );

    expect(result.evidence.work_experience).toHaveLength(1);
    expect(result.evidence.work_experience[0]?.employer).toBe("Teejay Lanka");
    expect(result.messages).toHaveLength(2);
    expect(result.acceptedOperations).toHaveLength(1);
    expect(result.suggestedReplies).toEqual([]);
    expect(result.stage).toBe("experience");
    expect(result.assistantMessage).toMatch(/personally|responsibilities|work on/i);
  });

  it("does not duplicate a user message already present in the transcript", async () => {
    const result = await processOnboardingTurn(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        message: "My name is Ada",
        clientMessageId: "msg-existing",
        stage: "about_you",
        evidence: emptyCareerEvidence(),
        messages: [
          { id: "intro", role: "zeno", text: "Hi" },
          { id: "msg-existing", role: "user", text: "My name is Ada" },
        ],
      },
      {
        createId: () => "assistant-2",
        conversationalist: {
          async completeTurn() {
            return {
              assistantMessage: "Thanks, Ada.",
              intent: "provide_information",
              profileOperations: [
                {
                  operation: "create",
                  entityType: "personal_details",
                  temporaryRecordId: "tmp-profile",
                  fields: { full_name: "Ada" },
                },
              ],
              clarificationRequired: false,
              sectionStatus: "in_progress",
              suggestedReplies: [],
            };
          },
        },
      },
    );

    const userMessages = result.messages.filter(
      (message) => message.id === "msg-existing",
    );
    expect(userMessages).toHaveLength(1);
    expect(result.messages.filter((message) => message.role === "user")).toHaveLength(
      1,
    );
  });

  it("replays idempotently for the same clientMessageId", async () => {
    const evidence = emptyCareerEvidence();
    const result = await processOnboardingTurn(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        message: "Java and Python",
        clientMessageId: "msg-dup",
        evidence,
        messages: [
          { id: "msg-dup", role: "user", text: "Java and Python" },
          { id: "a1", role: "zeno", text: "Added those skills." },
        ],
        processedClientMessageIds: ["msg-dup"],
      },
      {
        createId: () => "x",
        conversationalist: {
          async completeTurn() {
            throw new Error("should not call LLM again");
          },
        },
      },
    );

    expect(result.idempotentReplay).toBe(true);
    expect(result.assistantMessage).toBe("Added those skills.");
  });
});
