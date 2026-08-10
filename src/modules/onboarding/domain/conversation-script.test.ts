import { describe, expect, it } from "vitest";

import { emptyCareerEvidence } from "./conversation-machine";
import {
  advanceCompletedScriptKeys,
  ensureAssistantAsksScriptStep,
  getCurrentScriptStep,
  openingScriptMessage,
} from "./conversation-script";

describe("conversation script", () => {
  it("starts with preferred name on the CV", () => {
    const step = getCurrentScriptStep(emptyCareerEvidence());
    expect(step.key).toBe("preferred_name");
    expect(openingScriptMessage()).toMatch(/name/i);
  });

  it("advances top-down after name and email are filled", () => {
    const evidence = emptyCareerEvidence();
    evidence.profile.full_name = "Ada Lovelace";
    evidence.profile.email = "ada@example.com";
    expect(getCurrentScriptStep(evidence).key).toBe("phone");
  });

  it("marks optional phone as complete on skip", () => {
    const evidence = emptyCareerEvidence();
    evidence.profile.full_name = "Ada";
    evidence.profile.email = "ada@example.com";
    const keys = advanceCompletedScriptKeys({
      beforeEvidence: evidence,
      afterEvidence: evidence,
      completedKeys: [],
      userMessage: "skip",
      intent: "skip",
    });
    expect(keys).toContain("phone");
    expect(getCurrentScriptStep(evidence, keys).key).toBe("location");
  });

  it("keeps experience before projects and education", () => {
    const evidence = emptyCareerEvidence();
    evidence.profile.full_name = "Ada";
    evidence.profile.email = "ada@example.com";
    const keys = ["phone", "location", "summary"];
    expect(getCurrentScriptStep(evidence, keys).stage).toBe("experience");
  });

  it("ensures the assistant asks the scripted question", () => {
    const step = getCurrentScriptStep(emptyCareerEvidence());
    const text = ensureAssistantAsksScriptStep(
      "Thanks for sharing that.",
      step,
    );
    expect(text).toContain("Thanks for sharing that.");
    expect(text).toMatch(/name/i);
    expect(text).toContain("?");
  });
});
