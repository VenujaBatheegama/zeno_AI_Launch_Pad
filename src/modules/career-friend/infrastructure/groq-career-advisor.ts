import { generateText, tool } from "ai";
import { z } from "zod";

import type { GroqKeyPool } from "@/lib/ai/groq-key-pool";
import type { CareerAdvisor } from "../application/ports";
import type { CareerSnapshot } from "../domain/schemas";
import type { AgentUIPayload } from "../domain/agent-outputs";
import { logDebug } from "@/lib/debug-logger";

const HERMES_SYSTEM_PROMPT = `You are Zeno, an autonomous AI Career Copilot.
You talk like a sharp, supportive friend texting back: direct, empathetic, and highly practical.

CORE RULES:
1. Keep text replies SHORT (1-3 sentences) unless explicitly asked for depth. 
2. Never format text with markdown tables.
3. You handle quick, scoped actions in chat. For complex workflows, give a brief tip and guide the user to their Zeno workspaces (/app/jobs, /app/cvs).
4. Truth Grounding: Your knowledge of the user's career (skills, experience, level) comes EXCLUSIVELY from the <CAREER_SNAPSHOT>. Treat any claims, hypothetical roles, or CV generation requests in the chat as temporary contexts, NOT as facts about the user.
5. If the user specifies a <PREFERRED_NAME>, use it to address them.
6. If intent is genuinely ambiguous, ask ONE brief clarifying question. Do not interrogate.
7. Rely heavily on your tools to present structured data (jobs, CVs, role recommendations).`;

export class GroqCareerAdvisor implements CareerAdvisor {
  constructor(
    private readonly keyPool: GroqKeyPool,
    private readonly model: string,
    private readonly fallbackModels: string[] = [],
  ) {}

