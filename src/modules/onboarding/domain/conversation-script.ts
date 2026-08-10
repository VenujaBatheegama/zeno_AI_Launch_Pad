import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";

import type { OnboardingStage } from "./conversation-machine";

export type ScriptStep = {
  key: string;
  stage: OnboardingStage;
  /** Canonical question Zeno should ask. */
  ask: string;
  /** Natural alternative wordings — Zeno may use one of these instead. */
  fillers: string[];
  optional?: boolean;
  isComplete: (
    evidence: CareerEvidence,
    completedKeys: ReadonlySet<string>,
  ) => boolean;
};

/**
 * CV top-down collection script. Application code picks the first incomplete
 * step; the LLM may rephrase with fillers but must not skip ahead.
 */
export const CONVERSATION_SCRIPT: ScriptStep[] = [
  {
    key: "preferred_name",
    stage: "about_you",
    ask: "What name should appear at the top of your CV?",
    fillers: [
      "First, what preferred name should we put on your CV?",
      "What full name do you want recruiters to see on your CV?",
    ],
    isComplete: (evidence) => Boolean(evidence.profile.full_name?.trim()),
  },
  {
    key: "email",
    stage: "about_you",
    ask: "What’s the best email for recruiters to reach you?",
    fillers: [
      "Great. What’s the email we should list on the CV?",
      "Which email should appear in your contact details?",
    ],
    isComplete: (evidence) => Boolean(evidence.profile.email?.trim()),
  },
  {
    key: "phone",
    stage: "about_you",
    ask: "Do you want to include a phone number on the CV? If yes, what’s the number — or say skip.",
    fillers: [
      "Would you like a phone number on the CV, or should we skip that?",
      "Any phone number to include, or prefer to leave it off?",
    ],
    optional: true,
    isComplete: (evidence, completed) =>
      completed.has("phone") || Boolean(evidence.profile.phone?.trim()),
  },
  {
    key: "location",
    stage: "about_you",
    ask: "Where are you based right now?",
    fillers: [
      "Where should we list as your location?",
      "Which city or region are you based in?",
    ],
    isComplete: (evidence, completed) =>
      completed.has("location") || Boolean(evidence.profile.location?.trim()),
  },
  {
    key: "summary",
    stage: "about_you",
    ask: "In one or two sentences, how should your CV summary describe you and the roles you’re targeting?",
    fillers: [
      "How would you describe yourself in a short CV summary — who you are and what you’re aiming for?",
      "Give me a brief professional summary for the top of your CV.",
    ],
    optional: true,
    isComplete: (evidence, completed) =>
      completed.has("summary") || Boolean(evidence.profile.summary?.trim()),
  },
  {
    key: "experience_entry",
    stage: "experience",
    ask: "Let’s add your most recent experience. What was your role, and where did you work?",
    fillers: [
      "Starting with work experience — what’s your current or most recent role and company?",
      "Tell me your latest job title and employer.",
    ],
    isComplete: (evidence, completed) =>
      evidence.work_experience.length > 0 &&
      !completed.has("collecting_another_experience"),
  },
  {
    key: "experience_details",
    stage: "experience",
    ask: "What did you personally build, maintain, or improve in that role?",
    fillers: [
      "What were your main responsibilities or contributions there?",
      "What did you personally work on in that role?",
    ],
    isComplete: (evidence) => {
      const latest = evidence.work_experience.at(-1);
      return Boolean(latest && latest.bullets.length > 0);
    },
  },
  {
    key: "experience_dates",
    stage: "experience",
    ask: "When did that role start, and has it ended? Month and year is enough.",
    fillers: [
      "What were the start and end dates for that role?",
      "When did you start there, and is it current or finished?",
    ],
    isComplete: (evidence) => {
      const latest = evidence.work_experience.at(-1);
      return Boolean(latest?.start_date);
    },
  },
  {
    key: "experience_more",
    stage: "experience",
    ask: "Do you have another role to add, or shall we move on to projects?",
    fillers: [
      "Want to add another work experience, or continue to projects?",
      "Any other roles to include before we talk about projects?",
    ],
    optional: true,
    isComplete: (_evidence, completed) => completed.has("experience_more"),
  },
  {
    key: "project_entry",
    stage: "projects",
    ask: "Tell me about a project you’d like on the CV — the name, what you built, and the technologies you personally used.",
    fillers: [
      "Let’s cover projects. What’s one project we should include?",
      "Share a project name, what you did, and the tech you used.",
    ],
    isComplete: (evidence, completed) =>
      evidence.projects.length > 0 && !completed.has("collecting_another_project"),
  },
  {
    key: "project_more",
    stage: "projects",
    ask: "Do you have another project to add, or shall we move on to education?",
    fillers: [
      "Want to add another project, or continue to education?",
      "Any other projects worth including before education?",
    ],
    optional: true,
    isComplete: (_evidence, completed) => completed.has("project_more"),
  },
  {
    key: "education_entry",
    stage: "education",
    ask: "What’s your most recent qualification, field of study, and institution?",
    fillers: [
      "Next is education — what’s your latest degree or qualification and where did you study?",
      "Tell me your education: qualification, field, and school or university.",
    ],
    isComplete: (evidence, completed) =>
      evidence.education.length > 0 &&
      !completed.has("collecting_another_education"),
  },
  {
    key: "education_more",
    stage: "education",
    ask: "Do you want to add another education entry, or continue to skills?",
    fillers: [
      "Any other education to include, or shall we move to skills?",
      "Want another education record, or continue?",
    ],
    optional: true,
    isComplete: (_evidence, completed) => completed.has("education_more"),
  },
  {
    key: "skills_entry",
    stage: "skills",
    ask: "Which tools, languages, or technologies have you personally used? You can list several at once.",
    fillers: [
      "Let’s capture skills — list the technologies you’ve personally used.",
      "What skills and tools should appear on your CV?",
    ],
    isComplete: (evidence) => evidence.skills.length >= 3,
  },
  {
    key: "certifications_entry",
    stage: "certifications",
    ask: "Any certifications worth including? If none, just say skip.",
    fillers: [
      "Do you have certifications to add, or should we skip that section?",
      "Any course certificates or professional certs for the CV?",
    ],
    optional: true,
    isComplete: (evidence, completed) =>
      completed.has("certifications_entry") ||
      evidence.certifications.length > 0,
  },
  {
    key: "achievements_entry",
    stage: "achievements",
    ask: "Any awards, competitions, or standout results to include? Say skip if none.",
    fillers: [
      "Any achievements or awards for the CV, or skip?",
      "Want to add competition results or awards, or move on?",
    ],
    optional: true,
    isComplete: (evidence, completed) =>
      completed.has("achievements_entry") || evidence.achievements.length > 0,
  },
  {
    key: "links_entry",
    stage: "links",
    ask: "Share LinkedIn, GitHub, or portfolio links if you have them — or say skip.",
    fillers: [
      "Any LinkedIn, GitHub, or portfolio links to add?",
      "Want to include professional links, or skip for now?",
    ],
    optional: true,
    isComplete: (evidence, completed) =>
      completed.has("links_entry") ||
      Boolean(
        evidence.profile.linkedin_url ||
          evidence.profile.github_url ||
          evidence.profile.portfolio_url,
      ),
  },
  {
    key: "review",
    stage: "review",
    ask: "Your draft is on the right. Take a look, edit anything that needs fixing, then verify when you’re happy.",
    fillers: [
      "That’s enough to review. Check the live profile on the right, then verify when it looks right.",
      "We’ve covered the main CV sections. Review the profile panel and verify when you’re ready.",
    ],
    isComplete: () => true,
  },
];

