import {
  generateText,
  NoOutputGeneratedError,
  tool,
} from "ai";
import { ZodError, z } from "zod";

import {
  GroqKeyPool,
  GroqKeysExhaustedError,
  isGroqRateLimited,
} from "@/lib/ai/groq-key-pool";

import type { CvLanguageTailorer } from "../application/ports";
import { CvTailoringError } from "../domain/errors";
import { TAILORING_PROMPT_VERSION } from "../domain/policy";
import {
  groqResumeDraftSchema,
  type GroqResumeDraft,
} from "../domain/tailored-resume";

const INSTRUCTIONS = `You are a world-class executive resume writer and candidate sales advocate. Your goal is to write compelling, persuasive, and submission-ready CV content that positions the applicant in the strongest, most favorable light for the target role, while strictly adhering to verified evidence.

Core Directives:
1. Candidate Advocate: You are the candidate's sales engine. Frame their background with strong technical ownership, strategic impact, and high credibility.
2. Grounded in Truth: Use only the supplied verified evidence. Do not fabricate employers, dates, metrics, degrees, or unverified technologies. You can and should creatively synthesize, emphasize, and favorably articulate their real experience.
3. Strategic Bridge Framing: If the candidate is stretching, transitioning stacks (e.g., mobile to backend, frontend to fullstack), or stepping up in seniority, highlight their foundational system architecture, API design, data handling, and rapid ramp-up abilities as massive advantages.

Experience & Impact Bullets:
- Open every bullet with powerful, high-ownership active verbs: "Architected", "Engineered", "Implemented", "Optimized", "Scaled", "Streamlined", "Automated".
- Follow the high-impact structure: [Active Verb] + [Technical Scope & Context] + [Measurable Outcome / Business Purpose].
- Avoid passive or timid phrases: "Assisted with", "Responsible for", "Helped", "Worked on", "Participated in".
- Connect candidate contributions directly to system performance, reliability, developer velocity, or business outcomes.
- Use present tense for current roles and past tense for previous roles.

Projects (IMPORTANT):
- Write project content as continuous PARAGRAPHS, not bullet lists.
- Frame each project as a robust solution to a real-world engineering challenge.
- Highlight architecture decisions, technologies used, and end-to-end functionality.
- one_page: 1 short, punchy paragraph per project (~35-55 words, about 2 verified facts).
- two_page: 1-2 balanced paragraphs per project when facts support it.
- Never truncate a sentence mid-word or mid-phrase.

Skills Rules:
- Skills must be grouped as { category, items[] }.
- Preferred categories: Languages, Backend, Frontend & Mobile, Databases & Persistence, Cloud, DevOps & Infrastructure, Tools & Technologies.
- Order job-relevant verified skills first within each category to immediately catch the recruiter's eye.
- Retain strong verified skills that fit the page budget even if the JD omits them.

Summary:
- one_page: 35-50 words within the soft char budget - concise, high-impact positioning.
- two_page: 55-85 words within the soft char budget - richer professional positioning.
- Lead with an authoritative professional identity tailored directly to the target role.
- Highlight core engineering capabilities, domain enthusiasm, and high-impact delivery.
- Never use internal terms such as "verified evidence" or "Zeno".
- Avoid generic filler ("passionate", "hardworking", "team player"). Instead, demonstrate tangible engineering strength and technical versatility.

Target Title:
- Set targetTitle to the suggested target title EXACTLY.
- Professional role name only (e.g. "Senior Frontend Engineer").

ASCII Punctuation: Use standard ASCII hyphens "-", never em dashes or en dashes. Return only valid structured data matching the schema.`;