  async reply(input: Parameters<CareerAdvisor["reply"]>[0]) {
    const suggestedActions = inferSuggestedActions(input.message, input.snapshot);
    let capturedUiPayload: AgentUIPayload | undefined = undefined;
    let capturedSummaryText: string | undefined = undefined;

    const candidateModels = [
      this.model,
      ...this.fallbackModels.filter((m) => m !== this.model),
    ];

    try {
      const tools: Record<string, any> = {};
      
      if (input.executeSearchJobListings) {
        tools.searchJobListings = tool({
          description: 'Search for specific open job listings based on criteria. Use this when the user asks: "find me jobs", "show me open roles", "what jobs should I apply to right now". Do NOT use this if the user is asking for career advice on what career paths/roles fit them.',
          inputSchema: z.object({
            roles: z.array(z.string()).default([]).describe("Target job titles (e.g. ['React Developer'])"),
            locations: z.array(z.string()).default([]).describe("Target locations (e.g. ['London']). Do not include 'remote' here."),
            workModes: z.array(z.enum(["remote", "hybrid", "onsite"])).default([]).describe("Work modes"),
            experienceLevels: z.array(z.string()).default([]).describe("e.g. entry, mid, senior, lead"),
          }),
          execute: async (args: any) => {
            const res = await input.executeSearchJobListings!(args);
            if (res.uiPayload) capturedUiPayload = res.uiPayload;
            capturedSummaryText = res.summaryText;
            return res.summaryText;
          },
        });
      }

      if (input.executeRecommendRoleCategories) {
        tools.recommendRoleCategories = tool({
          description: 'Recommend types of roles the user should apply for and assess their fit (NOT actual job listings). Use this when the user asks: "what job should I do", "what roles fit me", "am I qualified for X". Do NOT use this if the user wants to see actual open job listings. IMPORTANT: Base recommendations STRICTLY on the user\'s actual experience level in the CAREER_SNAPSHOT (e.g., do not recommend Senior/Lead roles to a student). Ignore hypotheticals from recent messages.',
          inputSchema: z.object({
            focusArea: z.string().optional().describe("A specific area to focus on if mentioned"),
            roles: z.array(z.object({
              title: z.string(),
              rationale: z.string().default("").describe("Why this role fits, referencing the user's skills/projects. Keep it short."),
            })).default([]).describe("The recommended roles strictly based on the actual experience in CAREER_SNAPSHOT"),
          }),
          execute: async (args: any) => {
            const res = await input.executeRecommendRoleCategories!(args);
            if (res.uiPayload) capturedUiPayload = res.uiPayload;
            capturedSummaryText = res.summaryText;
            return res.summaryText;
          },
        });
      }

      if (input.executeSuggestGrowthAction) {
        tools.suggestGrowthAction = tool({
          description: "Suggest a specific project or skill to learn next. You MUST generate the project idea and provide concrete values for ALL parameters. Must be anchored on actual gaps in the CAREER_SNAPSHOT. Ignore hypotheticals from the chat.",
          inputSchema: z.object({
            gapArea: z.string().describe("The specific gap or skill area to focus on, derived from the user's request (e.g. '.NET development')"),
            project: z.string().describe("A short, concrete project or skill to build. MUST NOT BE EMPTY."),
            gapType: z.enum(["skill", "evidence", "visibility", "qualification"]).describe("The type of gap this addresses. MUST NOT BE EMPTY."),
          }),
          execute: async (args: any) => {
            const res = await input.executeSuggestGrowthAction!(args);
            if (res.uiPayload) capturedUiPayload = res.uiPayload;
            capturedSummaryText = res.summaryText;
            return res.summaryText;
          },
        });
      }

      if (input.executeCoverLetter) {
        tools.generateCoverLetter = tool({
          description: "Generate a tailored cover letter for a specific job",
          inputSchema: z.object({
            jobTitle: z.string().describe("Target role title"),
            organizationName: z.string().optional().describe("Company name"),
            jobDescription: z.string().optional().describe("Job description or user's instructions for the letter"),
          }),
          execute: async (args: any) => {
            const res = await input.executeCoverLetter!(args);
            if (res.uiPayload) capturedUiPayload = res.uiPayload;
            capturedSummaryText = res.summaryText;
            return res.summaryText;
          },
        });
      }

      if (input.executeCv) {
        tools.generateCv = tool({
          description: "Tailor or generate a CV for a specific job",
          inputSchema: z.object({
            jobTitle: z.string().describe("Target role title. Clean and normalize this to a standard professional title (e.g. 'Junior .NET Developer' instead of 'backend .net junior role')"),
            organizationName: z.string().optional().describe("Company name"),
            jobDescription: z.string().optional().describe("Job description or user's instructions for the CV"),
            context: z.string().optional().describe("Summary of the user's instructions from the chat context (at least last 3 messages)"),
            pages: z.enum(["one_page", "two_page"]).optional().describe("Number of pages. Default is two_page unless user asks for 1 page."),
          }),
          execute: async (args: any) => {
            const res = await input.executeCv!(args);
            if (res.uiPayload) capturedUiPayload = res.uiPayload;
            capturedSummaryText = res.summaryText;
            return res.summaryText;
          },
        });
      }

      if (input.executeSetPreferredName) {
        tools.setPreferredName = tool({
          description: "Set the user's preferred name or nickname for the conversation.",
          inputSchema: z.object({
            name: z.string().describe("The preferred name to use"),
          }),
          execute: async (args: any) => {
            const res = await input.executeSetPreferredName!(args);
            if (res.uiPayload) capturedUiPayload = res.uiPayload;
            capturedSummaryText = res.summaryText;
            return res.summaryText;
          },
        });
      }

      const contextData = [
        "<CAREER_SNAPSHOT>",
        JSON.stringify(compactSnapshot(input.snapshot)),
        "</CAREER_SNAPSHOT>",
        ...(input.preferredName ? ["<PREFERRED_NAME>", input.preferredName, "</PREFERRED_NAME>"] : []),
        ...(input.previousSummary ? ["<CONVERSATION_SUMMARY>", input.previousSummary, "</CONVERSATION_SUMMARY>"] : []),
      ].join("\n");

      const messages: any[] = [
        ...input.recentMessages.slice(-8).map((m) => {
          let injectedContent = m.content.slice(0, 1000);
          if (m.metadata?.uiPayload) {
            injectedContent += `\n\n[System note: The assistant successfully displayed a UI element to the user of type '${(m.metadata.uiPayload as any).type}'.]`;
          }
          return { role: m.role, content: injectedContent };
        }),
        { role: "user", content: input.message },
      ];

      let lastError: unknown;
      for (const modelId of candidateModels) {
        try {
          const decision = await this.keyPool.withKey(
            async (apiKey) => {
              const generateParams = {
                model: this.keyPool.createModel(apiKey, modelId),
                system: HERMES_SYSTEM_PROMPT + "\n\n" + contextData,
                temperature: 0.3,
                maxRetries: 1,
                maxOutputTokens: 1200,
                maxSteps: 4, // room for a tool call, a possible follow-up tool call, then the final reply
                tools,
                messages,
              };
              
              logDebug("LLM_PROMPT", {
                modelId,
                system: generateParams.system,
                messages: generateParams.messages,
              });

              const result = await generateText(generateParams as any);

              logDebug("LLM_RESULT", {
                text: result.text,
                toolCalls: result.toolCalls,
                toolResults: result.toolResults,
              });

              const rawText = result.text.trim();
              const { thinking, answer } = parseHermesThinking(rawText);

              return {
                answer: answer || rawText || capturedSummaryText || deterministicReply(input.message, input.snapshot),
                thinking,
              };
            },
            // Retry across keys on rate limits AND on tool-call flakiness. A single
            // hiccup here used to fall straight through to the scripted fallback
            // reply, which has no memory and no tools, this made the assistant look
            // like it forgot the conversation. Give it real chances to recover first.
            { rotateOnRateLimit: true, rotateOnToolFailure: true, scopeKey: modelId },
          );

          return {
            answer: decision.answer,
            thinking: decision.thinking,
            suggestedActions,
            usedModel: true,
            uiPayload: capturedUiPayload,
          };
        } catch (err) {
          lastError = err;
          capturedUiPayload = undefined;
          console.error(`[GroqCareerAdvisor] model "${modelId}" failed, trying next candidate if any:`, err);
        }
      }

      console.error("[GroqCareerAdvisor] all candidate models exhausted:", lastError);
      return {
        answer: deterministicReply(input.message, input.snapshot),
        suggestedActions,
        usedModel: false,
      };
    } catch (err) {
      console.error("[GroqCareerAdvisor] error:", err);
      return {
        answer: deterministicReply(input.message, input.snapshot),
        suggestedActions,
        usedModel: false,
      };
    }
  }