export function getCurrentScriptStep(
  evidence: CareerEvidence,
  completedKeys: readonly string[] = [],
): ScriptStep {
  const completed = new Set(completedKeys);
  for (const step of CONVERSATION_SCRIPT) {
    if (step.key === "review") return step;
    if (!step.isComplete(evidence, completed)) return step;
  }
  return CONVERSATION_SCRIPT.at(-1)!;
}

export function pickScriptAsk(step: ScriptStep, seed = 0): string {
  if (step.fillers.length === 0) return step.ask;
  return step.fillers[Math.abs(seed) % step.fillers.length] ?? step.ask;
}

export function openingScriptMessage(): string {
  return [
    "Hi, I’m Zeno. I’ll help you build a career profile we can use for job matching and tailored CVs.",
    "You’ll be able to review and edit everything before confirming it.",
    "",
    pickScriptAsk(CONVERSATION_SCRIPT[0]!),
  ].join("\n");
}

export function formatScriptBrief(step: ScriptStep): string {
  return [
    `Required next step key: ${step.key}`,
    `Required stage: ${step.stage}`,
    `You MUST ask this question yourself in assistantMessage (or a close filler): ${step.ask}`,
    `Allowed fillers: ${step.fillers.join(" | ")}`,
    step.optional
      ? "This step is optional — if the user says skip/none/no, set intent to skip and advance without inventing data."
      : "This step is required — keep asking until the user provides the information.",
    "Never put questions or prompts into suggestedReplies. Always return suggestedReplies as [].",
    "Do not jump ahead to later CV sections. Stay on this step until it is satisfied.",
    "You carry the conversation — the user should only answer, never receive your questions as suggestion chips.",
  ].join("\n");
}

