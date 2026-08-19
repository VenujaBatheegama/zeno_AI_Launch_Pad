import { generateText, Output } from "ai";
import { z } from "zod";

import {
  GroqKeyPool,
  isGroqRateLimited,
} from "@/lib/ai/groq-key-pool";

import type { CoverLetterGenerator } from "../application/ports";
import { CareerCampaignError } from "../domain/errors";
import { coverLetterDraftSchema } from "../domain/schemas";

const COVER_LETTER_PROMPT_VERSION = "cover-letter-v2";

const modelOutputSchema = z.object({
  draft: z.string().min(40).max(4000),
  claims: z
    .array(
      z.object({
        text: z.string(),
        evidenceFactIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  acknowledgedGaps: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export class GroqCoverLetterGenerator implements CoverLetterGenerator {
  private readonly keyPool: GroqKeyPool;

  constructor(
    apiKeys: string | string[] | GroqKeyPool,
    private readonly model: string,
    private readonly fallbackModels: string[] = [],
  ) {
    this.keyPool =
      apiKeys instanceof GroqKeyPool
        ? apiKeys
        : new GroqKeyPool(Array.isArray(apiKeys) ? apiKeys : [apiKeys]);
  }

  async generate(input: {
    evidenceJson: unknown;
    jobTitle: string;
    organizationName: string | null;
    jobDescription: string;
    matchedRequirements: string[];
    missingRequirements: string[];
    applicationUrl: string | null;
  }): Promise<{ draft: string; meta: Record<string, unknown> }> {
    const models = [
      this.model,
      ...this.fallbackModels.filter((m) => m !== this.model),
    ];
    let lastError: unknown;

    for (const modelId of models) {
      try {
        return await this.generateWithModel(modelId, input);
      } catch (error) {
        lastError = error;
        if (
          error instanceof CareerCampaignError &&
          error.code === "INVALID_AI_OUTPUT"
        ) {
          throw error;
        }
        void isGroqRateLimited(error);
      }
    }

    const fallback = buildDeterministicFallback(input);
    if (fallback) {
      return {
        draft: fallback,
        meta: {
          model: "deterministic-fallback",
          promptVersion: COVER_LETTER_PROMPT_VERSION,
          warnings: ["AI cover letter unavailable; deterministic draft used."],
        },
      };
    }

    throw new CareerCampaignError(
      "AI_UNAVAILABLE",
      "Could not generate a cover letter draft.",
      { cause: lastError },
    );
  }

  private async generateWithModel(
    modelId: string,
    input: {
      evidenceJson: unknown;
      jobTitle: string;
      organizationName: string | null;
      jobDescription: string;
      matchedRequirements: string[];
      missingRequirements: string[];
      applicationUrl: string | null;
    },
  ) {
    return this.keyPool.withKey(async (apiKey) => {
      const cleanSkills = extractCleanSkillNames(input.missingRequirements);

      const { output } = await generateText({
        model: this.keyPool.createModel(apiKey, modelId),
        temperature: 0.2,
        maxRetries: 1,
        maxOutputTokens: 2048,
        output: Output.object({ schema: modelOutputSchema }),
        system: `You are an expert hiring manager and executive career coach writing a high-converting, tailored cover letter based strictly on verified candidate evidence.

THE 4-PARAGRAPH STRUCTURE (FROM A HIRING MANAGER'S PERSPECTIVE):
Keep the letter to 3-4 concise paragraphs, strictly under 320 words (never exceed 350 words).

1. PARAGRAPH 1 — HOOK + ROLE CLARITY (2-3 sentences):
   - State the target role and company, leading with a sharp, compelling reason the candidate is a strong fit.
   - DO NOT start with boring clichés ("I am writing to apply for...", "Please accept my resume...", "My verified experience aligns with...").
   - Open with immediate energy and technical relevance.

2. PARAGRAPH 2 — PROOF & ACCOMPLISHMENTS (Situation → Action → Result):
   - Spotlight 1 or 2 key accomplishments or projects from <VERIFIED_EVIDENCE> that map directly to the job requirements.
   - Detail what the candidate actually built, the tools used (e.g. Java, Spring Boot, Flutter, Dart, React, Docker, Python), architectural problem-solving, and tangible outcomes.
   - Favor the candidate: frame academic, side, or early-career projects with high engineering ownership, curiosity, and standards.

3. PARAGRAPH 3 — WHY THIS COMPANY & TRANSFERABLE VALUE (1-2 sentences):
   - Connect the candidate's core strengths and rapid learning agility specifically to the target company's mission, product, or engineering domain.
   - If there are tech stack gaps, never apologize or sound defensive; frame it as eager adaptability that builds on strong fundamentals.

4. PARAGRAPH 4 — CONFIDENT CLOSE (1-2 sentences):
   - Restate genuine interest, invite next steps/discussion, and thank them. No begging or passive filler.

CRITICAL INTEGRITY & TONE RULES:
- Use ONLY facts and projects that exist in <VERIFIED_EVIDENCE>. Never invent employers, degrees, metrics, or technologies.
- Never output internal audit jargon (e.g. "verified evidence mentions", "only 1 of 3 concrete technologies").
- Tone: Confident, conversational, warm, and professional.
- Format: Begin with "Dear Hiring Team," (or "Dear Hiring Manager,") and end with "Sincerely,\n[Candidate Name]".

Return structured output matching the schema.`,
        prompt: [
          `Target Role: ${input.jobTitle}`,
          `Target Organization: ${input.organizationName ?? "the team"}`,
          "<KEY_JOB_REQUIREMENTS>",
          JSON.stringify(input.matchedRequirements.slice(0, 10)),
          "</KEY_JOB_REQUIREMENTS>",
          "<JOB_DESCRIPTION>",
          input.jobDescription.slice(0, 5000),
          "</JOB_DESCRIPTION>",
          "<VERIFIED_EVIDENCE>",
          JSON.stringify(input.evidenceJson),
          "</VERIFIED_EVIDENCE>",
        ].join("\n"),
      });

      const parsed = coverLetterDraftSchema.parse(output);
      assertNoInventedSkills(parsed.draft, cleanSkills);

      return {
        draft: parsed.draft,
        meta: {
          model: modelId,
          promptVersion: COVER_LETTER_PROMPT_VERSION,
          claims: parsed.claims,
          acknowledgedGaps: parsed.acknowledgedGaps,
          warnings: parsed.warnings,
          generatedAt: new Date().toISOString(),
        },
      };
    });
  }
}

function extractCleanSkillNames(rawItems: string[]): string[] {
  const clean: string[] = [];
  for (const item of rawItems) {
    const trimmed = item.trim();
    // Skip full debug sentences
    if (trimmed.length > 50 || /verified|evidence|requirement|specifically|generic/i.test(trimmed)) {
      continue;
    }
    if (trimmed.length >= 2) {
      clean.push(trimmed);
    }
  }
  return clean;
}

function assertNoInventedSkills(draft: string, missingSkills: string[]) {
  const lower = draft.toLocaleLowerCase();
  for (const skill of missingSkills) {
    const token = skill.trim().toLocaleLowerCase();
    if (token.length < 3) continue;
    const claimPatterns = [
      new RegExp(
        `\\b(proficient|expert|experienced)\\b[^.\\n]{0,40}${escapeRegExp(token)}`,
        "i",
      ),
      new RegExp(
        `${escapeRegExp(token)}[^.\\n]{0,40}\\b(years?|expert|proficient)\\b`,
        "i",
      ),
    ];
    if (claimPatterns.some((pattern) => pattern.test(lower))) {
      throw new CareerCampaignError(
        "INVALID_AI_OUTPUT",
        `Cover letter claimed unsupported skill: ${skill}`,
      );
    }
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDeterministicFallback(input: {
  evidenceJson: unknown;
  jobTitle: string;
  organizationName: string | null;
  matchedRequirements: string[];
  missingRequirements: string[];
}): string | null {
  const company = input.organizationName ?? "your team";
  const evidence = (input.evidenceJson ?? {}) as {
    profile?: { full_name?: string; summary?: string };
    projects?: Array<{ name?: string; role?: string; bullets?: string[]; technologies?: string[] }>;
    work_experience?: Array<{ employer?: string; role?: string; bullets?: string[] }>;
    skills?: Array<{ name?: string }>;
    education?: Array<{ institution?: string; qualification?: string; field_of_study?: string }>;
  };

  const name = evidence.profile?.full_name?.trim() || "Candidate";
  const topProject = evidence.projects?.[0];
  const topExperience = evidence.work_experience?.[0];
  const skillsList = (evidence.skills ?? [])
    .map((s) => s.name)
    .filter(Boolean)
    .slice(0, 5)
    .join(", ");

  let proofParagraph = "";
  if (topProject) {
    const tech = topProject.technologies?.length ? ` using ${topProject.technologies.slice(0, 3).join(", ")}` : "";
    const bullet = topProject.bullets?.[0] ? ` Specifically, ${topProject.bullets[0]}` : "";
    proofParagraph = `In my work on ${topProject.name ?? "recent technical projects"}${tech}, I focused on architecting reliable solutions and delivering measurable results.${bullet}`;
  } else if (topExperience) {
    const bullet = topExperience.bullets?.[0] ? ` During this time, ${topExperience.bullets[0]}` : "";
    proofParagraph = `As ${topExperience.role ?? "Engineer"} at ${topExperience.employer ?? "my previous company"}, I contributed to core product features and engineering workflows.${bullet}`;
  } else if (skillsList) {
    proofParagraph = `My technical background centers on hands-on software development with ${skillsList}, with an emphasis on clean architecture, problem-solving, and continuous learning.`;
  } else {
    proofParagraph = `My background combines structured problem-solving with a dedication to engineering high-quality, maintainable software.`;
  }

  const role = input.jobTitle || "Software Engineer";

  return [
    `Dear Hiring Team,`,
    `I am excited to bring my technical foundation and problem-solving drive to the ${role} position at ${company}. With hands-on experience building modern digital applications, I am eager to contribute immediately to your engineering goals.`,
    proofParagraph,
    `What draws me to ${company} is your focus on engineering excellence and impactful technology. I thrive in collaborative environments where I can tackle challenging problems, quickly adapt to new tools, and deliver scalable value.`,
    `I would welcome the opportunity to discuss how my background aligns with your team's needs. Thank you for your time and consideration.`,
    `Sincerely,\n${name}`,
  ].join("\n\n");
}