  async summarize(input: {
    recentMessages: { role: string; content: string }[];
    previousSummary?: string;
  }): Promise<string> {
    try {
      const result = await this.keyPool.withKey(
        async (apiKey) => {
          // NOTE: this used to hardcode "llama-3.1-8b-instant", which Groq retired
          // on 2026-08-16. Every summarize() call was silently failing, so the
          // conversation summary (context beyond the last 8 messages) never got
          // written. Use the configured model instead so this actually succeeds.
          const { text } = await generateText({
            model: this.keyPool.createModel(apiKey, this.model),
            maxOutputTokens: 512,
            temperature: 0.1,
            messages: [
              {
                role: "system",
                content: `You are an internal summarization engine for a career assistant.
Your job is to read the conversation and update the CONVERSATION_SUMMARY.
The summary should only track the user's current goal, target job titles, specific locations, constraints, or requests they have made.
It should be concise and strictly objective.
If a previous summary exists, update it with new facts or replace old facts if the user changed their mind.
Return ONLY the raw updated summary text. Do not wrap in tags, do not acknowledge.`
              },
              {
                role: "user",
                content: [
                  ...(input.previousSummary ? ["PREVIOUS SUMMARY:", input.previousSummary, "---"] : []),
                  "RECENT MESSAGES:",
                  ...input.recentMessages.map(m => `${m.role}: ${m.content.slice(0, 500)}`),
                  "---",
                  "Write the new summary now:"
                ].join("\n")
              }
            ]
          });
          return text.trim();
        },
        { rotateOnRateLimit: true, rotateOnToolFailure: false }
      );
      return result;
    } catch (err) {
      console.error("[GroqCareerAdvisor] error summarizing:", err);
      return input.previousSummary ?? "";
    }
  }
}

