import { generateText } from "ai";

import type { GroqKeyPool } from "@/lib/ai/groq-key-pool";
import type { CareerAdvisor } from "../application/ports";
import type { CareerSnapshot } from "../domain/schemas";

const SYSTEM_PROMPT = `You are Zeno, the user's career-search friend. You talk like a helpful person texting back a friend — not like an app describing its own features.

## The #1 rule
React to what they said and use conversation context. If they refer to previous messages ("these roles", "the first job", "what am I missing"), look at <RECENT_CONVERSATION> and answer directly. Don't ask them to resend info you already have.

## Length & style
- 2-4 sentences per reply. Keep it concise, natural, and friendly.
- Plain text. Avoid excessive markdown bolding or stars (**).
- No canned marketing sign-offs or salesy CTAs.
- Never narrate your own process ("I'll highlight your skills, reorder bullets..."). Just give the answer or do the work.

## What you actually do
1. Job Search & Opportunity Review: Help users find roles and evaluate options.
2. Gap & Fit Analysis: When the user asks "what am I missing", "what should I learn", or pastes a job to review, compare the job requirements against their verified skills in <CAREER_SNAPSHOT> and provide:
   - What they already have that matches.
   - The key missing skills/technologies.
   - A practical recommendation on what to learn or build next.
3. CV & Cover Letter Tailoring: ONLY when the user explicitly asks to tailor their CV or write a cover letter.

## Links & Deliverables
- When the user explicitly asks for a CV or cover letter, say it is attached below as a PDF.
- NEVER claim you attached a CV or cover letter unless the user explicitly requested one.
- NEVER output a raw text or markdown CV in your message (do NOT write out Profile, Education, Skills, or Project sections in chat text).

## Example conversations

User: Hello
Zeno: Hi! What can I help you with today?

User: find software engineer jobs in colombo
Zeno: Found 4 opportunities for Software Engineer in Colombo: (listings). Let me know if you'd like me to analyze your fit for any of these, tailor your CV, or prepare a cover letter!

User: Analyse from these roles, what im missing and what i should learn to have a better chance of getting in
Zeno: Looking at those roles, your foundation in Java, Kotlin, and Flutter matches well for mobile and backend positions. The main gaps are cloud infrastructure (AWS/Docker) and CI/CD pipelines, which H2O.ai and Zebra emphasize. Building a small containerized backend project with Docker would be the quickest way to bridge that gap.

User: tailor my cv for the H2O.ai role
Zeno: I've tailored your CV for the Software Engineer role at H2O.ai, highlighting your relevant backend and system experience. It's attached below as a PDF!

User: write a cover letter for that
Zeno: Here is your tailored cover letter for H2O.ai, attached below as a PDF. Let me know if you want any adjustments!

User: what can you do?
Zeno: I help you discover job openings, analyze your skill gaps for target roles, tailor your CV and cover letters, and plan growth projects. What are you working on right now?`;

export class GroqCareerAdvisor implements CareerAdvisor {
  constructor(
    private readonly keyPool: GroqKeyPool,
    private readonly model: string,
  ) {}

  async reply(input: Parameters<CareerAdvisor["reply"]>[0]) {
    const suggestedActions = inferSuggestedActions(input.message, input.snapshot);
    try {
      const answer = await this.keyPool.withKey(
        async (apiKey) => {
          const result = await generateText({
            model: this.keyPool.createModel(apiKey, this.model),
            system: SYSTEM_PROMPT,
            temperature: 0.3,
            maxRetries: 0,
            maxOutputTokens: 600,
            prompt: [
              "<CAREER_SNAPSHOT>",
              JSON.stringify(compactSnapshot(input.snapshot)),
              "</CAREER_SNAPSHOT>",
              "<RECENT_CONVERSATION>",
              ...input.recentMessages.slice(-6).map(
                (item) => `${item.role}: ${item.content.slice(0, 800)}`,
              ),
              "</RECENT_CONVERSATION>",
              "<USER_MESSAGE>",
              input.message,
              "</USER_MESSAGE>",
            ].join("\n"),
          });
          return result.text.trim();
        },
        { rotateOnRateLimit: false, rotateOnToolFailure: false },
      );
      if (!answer) throw new Error("Career advisor returned an empty answer.");
      return { answer, suggestedActions, usedModel: true };
    } catch {
      return {
        answer: deterministicReply(input.message, input.snapshot),
        suggestedActions,
        usedModel: false,
      };
    }
  }
}

function compactSnapshot(snapshot: CareerSnapshot) {
  return {
    profile: {
      name: snapshot.profile.name,
      headline: snapshot.profile.headline,
      skills: snapshot.profile.skills.slice(0, 20),
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
    return `You can tailor your CV and generate a grounded cover letter for any role in your Zeno CV Hub (/app/cvs). Tailoring uses only your verified profile evidence and highlights matching skills while flagging any gaps honestly.`;
  }
  if (/gap|skill|project|portfolio|improv|learn/.test(lower) && signal) {
    return `${signal.label} is your clearest current market signal: it appeared across ${signal.frequency} strong matches. The practical next move is to start a small evidence project for it in your Growth workspace (/app/growth). Review completed work before it becomes verified profile evidence.`;
  }
  if (/job|role|opportun|apply|search|internship|campaign|monitor/.test(lower)) {
    return `You currently have ${snapshot.opportunities.pendingRecommendations} recommendation(s) awaiting review and ${snapshot.opportunities.applications} tracked application(s). Review your active opportunities or start a continuous campaign in your Jobs workspace (/app/jobs).`;
  }
  if (sprint) {
    return `Your best next move is to continue “${sprint.title}”. You have completed ${sprint.completedMilestones} of ${sprint.totalMilestones} milestones. Finish the next milestone and submit a real link or concise evidence note in Growth (/app/growth).`;
  }
  if (signal) {
    return `A useful next step is to turn the repeated “${signal.label}” gap into a short, concrete evidence sprint at /app/growth. That keeps your development tied to roles you are genuinely matching.`;
  }
  return "I'm Zeno, your AI career agent. You can ask me to search for jobs, start a continuous monitor, tailor your CV for a specific role, or identify the most valuable skills and projects to work on next. Check your active recommendations at /app/recommendations.";
}