const repairBulletSchema = z
  .object({
    bullets: z
      .array(
        z
          .object({
            text: z.string().min(8).max(320),
            factIds: z.array(z.string().min(1)).min(1),
            priority: z.number().int().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();

export class GroqCvLanguageTailorer implements CvLanguageTailorer {
  private readonly keyPool: GroqKeyPool;
  private readonly modelId: string;

  constructor(apiKeys: string | string[] | GroqKeyPool, modelId: string) {
    this.keyPool =
      apiKeys instanceof GroqKeyPool
        ? apiKeys
        : new GroqKeyPool(Array.isArray(apiKeys) ? apiKeys : [apiKeys]);
    this.modelId = modelId;
  }

  async tailor(input: Parameters<CvLanguageTailorer["tailor"]>[0]): Promise<{
    draft: GroqResumeDraft;
    usage: { modelId: string; inputTokens: number | null; outputTokens: number | null };
  }> {
    let lastError: unknown;
    try {
      return await this.keyPool.withKey(async (apiKey) => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const result = await generateText({
              model: this.keyPool.createModel(apiKey, this.modelId),
              maxRetries: 0,
              maxOutputTokens: 4096,
              system: INSTRUCTIONS,
              prompt: [
                `Prompt version: ${TAILORING_PROMPT_VERSION}`,
                `Mode: ${input.mode}`,
                `Job: ${input.jobTitle}${input.company ? ` at ${input.company}` : ""}`,
                `Suggested target title (use EXACTLY as targetTitle): ${input.plan.targetTitle}`,
                `Candidate level / alignment (informational): ${input.plan.jobAlignment}`,
                "Do not copy location, seniority range, or posting fluff from the job title into targetTitle.",
                input.tailoringContext
                  ? `User emphasis (not a factual source): ${input.tailoringContext}`
                  : "No extra user emphasis.",
                `Summary max chars (soft): ${input.plan.summaryMaxChars} - write a specific professional intro within this budget`,
                `Experience bullet budget per role: ${input.plan.bulletsPerExperience}`,
                `Project paragraph budget per project: ${input.plan.paragraphsPerProject} (balanced across ALL selected projects)`,
                `Project source-fact budget per project: ${input.plan.projectSourceFacts}`,
                `Project paragraph target words (soft, balanced): ${input.plan.projectParagraphWords.min}-${input.plan.projectParagraphWords.max}`,
                `Bullet char guidance (soft, never mid-sentence truncate): ${input.plan.bulletMaxChars}`,
                `Write projects.paragraphs (prose with technical depth), not project bullet lists.`,
                input.plan.mode === "one_page"
                  ? "One-page mode: keep summary and each project paragraph short; do not over-write."
                  : "Fill the project paragraph budget with distinct verified facts when available - do not under-write rich items.",
                `Use plain hyphens "-" only. Never use em dashes or en dashes.`,
                `Selected experience IDs: ${input.plan.experienceItemIds.join(", ") || "(none)"}`,
                `Selected project IDs (exact set, already ranked): ${input.plan.projectItemIds.join(", ") || "(none)"}`,
                `Selected achievement IDs: ${input.plan.achievementItemIds.join(", ") || "(none)"}`,
                `Selected reference IDs (copied outside draft; do not invent): ${input.plan.referenceItemIds.join(", ") || "(none)"}`,
                "<SUPPORTED_SKILL_INVENTORY>",
                JSON.stringify(input.skillInventory, null, 2),
                "</SUPPORTED_SKILL_INVENTORY>",
                "<STRUCTURED_JOB_REQUIREMENTS>",
                JSON.stringify(input.requirements, null, 2),
                "</STRUCTURED_JOB_REQUIREMENTS>",
                "<SUPPORTED_JD_KEYWORDS>",
                JSON.stringify(input.keywordAudit, null, 2),
                "</SUPPORTED_JD_KEYWORDS>",
                "<SELECTED_VERIFIED_EVIDENCE>",
                JSON.stringify(input.selectedEvidence),
                "</SELECTED_VERIFIED_EVIDENCE>",
              ].join("\n"),
              tools: {
                recordFinalCvContent: tool({
                  description:
                    "Record final submission-ready tailored CV content (draft without verified contact/employer hydration).",
                  inputSchema: groqResumeDraftSchema,
                }),
              },
              toolChoice: {
                type: "tool",
                toolName: "recordFinalCvContent",
              },
            });

            const call = result.toolCalls.find(
              (toolCall) => toolCall.toolName === "recordFinalCvContent",
            );
            if (!call) throw new MissingToolCallError();
            const draft = groqResumeDraftSchema.parse(call.input);
            return {
              draft,
              usage: {
                modelId: this.modelId,
                inputTokens: result.usage?.inputTokens ?? null,
                outputTokens: result.usage?.outputTokens ?? null,
              },
            };
          } catch (error) {
            lastError = error;
            if (isGroqRateLimited(error)) throw error;
            if (attempt === 0 && isMalformedOutput(error)) continue;
            throw error;
          }
        }
        throw lastError instanceof Error
          ? lastError
          : new Error("CV tailoring failed.");
      });
    } catch (error) {
      throw new CvTailoringError(
        "AI_UNAVAILABLE",
        error instanceof GroqKeysExhaustedError
          ? error.message
          : "We could not tailor CV content safely from verified evidence.",
        { cause: error },
      );
    }
  }

  async repairFragment(
    input: Parameters<CvLanguageTailorer["repairFragment"]>[0],
  ): Promise<{
    bullets: GroqResumeDraft["experience"][number]["bullets"];
    usage: { modelId: string; inputTokens: number | null; outputTokens: number | null };
  }> {
    let lastError: unknown;
    try {
      return await this.keyPool.withKey(async (apiKey) => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const result = await generateText({
              model: this.keyPool.createModel(apiKey, this.modelId),
              maxRetries: 0,
              maxOutputTokens: 4096,
              system: INSTRUCTIONS,
              prompt: [
                "Repair only these bullets for one career item. Do not introduce new evidence.",
                `Career item: ${input.careerItemId} (${input.kind})`,
                `Validation error: ${input.validationError}`,
                `Max bullets: ${input.maxBullets}`,
                `Max chars: ${input.maxChars}`,
                "<FACTS>",
                JSON.stringify(input.facts),
                "</FACTS>",
                "<SUPPORTED_KEYWORDS>",
                JSON.stringify(input.supportedKeywords),
                "</SUPPORTED_KEYWORDS>",
              ].join("\n"),
              tools: {
                recordRepairedBullets: tool({
                  description: "Record repaired bullets for one career item.",
                  inputSchema: repairBulletSchema,
                }),
              },
              toolChoice: {
                type: "tool",
                toolName: "recordRepairedBullets",
              },
            });
            const call = result.toolCalls.find(
              (toolCall) => toolCall.toolName === "recordRepairedBullets",
            );
            if (!call) throw new MissingToolCallError();
            const parsed = repairBulletSchema.parse(call.input);
            return {
              bullets: parsed.bullets.slice(0, input.maxBullets),
              usage: {
                modelId: this.modelId,
                inputTokens: result.usage?.inputTokens ?? null,
                outputTokens: result.usage?.outputTokens ?? null,
              },
            };
          } catch (error) {
            lastError = error;
            if (isGroqRateLimited(error)) throw error;
            if (attempt === 0 && isMalformedOutput(error)) continue;
            throw error;
          }
        }
        throw lastError instanceof Error
          ? lastError
          : new Error("CV bullet repair failed.");
      });
    } catch (error) {
      throw new CvTailoringError(
        error instanceof GroqKeysExhaustedError || isGroqRateLimited(error)
          ? "AI_UNAVAILABLE"
          : "INVALID_AI_OUTPUT",
        error instanceof GroqKeysExhaustedError
          ? error.message
          : "Targeted CV bullet repair failed validation.",
        { cause: error },
      );
    }
  }
}

class MissingToolCallError extends Error {}

function isMalformedOutput(error: unknown): boolean {
  return (
    error instanceof ZodError ||
    error instanceof MissingToolCallError ||
    NoOutputGeneratedError.isInstance(error) ||
    (error instanceof Error &&
      (error.message.includes("Failed to validate JSON") ||
        error.message.includes("tool call validation failed"))) ||
    error instanceof SyntaxError
  );
}
