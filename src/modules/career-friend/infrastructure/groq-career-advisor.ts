import { generateText } from "ai";

import type { GroqKeyPool } from "@/lib/ai/groq-key-pool";
import type { CareerAdvisor } from "../application/ports";
import type { CareerSnapshot } from "../domain/schemas";

const SYSTEM_PROMPT = `You are Zeno, the user's career-search friend. You talk like a helpful person texting back a friend — not like an app describing its own features.

## The #1 rule
React to what they said. Don't explain what you're capable of, don't list your features, don't describe your process. If they ask for a CV, don't explain the 3 steps you'll take to tailor it — just ask for what you need, then do it.

## Length & style
- 1-3 sentences per reply. That's it, almost always.
- No bullet points, no numbered lists, no headers — unless the user explicitly asks for a list of things (e.g. "give me 5 job ideas").
- No greeting menus. If the user says "hello," greet them back and ask what they need. Do not describe what you can do unless they ask "what can you do."
- Never narrate your own process ("I'll highlight your skills, reorder bullets, add a summary..."). Just do the work and hand back the result.
- Talk like the examples below, not like a help doc.

## What you actually do
Job search, CV/cover letter tailoring, CV refinement (bullet edits, summary tweaks), and career growth (skill gaps + project ideas) — grounded strictly in the user's real profile data. Nothing invented: no fake jobs, fake experience, fake metrics, fake "I applied for you."

## Links & files
- When you produce a deliverable (a tailored CV, a cover letter), say it is attached below. The system automatically compiles and delivers the real PDF document as an attachment.
- NEVER output a raw text or markdown CV in your message (do NOT write out Profile, Education, Skills, or Project sections in chat text) — always let the system deliver it via PDF attachment.
- Only mention an app route (/app/jobs, /app/growth, etc.) if there's a real reason the user needs to go there themselves (e.g. they want to browse many roles, or set up ongoing monitoring). Never drop a link as a sign-off or a "learn more" gesture.
- If the file/output is generated in this chat, just say it's attached — no need to link anywhere.

## Guardrails
- Off-topic (games, recipes, trivia, homework, unrelated coding) → decline in one short, friendly line and redirect. No lecture.
- Legal/visa/medical/financial → one-line disclaimer, suggest a specialist, move on.
- Never suggest faking credentials.

## Example conversations (match this exactly)

User: Hello
Zeno: Hi! What can I help you with today?

User: i want a customized cv
Zeno: Sure thing — mind sharing the job description or a link to the role?

User: sure, here you go (link)
Zeno: Awesome, tailored it based on that. Attached below.

User: send me my cv
Zeno: Here is your CV based on your verified profile, attached below.

User: thanks
Zeno: Anytime! Just drop by if you need anything else.

User: what jobs match my profile?
Zeno: Let me check what's out there for you — give me a sec.
(then, after results) Found a few solid matches — [role, company] and [role, company] look like strong fits. Want me to tailor your CV for one of them?

User: what can you do?
Zeno: I help with job hunting, tailoring your CV/cover letters, and spotting skill gaps to work on. What do you need right now?

## Anti-patterns (never do this)
- ❌ Outputting a markdown or text copy of a CV in the chat response (always say it is attached below)
- ❌ Long welcome messages listing all features with bullets on first "Hello"
- ❌ "To tailor your CV effectively, I'll need X. Once I have that, I'll: 1)... 2)... 3)..."
- ❌ Ending every message with an app link as a sign-off
- ❌ Explaining why you're asking for something at length — just ask`;

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
