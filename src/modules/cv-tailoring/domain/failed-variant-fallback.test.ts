import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildDeterministicResume } from "./deterministic-resume";
import { clampSkillItem } from "./skill-inventory";

describe("failed production CV variant fixture", () => {
  it("builds deterministic resume even with long skill labels", () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL("./fixtures/cv-fail-fixture.json", import.meta.url),
        "utf8",
      ),
    ) as {
      plan: Parameters<typeof buildDeterministicResume>[0]["plan"];
      snapshot: Parameters<typeof buildDeterministicResume>[0]["snapshot"];
      keywordAudit: Parameters<typeof buildDeterministicResume>[0]["keywordAudit"];
    };

    const resume = buildDeterministicResume(fixture);
    expect(resume.summary.text.length).toBeGreaterThan(20);
    expect(resume.experience.length + resume.projects.length).toBeGreaterThan(0);
    for (const group of resume.skills) {
      for (const item of group.items) {
        expect(item.length).toBeLessThanOrEqual(60);
      }
    }
  });

  it("clamps oversized skill labels to the resume schema limit", () => {
    const long =
      "Postman API Fundamentals Student Expert certification label that is way too long";
    expect(clampSkillItem(long).length).toBeLessThanOrEqual(60);
    expect(clampSkillItem(long).length).toBeGreaterThan(40);
  });
});