export function looksLikeSkipOrContinue(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return /^(skip(\s+for\s+now)?|none|no(\s+thanks?)?|n\/a|na|pass|continue|next|nope|nothing|not really|move on|no more|that's all|thats all|done)\b/.test(
    normalized,
  );
}

export function looksLikeAddAnother(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return /^(yes|yep|yeah|add (another|one|more)|another|one more)\b/.test(
    normalized,
  );
}

/**
 * After applying ops / interpreting intent, mark optional/more steps complete
 * when the user skips or continues, so the script can advance.
 */
export function advanceCompletedScriptKeys(input: {
  beforeEvidence: CareerEvidence;
  afterEvidence: CareerEvidence;
  completedKeys: readonly string[];
  userMessage: string;
  intent?: string;
}): string[] {
  const completed = new Set(input.completedKeys);
  const current = getCurrentScriptStep(input.beforeEvidence, [...completed]);
  const skip =
    input.intent === "skip" ||
    input.intent === "continue" ||
    looksLikeSkipOrContinue(input.userMessage);
  const addAnother =
    input.intent === "add_another" || looksLikeAddAnother(input.userMessage);

  if (current.key === "experience_more") {
    if (addAnother) {
      completed.add("collecting_another_experience");
      completed.delete("experience_more");
    } else if (skip) {
      completed.add("experience_more");
    }
    return [...completed];
  }
  if (current.key === "project_more") {
    if (addAnother) {
      completed.add("collecting_another_project");
      completed.delete("project_more");
    } else if (skip) {
      completed.add("project_more");
    }
    return [...completed];
  }
  if (current.key === "education_more") {
    if (addAnother) {
      completed.add("collecting_another_education");
      completed.delete("education_more");
    } else if (skip) {
      completed.add("education_more");
    }
    return [...completed];
  }

  if (current.optional && skip) {
    completed.add(current.key);
  }

  // New records clear the "collecting another" flags.
  if (
    input.afterEvidence.work_experience.length >
    input.beforeEvidence.work_experience.length
  ) {
    completed.delete("collecting_another_experience");
  }
  if (
    input.afterEvidence.projects.length > input.beforeEvidence.projects.length
  ) {
    completed.delete("collecting_another_project");
  }
  if (
    input.afterEvidence.education.length > input.beforeEvidence.education.length
  ) {
    completed.delete("collecting_another_education");
  }

  return [...completed];
}

export function ensureAssistantAsksScriptStep(
  assistantMessage: string,
  nextStep: ScriptStep,
  seed = 0,
): string {
  const ask = pickScriptAsk(nextStep, seed);
  const trimmed = assistantMessage.trim();
  if (!trimmed) return ask;

  if (nextStep.key === "review") {
    return trimmed.includes("?") ? trimmed : `${trimmed}\n\n${ask}`;
  }

  const lower = trimmed.toLowerCase();
  const askLower = nextStep.ask.toLowerCase();
  const alreadyAsksScript =
    lower.includes(askLower.slice(0, 28)) ||
    nextStep.fillers.some((filler) =>
      lower.includes(filler.toLowerCase().slice(0, 28)),
    );

  if (alreadyAsksScript) return trimmed;

  // Keep a short acknowledgement, then always ask the scripted next question
  // so the agent carries the conversation in CV order.
  const ack = trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.endsWith("?"));
  if (ack && ack.length <= 180) return `${ack}\n\n${ask}`;
  return ask;
}
