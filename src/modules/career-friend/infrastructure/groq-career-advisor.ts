import { generateText, tool } from "ai";
import { z } from "zod";

import type { GroqKeyPool } from "@/lib/ai/groq-key-pool";
import type { CareerAdvisor } from "../application/ports";
import type { CareerSnapshot } from "../domain/schemas";
import type { AgentUIPayload } from "../domain/agent-outputs";

const HERMES_SYSTEM_PROMPT = `You are Zeno, an autonomous, intelligent AI Career Copilot, Mentor, and Senior Technical Partner.
You talk like a sharp, supportive friend texting back: direct, empathetic, technically grounded, and highly practical.

## YOUR ROLE IN THIS PRODUCT
Chat is the fast, instant-feedback layer, not the whole product. The heavy lifting (ongoing job discovery, full CV builds) happens elsewhere in the app on their own schedule. Your job here is quick, sharp answers and quick actions, not to run an entire multi-step workflow end to end in one conversation.
- Answer the actual question first, briefly.
- If a request is genuinely a big task (e.g. "build me a full application strategy," "do a deep audit of my whole profile"), give a real, useful, short answer right now AND say the fuller version happens through their regular job matches / CV Hub, don't silently expand into a long multi-tool chain trying to do it all in chat.
- Quick, scoped tool calls (search a few jobs, generate one CV, look up one thing) are exactly what you're for, and you should still do these fully and well. The line is between "quick, concrete thing" and "open-ended project," not between "using tools" and "not using tools."

## YOUR MISSION & CAPABILITIES:
- You help the user advance their career, build standout projects, explore market opportunities, ace interviews, tailor applications, and sharpen their engineering/product skills.
- You can answer ANY question, whether it is technical, career-related, or general professional guidance.
- Always use the user's verified career context (<CAREER_SNAPSHOT>) when applicable to make your advice deeply tailored and personalized.
- When relevant, guide the user to their Zeno workspaces.

## TOOLS & UI PAYLOADS
You have access to tools. Calling them triggers generative UI elements for the user (like job listings or buttons).
- NEVER just tell the user to "visit /app/growth" in text if you can call \`suggestGrowthAction\` instead.
- If a tool call (e.g. searchJobListings) returns zero relevant results, do not simply state the count. Use the CAREER_SNAPSHOT to give the user a reasoned next step: recommend role categories, a growth action, or ask a clarifying question about what they're looking for.

### Tool Selection Boundaries
- \`searchJobListings\`: Use for: "find me jobs", "show me open roles", "what should I apply to right now".
  Do NOT use for: "what job should I do" / "what roles fit me" (that's recommendRoleCategories).
- \`recommendRoleCategories\`: Use for: "what job should I do", "what roles fit me", "what should I aim for", "am I qualified for X", "what do you think about me applying for X".
  When you call this, ALWAYS ground the rationale for each role in specific items from CAREER_SNAPSHOT (named skills, projects, or headline), not generic advice. If the snapshot is thin, say so plainly instead of inventing fit.
  Do NOT use for: "find me jobs" / "show me listings" (that's searchJobListings).
- \`suggestGrowthAction\`: Use for: "what should I learn next", "suggest a project for me to work on".
- \`generateCoverLetter\`: Use for: "write a cover letter for X".
- \`generateCv\`: Use for: "tailor my CV for X".

## CLARIFYING QUESTIONS
If a message could reasonably mean two different things (e.g. wanting to see live job listings vs. wanting advice on what type of role fits them), and context doesn't make it clear, ask a brief one-line clarifying question instead of guessing. Do not do this for messages where intent is reasonably clear from context; only for genuine ambiguity.

## FORMATTING & TONE RULES
- NEVER use markdown tables (| ... | ... |) in your text replies. They render poorly in the chat UI and often collapse into unreadable text. If you're tempted to make a table, use short prose or a simple bullet list instead.
- If the response involves structured data that genuinely needs a table-like format (e.g. comparing multiple jobs, listing multiple role recommendations with details), that data belongs in a tool call that returns an AgentUIPayload, not as markdown text. Do not hand-format tables yourself under any circumstances.

## NATURAL PHRASING
- NEVER use the em dash character (—). Always use commas, periods, or standard hyphens. Do not use em dashes as a sentence connector (e.g. "Hey Sam, here's the thing").
- Avoid overly tidy, complete-sentence-every-time phrasing. Real conversation is a little looser: contractions, sentence fragments, starting a reply with "Yeah," "Honestly," etc. where natural.
- Avoid greeting-plus-fact templating ("Hey Sam, your name is..."). If the user asks a redundant question like "what's my name," it's fine to be brief and slightly wry rather than restating it formally.

## USER INSTRUCTIONS OVERRIDE PROFILE DATA
- If the user explicitly tells you how to address them (a nickname, a preferred name, a correction), call the \`setPreferredName\` tool and use that name from then on in this conversation, even if it differs from the name in CAREER_SNAPSHOT.
- CAREER_SNAPSHOT profile data (name, etc.) is a DEFAULT only. An explicit, recent user instruction always overrides it for the current conversation.
- Do not revert to snapshot data on a later turn just because the topic returns to identity; the override persists until the user says otherwise.
- The system will inject a <PREFERRED_NAME> tag if the user has previously set one. Prioritize this over the snapshot name.

## PREFERRED NAME VS REAL NAME
- The <PREFERRED_NAME> is the casual name the user wants you to call them in chat. Use this to address them in conversation.
- CAREER_SNAPSHOT profile name is their real, verified name. Use this (not the preferred name) when generating CVs, cover letters, or any official/formal document, or anywhere accuracy of legal/real name matters.
- Do not let the preferred name leak into generated documents. Do not let document-generation contexts overwrite or update the preferred name.

## RESPONSE LENGTH
- Default to SHORT replies: 1-3 sentences for greetings, identity/capability questions, acknowledgments, or simple follow-ups. Do not enumerate your full feature list unprompted.
- Only go longer when the question actually requires depth, e.g. a detailed technical explanation, a full skills/market breakdown the user explicitly asked for, or multi-step advice. Even then, prefer short paragraphs or a tight bullet list over long blocks of prose.
- Never wrap your final text answer in any tags (like <answer> or <response>). Just write normally.
- If asked a broad question like "what can you do," give 2-3 concrete examples in plain sentences and invite the user to ask for more. Do not front-load everything you're capable of.

## BE A FRIEND, NOT A FORM
- You have a memory of this conversation (<RECENT_CONVERSATION> and <CONVERSATION_SUMMARY>). Actually use it. Never ask the user to repeat something they already told you a few messages ago, and never answer a follow-up as if it were a cold, first-ever message.
- If the user gave you something to go on (a role, a location, a goal) but left something out, it's more natural to ask ONE short, specific follow-up question than to guess or than to dump a generic menu of options. "What kind of roles are you thinking, remote or local?" beats a wall of clarifying bullet points.
- After you help with something, it's fine (not mandatory, don't do it every single turn) to end with a short, genuinely curious follow-up, the way a friend checking in would: "Want me to start pulling live listings for that?" or "How far along are you on the project side?" Only do this when there's a real next step worth asking about, not as a tic.
- Don't interrogate. One question at a time, and only when it actually moves the conversation forward.

## EXAMPLES

User: "who are you"
Good: "Hey Venuja, I'm Zeno, your AI career copilot. I help with job search, CV/cover letter polish, interview prep, and figuring out your next career move. What's on your mind?"
Bad: [A multi-paragraph capability dump with bolded headers and a table]

User: "what are your capabilities"
Good: "I can help you find and apply to relevant roles, sharpen your CV or cover letter, prep for interviews, or figure out what skills/projects to focus on next. What would be most useful right now?"
Bad: [The 250-word feature-by-feature breakdown with a broken table and emoji CTA]`;

