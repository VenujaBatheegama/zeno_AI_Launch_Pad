import { generateText, tool } from "ai";

import type { GroqKeyPool } from "@/lib/ai/groq-key-pool";
import type { CareerAdvisor } from "../application/ports";
import type { CareerSnapshot } from "../domain/schemas";
import {
  GenerateCoverLetterToolSchema,
  GenerateCvToolSchema,
  GrowthSprintToolSchema,
  ManageCampaignToolSchema,
  SearchJobsToolSchema,
} from "../application/agent-tools";

const HERMES_SYSTEM_PROMPT = `You are Zeno, an autonomous AI Career Copilot built with Hermes-level reasoning and empathy. You talk like a sharp, supportive friend texting back — concise, direct, never robotic or marketing-speak.

## YOUR HERMES REASONING PROCESS (<thinking>)
For EVERY interaction, begin by reasoning in a <thinking>...</thinking> block:
1. Intent & Constraints: What does the user want? (e.g. 1-page vs. 2-page CV, specific role, specific company, general advice, live job search, growth sprint). Note explicit constraints like "2-page", "two pages", "detailed", or "1-page".
2. Context & History: Check <CAREER_SNAPSHOT> and <RECENT_CONVERSATION>. Do we already know the target role, verified skills, or active sprint?
3. Tool Execution Plan: Should a tool be called? (generate_cv, generate_cover_letter, search_jobs, manage_growth_sprint, manage_campaign).
4. Response Formulation: Draft a high-EQ, friendly 2-3 sentence reply.

## CORE CAPABILITIES & TOOLS

1. CV Generation & Tailoring (Tool: generate_cv):
   - When the user asks for a CV or resume (e.g., "give me a CV", "2 page CV", "tailor for Stripe"):
     - If the user explicitly asks for 2 pages / two pages / detailed -> set mode: "two_page".
     - If default / 1-page -> set mode: "one_page".
     - Extract target jobTitle, organizationName, jobDescription, and focusAreas if provided.
   - Mention that the CV is attached below as a PDF.

2. Cover Letter Generation (Tool: generate_cover_letter):
   - When the user asks for a cover letter, extract target role, company, and JD.
   - Mention that the cover letter is attached below as a PDF.

3. Natural Language Job Search (Tool: search_jobs):
   - When the user asks to find, search, or look for jobs, extract query keywords, location, and workMode (remote/hybrid/onsite).

4. Growth Sprints & Gap Analysis (Tool: manage_growth_sprint):
   - When user asks what skills to learn or how to close a gap, recommend a targeted growth sprint or project based on market demand.

5. Search Campaigns (Tool: manage_campaign):
   - When user wants to create, list, or pause active job watch campaigns.

## COMMUNICATION STYLE
- 2-4 sentences per response. Friendly, direct, texting-a-friend style.
- Never use long dashes (—) or robotic corporate filler.
- Plain text only; no raw markdown resume dumps in chat.
- If the user goes off-topic (trivia, general coding homework, jokes), casually steer them back to career goals.`;

export class GroqCareerAdvisor implements CareerAdvisor {
  constructor(
    private readonly keyPool: GroqKeyPool,
    private readonly model: string,
  ) {}

  async reply(input: Parameters<CareerAdvisor["reply"]>[0]) {
    const suggestedActions = inferSuggestedActions(input.message, input.snapshot);
    try {
      const decision = await this.keyPool.withKey(
        async (apiKey) => {
          const result = await generateText({
            model: this.keyPool.createModel(apiKey, this.model),
            system: HERMES_SYSTEM_PROMPT,
            temperature: 0.25,
            maxRetries: 1,
            maxOutputTokens: 900,
            tools: {
              generate_cv: tool({
                description:
                  "Generate or tailor a downloadable CV PDF based on verified profile evidence and job requirements.",
                inputSchema: GenerateCvToolSchema,
              }),
              generate_cover_letter: tool({
                description:
                  "Generate a tailored or general Cover Letter PDF for a role or company.",
                inputSchema: GenerateCoverLetterToolSchema,
              }),
              search_jobs: tool({
                description:
                  "Search live job openings across hybrid sources with query, location, and work mode filters.",
                inputSchema: SearchJobsToolSchema,
              }),
              manage_growth_sprint: tool({
                description:
                  "Recommend or start a growth sprint to bridge skill gaps against market demand.",
                inputSchema: GrowthSprintToolSchema,
              }),
              manage_campaign: tool({
                description:
                  "Create, list, or pause active job search campaigns.",
                inputSchema: ManageCampaignToolSchema,
              }),
            },
            prompt: [
              "<CAREER_SNAPSHOT>",
              JSON.stringify(compactSnapshot(input.snapshot)),
              "</CAREER_SNAPSHOT>",
              "<RECENT_CONVERSATION>",
              ...input.recentMessages.slice(-8).map(
                (item) => `${item.role}: ${item.content.slice(0, 800)}`,
              ),
              "</RECENT_CONVERSATION>",
              "<USER_MESSAGE>",
              input.message,
              "</USER_MESSAGE>",
            ].join("\n"),
          });

          const rawText = result.text.trim();
          const { thinking, answer } = parseHermesThinking(rawText);

          const toolCalls =
            result.toolCalls && result.toolCalls.length > 0
              ? result.toolCalls.map((tc) => ({
                  toolName: tc.toolName,
                  args: (tc.input ?? {}) as Record<string, unknown>,
                }))
              : undefined;

          return {
            answer: answer || rawText,
            thinking,
            toolCalls,
          };
        },
        { rotateOnRateLimit: false, rotateOnToolFailure: false },
      );

      return {
        answer: decision.answer,
        thinking: decision.thinking,
        suggestedActions,
        toolCalls: decision.toolCalls,
        usedModel: true,
      };
    } catch {
      return {
        answer: deterministicReply(input.message, input.snapshot),
        suggestedActions,
        usedModel: false,
      };
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

