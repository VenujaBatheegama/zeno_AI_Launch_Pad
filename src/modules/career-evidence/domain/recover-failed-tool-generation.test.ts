import { describe, expect, it } from "vitest";

import {
  parseRecoveredToolArguments,
  readFailedGeneration,
  repairTruncatedJson,
  salvageEvidencePayload,
} from "./recover-failed-tool-generation";

describe("recover failed Groq tool generation", () => {
  it("reads failed_generation from responseBody", () => {
    const error = {
      message: "Failed to parse tool call arguments asJSON",
      responseBody: JSON.stringify({
        error: {
          message: "Failed to parse tool call arguments asJSON",
          code: "tool_use_failed",
          failed_generation:
            '{"name":"recordCareerEvidence","arguments":{"profile":{"full_name":"Ada"},"warnings":[]}}',
        },
      }),
    };
    expect(readFailedGeneration(error)).toContain("recordCareerEvidence");
  });

  it("repairs truncated JSON cut mid-string", () => {
    const truncated =
      '{"profile":{"full_name":"Ada","summary":"A long summary that was cut';
    const repaired = repairTruncatedJson(truncated);
    expect(repaired).toBeTruthy();
    expect(JSON.parse(repaired!)).toMatchObject({
      profile: { full_name: "Ada" },
    });
  });

  it("parses tool wrapper arguments after repair", () => {
    const failed =
      '{"name": "recordCareerEvidence", "arguments": {"profile": {"full_name": "Ada", "email": null, "phone": null, "location": null, "summary": null}, "work_experience": [], "education": [], "skills": [], "projects": [{"name": "Demo", "source_quote": "Demo project cut';
    const args = parseRecoveredToolArguments(failed);
    expect(args?.profile).toMatchObject({ full_name: "Ada" });
    expect(Array.isArray(args?.projects)).toBe(true);
  });

  it("salvage adds a truncation warning", () => {
    const salvaged = salvageEvidencePayload({
      profile: { full_name: "Ada" },
      projects: [{ name: "X" }],
    });
    expect(salvaged.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/truncated/i)]),
    );
  });
});
