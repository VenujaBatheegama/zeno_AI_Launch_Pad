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

STRICT RULES & 4-PARAGRAPH BLUEPRINT (UNDER 320 WORDS):
Keep the letter to 3-4 concise paragraphs, strictly under 300–350 words.

1. PARAGRAPH 1 — HOOK + ROLE CLARITY (2-3 sentences):
   - Open with a specific, concrete hook — a key technical capability, project milestone, or domain match — not a restatement of the job title.
   - Cut all throat-clearing clichés. NEVER write: "I am writing to express interest in...", "I am excited to apply...", "My verified experience aligns with...".
   - State the target role and company with immediate energy, purpose, and relevance.

2. PARAGRAPH 2 — PROOF & IMPACT (Situation → Action → Result):
   - Spotlight 1 or 2 key accomplishments or projects from <VERIFIED_EVIDENCE> that map directly to the job requirements.
   - Show impact, not just involvement. Don't just name the tech stack and say "delivered measurable results" — state what was built, what problems were solved, and what the outcome actually was (faster performance, reduced errors, reliable APIs, scale served, automated workflows, etc.) based on verified facts.
   - Every claim needs evidence, not adjectives. NEVER describe the candidate as "hardworking," "collaborative," "results-driven," "passionate," or "meticulous" without an accompanying concrete fact or metric.

3. PARAGRAPH 3 — WHY THIS COMPANY & TRANSFERABLE VALUE (1-2 sentences):
   - NO VAGUE COMPANY FLATTERY. NEVER write generic phrases like "esteemed organization," "impactful technology," "innovative team," or "engineering excellence" unless immediately backed by a specific, factual detail about the company (their product, a technical approach, their domain, or mission).
   - If specific company details in the brief are limited, focus directly on how the candidate's core technical strengths will solve problems in this role, without superficial praise.
   - If there are tech stack gaps, never apologize or sound defensive; frame it as proven learning agility across adjacent tools.

4. PARAGRAPH 4 — CONFIDENT CLOSE (1-2 sentences):
   - Restate genuine interest, invite next steps/discussion, and thank them. No begging or passive filler ("I hope to hear from you soon").

TONE & STYLE:
- Plain language over "impressive" language. Avoid buzzwords like "leverage," "meticulous," "narrative integrity," "architecting," "visionary." Write like a competent professional talking to another professional.
- Self-check: Ensure every sentence is uniquely true to this candidate's verified evidence and this specific role.

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
    const bullet = topProject.bullets?.[0] ? ` ${topProject.bullets[0]}` : "";
    proofParagraph = `In my work on ${topProject.name ?? "recent technical projects"}${tech}, I focused on building dependable software and solving practical system challenges.${bullet}`;
  } else if (topExperience) {
    const bullet = topExperience.bullets?.[0] ? ` ${topExperience.bullets[0]}` : "";
    proofParagraph = `As ${topExperience.role ?? "Engineer"} at ${topExperience.employer ?? "my previous company"}, I contributed directly to core features and system reliability.${bullet}`;
  } else if (skillsList) {
    proofParagraph = `My technical experience centers on software development with ${skillsList}, with an emphasis on writing clean code, building responsive interfaces, and continuous technical growth.`;
  } else {
    proofParagraph = `My background combines structured technical problem-solving with a dedication to delivering high-quality, maintainable software.`;
  }

  const role = input.jobTitle || "Software Engineer";

  return [
    `Dear Hiring Team,`,
    `My background in software development and practical application building aligns directly with the ${role} position at ${company}. Having delivered complete projects from design through deployment, I look forward to contributing to your engineering priorities.`,
    proofParagraph,
    `I am drawn to ${company} because of the technical scope of the ${role} role. I thrive in teams where I can take ownership of complex requirements, adapt quickly to new tools, and deliver steady value.`,
    `I would welcome the chance to discuss how my background fits your team's current goals. Thank you for your time and consideration.`,
    `Sincerely,\n${name}`,
  ].join("\n\n");
}

