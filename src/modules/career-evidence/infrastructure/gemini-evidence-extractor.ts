import { generateText, tool } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

import type { EvidenceExtractor } from "../application/ports";
import {
  careerEvidenceToolInputSchema,
  extractedCareerEvidenceSchema,
  type ExtractedCareerEvidence,
} from "../domain/evidence";
import { CareerEvidenceError } from "../domain/errors";
import { sanitizeEvidenceInput } from "../domain/recover-failed-tool-generation";
import { EXTRACTION_INSTRUCTIONS } from "./groq-evidence-extractor";

const MAX_CV_PROMPT_CHARS = 12_000;
const EXTRACTION_MAX_OUTPUT_TOKENS = 4096;

/**
 * Uses Google's Gemini free tier (no billing required) instead of Groq for
 * CV evidence extraction. This is the highest-stakes AI call in the app
 * (its output ends up verbatim on someone's CV), so it's worth spending a
 * stronger free model here even though chat stays on Groq for speed.
 *
 * Single API key, no key-rotation pool: the free tier's daily cap is small
 * enough that rotating keys isn't worth the complexity for an MVP. On any
 * failure (rate limit, malformed output, missing key) this throws and the
 * caller (composition-root) falls back to GroqEvidenceExtractor.
 */
export class GeminiEvidenceExtractor implements EvidenceExtractor {
  private readonly apiKey: string;
  private readonly modelId: string;

  constructor(apiKey: string, modelId = "gemini-2.5-flash") {
    this.apiKey = apiKey;
    this.modelId = modelId;
  }

  async extract(text: string): Promise<ExtractedCareerEvidence> {
    const promptText =
      text.length > MAX_CV_PROMPT_CHARS
        ? text.slice(0, MAX_CV_PROMPT_CHARS)
        : text;

    try {
      const google = createGoogleGenerativeAI({ apiKey: this.apiKey });

      const result = await generateText({
        model: google(this.modelId),
        maxRetries: 1,
        maxOutputTokens: EXTRACTION_MAX_OUTPUT_TOKENS,
        system: EXTRACTION_INSTRUCTIONS,
        prompt: `Extract career evidence from the CV below.\n\n<CV>\n${promptText}\n</CV>`,
        tools: {
          recordCareerEvidence: tool({
            description:
              "Record only career evidence explicitly supported by the CV.",
            inputSchema: careerEvidenceToolInputSchema,
          }),
        },
        toolChoice: {
          type: "tool",
          toolName: "recordCareerEvidence",
        },
      });

      const call = result.toolCalls.find(
        (toolCall) => toolCall.toolName === "recordCareerEvidence",
      );
      if (!call) {
        throw new Error("Gemini did not return the expected tool call.");
      }

      const sanitized = sanitizeEvidenceInput(call.input);
      return extractedCareerEvidenceSchema.parse(sanitized);
    } catch (error) {
      // Don't wrap this in a user-facing CareerEvidenceError here — let it
      // bubble up as a plain Error so composition-root can catch it and
      // retry with GroqEvidenceExtractor instead. Only wrap if this is the
      // last resort (no Groq fallback configured), which composition-root
      // decides, not this class.
      console.error("[GeminiEvidenceExtractor] extraction failed:", error);
      throw error instanceof Error
        ? error
        : new CareerEvidenceError(
            "AI_EXTRACTION_FAILED",
            "Gemini CV extraction failed.",
            { cause: error },
          );
    }
  }
}