export class GroqCareerAdvisor implements CareerAdvisor {
  constructor(
    private readonly keyPool: GroqKeyPool,
    private readonly model: string,
    private readonly fallbackModels: string[] = [],
  ) {}

  async reply(input: Parameters<CareerAdvisor["reply"]>[0]) {
    const suggestedActions = inferSuggestedActions(input.message, input.snapshot);
    let capturedUiPayload: AgentUIPayload | undefined = undefined;

    const candidateModels = [
      this.model,
      ...this.fallbackModels.filter((m) => m !== this.model),
    ];

    try {
      const tools: Record<string, any> = {};
      
      if (input.executeSearchJobListings) {
        tools.searchJobListings = tool({
          description: "Search for specific job listings based on criteria.",
          inputSchema: z.object({
            roles: z.array(z.string()).default([]).describe("Target job titles (e.g. ['React Developer'])"),
            locations: z.array(z.string()).default([]).describe("Target locations (e.g. ['London']). Do not include 'remote' here."),
            workModes: z.array(z.enum(["remote", "hybrid", "onsite"])).default([]).describe("Work modes"),
            experienceLevels: z.array(z.string()).default([]).describe("e.g. entry, mid, senior, lead"),
          }),
          execute: async (args: any) => {
            const res = await input.executeSearchJobListings!(args);
            if (res.uiPayload) capturedUiPayload = res.uiPayload;
            return res.summaryText;
          },
        });
      }

      if (input.executeRecommendRoleCategories) {
        tools.recommendRoleCategories = tool({
          description: "Recommend types of roles the user should apply for and assess their fit (NOT job listings). You MUST generate the role recommendations here.",
          inputSchema: z.object({
            focusArea: z.string().optional().describe("A specific area to focus on if mentioned"),
            roles: z.array(z.object({
              title: z.string(),
              rationale: z.string().default("").describe("Why this role fits, referencing the user's skills/projects. Keep it short."),
            })).default([]).describe("The recommended roles based on the CAREER_SNAPSHOT"),
          }),
          execute: async (args: any) => {
            const res = await input.executeRecommendRoleCategories!(args);
            if (res.uiPayload) capturedUiPayload = res.uiPayload;
            return res.summaryText;
          },
        });
      }

      if (input.executeSuggestGrowthAction) {
        tools.suggestGrowthAction = tool({
          description: "Suggest a specific project or skill to learn next. You MUST generate the project idea and provide concrete values for ALL parameters. Do NOT leave project or gapType empty.",
          inputSchema: z.object({
            gapArea: z.string().describe("The specific gap or skill area to focus on, derived from the user's request (e.g. '.NET development')"),
            project: z.string().describe("A short, concrete project or skill to build. MUST NOT BE EMPTY."),
            gapType: z.enum(["skill", "evidence", "visibility", "qualification"]).describe("The type of gap this addresses. MUST NOT BE EMPTY."),
          }),
          execute: async (args: any) => {
            const res = await input.executeSuggestGrowthAction!(args);
            if (res.uiPayload) capturedUiPayload = res.uiPayload;
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
            return res.summaryText;
          },
        });
      }

      if (input.executeCv) {
        tools.generateCv = tool({
          description: "Tailor or generate a CV for a specific job",
          inputSchema: z.object({
            jobTitle: z.string().describe("Target role title"),
            organizationName: z.string().optional().describe("Company name"),
            jobDescription: z.string().optional().describe("Job description or user's instructions for the CV"),
            context: z.string().optional().describe("Summary of the user's instructions from the chat context (at least last 3 messages)"),
            pages: z.enum(["one_page", "two_page"]).optional().describe("Number of pages. If user asks for 2 pages, pass 'two_page'."),
          }),
          execute: async (args: any) => {
            const res = await input.executeCv!(args);
            if (res.uiPayload) capturedUiPayload = res.uiPayload;
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
            return res.summaryText;
          },
        });
      }

      const prompt = [
        "<CAREER_SNAPSHOT>",
        JSON.stringify(compactSnapshot(input.snapshot)),
        "</CAREER_SNAPSHOT>",
        ...(input.preferredName ? ["<PREFERRED_NAME>", input.preferredName, "</PREFERRED_NAME>"] : []),
        ...(input.previousSummary ? ["<CONVERSATION_SUMMARY>", input.previousSummary, "</CONVERSATION_SUMMARY>"] : []),
        "<RECENT_CONVERSATION>",
        ...input.recentMessages.slice(-8).map(
          (item) => `${item.role}: ${item.content.slice(0, 800)}`,
        ),
        "</RECENT_CONVERSATION>",
        "<USER_MESSAGE>",
        input.message,
        "</USER_MESSAGE>",
      ].join("\n");

      let lastError: unknown;
      for (const modelId of candidateModels) {
        try {
          const decision = await this.keyPool.withKey(
            async (apiKey) => {
              const result = await generateText({
                model: this.keyPool.createModel(apiKey, modelId),
                system: HERMES_SYSTEM_PROMPT,
                temperature: 0.3,
                maxRetries: 1,
                maxOutputTokens: 1200,
                // @ts-expect-error - Some versions of AI SDK use maxSteps or maxToolRoundtrips
                maxSteps: 4, // room for a tool call, a possible follow-up tool call, then the final reply
                tools,
                prompt,
              });

              const rawText = result.text.trim();
              const { thinking, answer } = parseHermesThinking(rawText);

              return {
                answer: answer || rawText || deterministicReply(input.message, input.snapshot),
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

