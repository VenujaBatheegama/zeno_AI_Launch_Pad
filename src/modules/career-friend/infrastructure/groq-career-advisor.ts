import { generateText, tool } from "ai";
import { z } from "zod";

import type { GroqKeyPool } from "@/lib/ai/groq-key-pool";
import type { CareerAdvisor } from "../application/ports";
import type { CareerSnapshot } from "../domain/schemas";

const HERMES_SYSTEM_PROMPT = `You are Zeno, an autonomous, intelligent AI Career Copilot, Mentor, and Senior Technical Partner.
You talk like a sharp, supportive friend texting back — direct, empathetic, technically grounded, and highly practical.

## YOUR MISSION & CAPABILITIES:
- You help the user advance their career, build standout projects, explore market opportunities, ace interviews, tailor applications, and sharpen their engineering/product skills.
- You can answer ANY question — whether it is technical (system design, architecture, stack comparisons, code strategy), career-related (salary negotiations, resume critique, job search tactics, transition advice, market demand in specific locations), or general professional guidance.
- Always use the user's verified career context (<CAREER_SNAPSHOT>) when applicable to make your advice deeply tailored and personalized.
- When relevant, guide the user to their Zeno workspaces:
  • /app/jobs — Live job discoveries, market searches & automated campaigns
  • /app/growth — Active sprints, project blueprints & skill gap bridging
  • /app/cvs — Tailored CVs & cover letters
  • /app/career-profile — Verified evidence, skills & project experience

## TOOLS
You have access to tools to search for jobs, generate cover letters, and tailor CVs. 
- ALWAYS use \`searchJobs\` if the user is looking for roles, asking what's hiring, or exploring opportunities. Use the snapshot to infer their skills/roles if they ask generally.
- ALWAYS use \`generateCoverLetter\` if the user asks you to write, draft, or create a cover letter.
- ALWAYS use \`generateCv\` if the user asks you to tailor or create a CV.
When you call a tool, you will receive its result. You must then synthesize a conversational, thoughtful reply using that result. Do not just dump the raw output.

## COMMUNICATION STYLE:
- Conversational, insightful, and concise (2-4 punchy paragraphs or bullet points).
- No robotic corporate clichés, no empty filler, and no fake Markdown file download links.
- If the user asks an open-ended or complex question, give a thoughtful, concrete, and actionable answer immediately.`;

export class GroqCareerAdvisor implements CareerAdvisor {
  constructor(
    private readonly keyPool: GroqKeyPool,
    private readonly model: string,
  ) {}

  async reply(input: Parameters<CareerAdvisor["reply"]>[0]) {
    const suggestedActions = inferSuggestedActions(input.message, input.snapshot);
    try {
      const tools: Record<string, any> = {};
      
      if (input.executeSearchJobs) {
        tools.searchJobs = tool({
          description: "Search for jobs based on structured criteria",
          parameters: z.object({
            roles: z.array(z.string()).describe("Target job titles (e.g. ['React Developer'])"),
            locations: z.array(z.string()).describe("Target locations (e.g. ['London']). Do not include 'remote' here."),
            workModes: z.array(z.enum(["remote", "hybrid", "onsite"])).describe("Work modes"),
            employmentTypes: z.array(z.string()).describe("e.g. full_time, part_time, contract, internship"),
            experienceLevels: z.array(z.string()).describe("e.g. entry, mid, senior, lead"),
          }),
          execute: async (args: any) => input.executeSearchJobs!(args),
        } as any);
      }

      if (input.executeCoverLetter) {
        tools.generateCoverLetter = tool({
          description: "Generate a tailored cover letter for a specific job",
          parameters: z.object({
            jobTitle: z.string().describe("Target role title"),
            organizationName: z.string().optional().describe("Company name"),
            jobDescription: z.string().optional().describe("Job description or user's instructions for the letter"),
          }),
          execute: async (args: any) => input.executeCoverLetter!(args),
        } as any);
      }

      if (input.executeCv) {
        tools.generateCv = tool({
          description: "Tailor or generate a CV for a specific job",
          parameters: z.object({
            jobTitle: z.string().describe("Target role title"),
            organizationName: z.string().optional().describe("Company name"),
            jobDescription: z.string().optional().describe("Job description or user's instructions for the CV"),
          }),
          execute: async (args: any) => input.executeCv!(args),
        } as any);
      }

      const decision = await this.keyPool.withKey(
        async (apiKey) => {
          const result = await generateText({
            model: this.keyPool.createModel(apiKey, this.model),
            system: HERMES_SYSTEM_PROMPT,
            temperature: 0.3,
            maxRetries: 1,
            maxOutputTokens: 1200,
            // @ts-expect-error - Some versions of AI SDK use maxSteps or maxToolRoundtrips
            maxSteps: 2, // Cap at 2 steps: 1 for tool call, 1 for final reply
            tools,
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

          return {
            answer: answer || rawText || deterministicReply(input.message, input.snapshot),
            thinking,
          };
        },
        { rotateOnRateLimit: false, rotateOnToolFailure: false },
      );

      return {
        answer: decision.answer,
        thinking: decision.thinking,
        suggestedActions,
        usedModel: true,
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