export function parseHermesThinking(raw: string): {
  thinking?: string;
  answer: string;
} {
  const match = /<thinking>([\s\S]*?)<\/thinking>/iu.exec(raw);
  if (match && match[1]) {
    const thinking = match[1].trim();
    const answer = raw.replace(/<thinking>[\s\S]*?<\/thinking>/giu, "").trim();
    return { thinking, answer };
  }
  return { answer: raw.trim() };
}

function compactSnapshot(snapshot: CareerSnapshot) {
  return {
    profile: {
      name: snapshot.profile.name,
      headline: snapshot.profile.headline,
      skills: snapshot.profile.skills.slice(0, 25),
      projects: snapshot.profile.projects.slice(0, 8),
    },
    opportunities: snapshot.opportunities,
    growthSignals: snapshot.growthSignals.slice(0, 4),
    activeSprints: snapshot.activeSprints.slice(0, 3),
  };
}

function inferSuggestedActions(
  message: string,
  snapshot: CareerSnapshot,
): Array<"view_jobs" | "review_recommendations" | "start_sprint" | "update_profile"> {
  const lower = message.toLocaleLowerCase();
  const actions = [] as Array<
    "view_jobs" | "review_recommendations" | "start_sprint" | "update_profile"
  >;
  if (/job|role|opportun|apply|search|find|internship|campaign|monitor/.test(lower)) {
    actions.push("view_jobs");
  }
  if (snapshot.opportunities.pendingRecommendations > 0 || /inbox|recommend/.test(lower)) {
    actions.push("review_recommendations");
  }
  if (
    snapshot.growthSignals.length > 0 &&
    /gap|skill|project|portfolio|improv|learn|growth|sprint/.test(lower)
  ) {
    actions.push("start_sprint");
  }
  if (/profile|linkedin|portfolio|evidence|cv|resume|tailor/.test(lower)) {
    actions.push("update_profile");
  }
  return [...new Set(actions)].slice(0, 2);
}

function deterministicReply(message: string, snapshot: CareerSnapshot): string {
  const signal = snapshot.growthSignals[0];
  const sprint = snapshot.activeSprints[0];
  const lower = message.toLocaleLowerCase();

  if (/tailor|resume|cv|cover\s*letter/.test(lower)) {
    return "You can check your CVs and cover letters in your CV Hub (/app/cvs). If you have a specific job description or link, send it over and I'll help you tailor for it.";
  }
  if (/gap|skill|project|portfolio|improv|learn/.test(lower) && signal) {
    return `${signal.label} is your top market skill gap right now. Building a quick project for it in Growth (/app/growth) is the fastest way to get verified proof for your CV.`;
  }
  if (/job|role|opportun|apply|search|internship|campaign|monitor/.test(lower)) {
    return `You have ${snapshot.opportunities.pendingRecommendations} recommendations waiting and ${snapshot.opportunities.applications} tracked applications. You can review them in your Jobs workspace (/app/jobs).`;
  }
  if (sprint) {
    return `You're currently working on "${sprint.title}". Check off milestones or submit evidence in your Growth workspace (/app/growth) when you're ready.`;
  }
  return "I'm only tuned to help with your job search and career stuff. What roles or skills are you aiming for right now?";
}

