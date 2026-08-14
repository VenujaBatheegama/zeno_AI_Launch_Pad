/**
 * Central Groq model IDs used by Zeno.
 * Free/developer-tier Llama 3.x IDs were retired by Groq on 2026-08-16.
 */

export const GROQ_DEFAULT_PRIMARY_MODEL = "openai/gpt-oss-20b";
export const GROQ_DEFAULT_FALLBACK_MODELS = ["openai/gpt-oss-120b"] as const;

/** Known retired Groq model IDs that must not appear in defaults. */
export const GROQ_RETIRED_MODEL_IDS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
] as const;

export type GroqRetiredModelId = (typeof GROQ_RETIRED_MODEL_IDS)[number];

export function isRetiredGroqModelId(modelId: string): boolean {
  const normalized = modelId.trim().toLocaleLowerCase();
  return GROQ_RETIRED_MODEL_IDS.some((id) => id === normalized);
}

/**
 * Rejects configuration that still points at retired defaults.
 * Operators may still set other currently supported models explicitly.
 */
export function assertSupportedGroqModelConfig(input: {
  primary: string;
  fallbacks: string[];
}): void {
  const all = [input.primary, ...input.fallbacks];
  const retired = all.filter(isRetiredGroqModelId);
  if (retired.length === 0) return;
  throw new Error(
    `GROQ model configuration includes retired model ID(s): ${retired.join(
      ", ",
    )}. ` +
      `Use ${GROQ_DEFAULT_PRIMARY_MODEL} (primary) and ${GROQ_DEFAULT_FALLBACK_MODELS.join(
        ",",
      )} (fallback). ` +
      `Update GROQ_MODEL / GROQ_FALLBACK_MODELS in your deployment environment.`,
  );
}
