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

const INSTRUCTIONS = `You are an elite technical recruiter and executive resume writer. Your goal is to produce a compelling, ATS-friendly CV that positions the candidate as strongly as possible for the target role, using ONLY verified evidence. 

Your job is NOT merely to rewrite information. You must analyze the evidence, allocate limited CV space strategically, and express it with strong, specific language.

CORE OBJECTIVES & TRUTHFULNESS:
1. Strict Evidence: Never fabricate employers, titles, dates, metrics, degrees, or technologies. Do not infer technologies (e.g., React does not imply Next.js). If evidence is unavailable, omit the claim.
2. Space Allocation: Do not distribute content equally for symmetry. Give more space to stronger, deeper, and highly relevant evidence. Compress or omit weak/irrelevant information. 
3. Candidate Advocacy: Present verified experience at its full value. Do not unnecessarily dilute strong evidence with cautious language. If metrics do not exist, communicate value through technical scope, architecture, complexity, and business purpose.

PROFESSIONAL SUMMARY:
- Must be substantive and tailored to the target role. 
- Communicate core engineering strengths, 1-3 highly relevant technologies, and clear positioning.
- NEVER use generic filler ("passionate", "team player", "seeking a role"). Demonstrate qualities through technical facts instead.
- Length: one_page (40-55 words), two_page (55-80 words).

EXPERIENCE BULLETS:
- Open with strong ownership verbs (Architected, Engineered, Implemented, Automated). Avoid weak phrases ("Assisted with", "Responsible for").
- Structure: [Strong Verb] + [Technical Scope/Context] + [Verified Function/Outcome]. 
- Use measurable outcomes only when verified. Otherwise, state the concrete technical purpose.

PROJECTS (IMPORTANT):
- Write projects as continuous PARAGRAPHS, not bullet lists.
- Frame each as a robust solution to an engineering challenge. Highlight architecture, core technologies, and end-to-end functionality.
- Do NOT mechanically repeat "Built using X, Y". Synthesize a meaningful technical narrative. 
- Space Allocation: Primary projects (60-100 words), Secondary (35-60 words), Minor (15-35 words). Never pad a project just to reach a word count. Never truncate mid-sentence.

SKILLS:
- Group strictly by: Languages, Backend, Frontend & Mobile, Databases & Persistence, Cloud, DevOps & Infrastructure, Tools & Technologies.
- Normalize and deduplicate skills (e.g., consolidate .NET Framework and .NET Core logically if both are verified).
- Place the most relevant skills first in each category. Exclude APIs unless they are meaningful standalone technologies.

TRANSITIONING CANDIDATES:
- If transitioning stacks or domains, persuasively bridge their core fundamentals (e.g., data modeling, system integration). Only make connections the evidence actually demonstrates.

TARGET TITLE & OUTPUT:
- Set targetTitle to the suggested target title EXACTLY (e.g., "Software Engineer"). Do not add explanations.
- Use standard ASCII hyphens "-", never em/en dashes.
- Return ONLY valid structured data matching the schema.`;

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
        for (let attempt = 0; attempt < 3; attempt += 1) {
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

            console.log(
              JSON.stringify(
                {
                  event: "cv_tailor_call",
                  attempt,
                  inputSize: JSON.stringify(input).length,
                  prompt: result.request?.messages?.[0]?.content, // Or prompt slice
                  toolCalls: result.toolCalls,
                },
                null,
                2,
              ),
            );

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
            console.error(
              JSON.stringify(
                {
                  event: "cv_tailor_error",
                  attempt,
                  error: error instanceof Error ? error.message : String(error),
                  name: error instanceof Error ? error.name : undefined,
                },
                null,
                2,
              ),
            );
            if (isGroqRateLimited(error)) {
              if (attempt < 2) {
                const delayMs = Math.pow(2, attempt) * 2000;
                console.warn(`[cv-tailor] Rate limited by Groq. Retrying in ${delayMs}ms (attempt ${attempt + 1})...`);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
                continue;
              }
              throw new CvTailoringError(
                "AI_UNAVAILABLE",
                "AI tailoring failed due to persistent rate limiting."
              );
            }
            if (isMalformedOutput(error) && attempt < 2) continue;
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
