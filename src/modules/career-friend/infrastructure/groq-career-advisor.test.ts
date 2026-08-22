import { describe, expect, it } from "vitest";

import { parseHermesThinking } from "./groq-career-advisor";

describe("Hermes Reasoning & Thinking Extraction", () => {
  it("extracts internal reasoning thought block and separates user-facing answer", () => {
    const raw = `
<thinking>
1. User is asking for a 2-page CV explicitly.
2. Verified profile has 3 work experiences and 4 projects.
3. Will invoke generate_cv with mode: "two_page".
</thinking>
Here is your 2-page CV based on your verified profile, attached below as a PDF!`;

    const parsed = parseHermesThinking(raw);

    expect(parsed.thinking).toContain("User is asking for a 2-page CV explicitly.");
    expect(parsed.thinking).toContain("mode: \"two_page\"");
    expect(parsed.answer).toBe(
      "Here is your 2-page CV based on your verified profile, attached below as a PDF!",
    );
  });

  it("handles output without thinking blocks gracefully", () => {
    const raw = "Sure! Here is your general CV attached below.";
    const parsed = parseHermesThinking(raw);

    expect(parsed.thinking).toBeUndefined();
    expect(parsed.answer).toBe("Sure! Here is your general CV attached below.");
  });
});
