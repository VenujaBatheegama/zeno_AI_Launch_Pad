import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";

import {
  getCurrentScriptStep,
  pickScriptAsk,
} from "./conversation-script";

export type OnboardingStage =
  | "about_you"
  | "education"
  | "experience"
  | "projects"
  | "skills"
  | "certifications"
  | "achievements"
  | "links"
  | "review";

/** CV top-down order: identity → experience → projects → education → … */
export const ONBOARDING_STAGES: OnboardingStage[] = [
  "about_you",
  "experience",
  "projects",
  "education",
  "skills",
  "certifications",
  "achievements",
  "links",
  "review",
];

export type ConversationMessage = {
  id: string;
  role: "zeno" | "user";
  text: string;
};

export type OnboardingConversationState = {
  stage: OnboardingStage;
  questionKey: string;
  messages: ConversationMessage[];
  draftEvidence: CareerEvidence;
  lastAnswerRaw?: string;
  updatedFieldPaths: string[];
};

export function stageLabel(stage: OnboardingStage): string {
  const labels: Record<OnboardingStage, string> = {
    about_you: "About you",
    education: "Education",
    experience: "Experience",
    projects: "Projects",
    skills: "Skills",
    certifications: "Certifications",
    achievements: "Achievements",
    links: "Links",
    review: "Review",
  };
  return labels[stage];
}

export function progressForStage(stage: OnboardingStage): number {
  const index = ONBOARDING_STAGES.indexOf(stage);
  if (index < 0) return 0;
  return Math.round((index / (ONBOARDING_STAGES.length - 1)) * 100);
}

export function nextQuestion(input: {
  stage: OnboardingStage;
  evidence: CareerEvidence;
  completedScriptKeys?: readonly string[];
}): { questionKey: string; prompt: string; suggestions?: string[] } {
  // Script is the source of truth for CV top-down order; stage is advisory.
  const step = getCurrentScriptStep(
    input.evidence,
    input.completedScriptKeys ?? [],
  );
  return {
    questionKey: step.key,
    prompt: pickScriptAsk(step),
  };
}

export function advanceStage(stage: OnboardingStage): OnboardingStage {
  const index = ONBOARDING_STAGES.indexOf(stage);
  return ONBOARDING_STAGES[Math.min(index + 1, ONBOARDING_STAGES.length - 1)]!;
}

export function emptyCareerEvidence(): CareerEvidence {
  return {
    schema_version: 1,
    profile: {
      full_name: null,
      email: null,
      phone: null,
      location: null,
      summary: null,
      linkedin_url: null,
      github_url: null,
      portfolio_url: null,
    },
    work_experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    achievements: [],
    references: [],
    warnings: [],
  };
}
