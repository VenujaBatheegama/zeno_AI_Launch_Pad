import { describe, expect, it } from "vitest";

import {
  assertSupportedGroqModelConfig,
  GROQ_DEFAULT_FALLBACK_MODELS,
  GROQ_DEFAULT_PRIMARY_MODEL,
  isRetiredGroqModelId,
} from "./groq-models";

describe("groq-models", () => {
  it("recognizes retired Llama IDs", () => {
    expect(isRetiredGroqModelId("llama-3.3-70b-versatile")).toBe(true);
    expect(isRetiredGroqModelId("llama-3.1-8b-instant")).toBe(true);
    expect(isRetiredGroqModelId(GROQ_DEFAULT_PRIMARY_MODEL)).toBe(false);
  });

  it("accepts gpt-oss primary and fallback", () => {
    expect(() =>
      assertSupportedGroqModelConfig({
        primary: GROQ_DEFAULT_PRIMARY_MODEL,
        fallbacks: [...GROQ_DEFAULT_FALLBACK_MODELS],
      }),
    ).not.toThrow();
  });

  it("rejects retired models in configuration", () => {
    expect(() =>
      assertSupportedGroqModelConfig({
        primary: "llama-3.3-70b-versatile",
        fallbacks: ["openai/gpt-oss-120b"],
      }),
    ).toThrow(/retired model ID/i);
  });

  it("rejects retired models in fallback list", () => {
    expect(() =>
      assertSupportedGroqModelConfig({
        primary: GROQ_DEFAULT_PRIMARY_MODEL,
        fallbacks: ["llama-3.1-8b-instant"],
      }),
    ).toThrow(/llama-3\.1-8b-instant/);
  });
});
