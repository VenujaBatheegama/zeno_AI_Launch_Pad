import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { recoverReferencesFromCvText } from "@/modules/career-evidence/domain/recover-references";

describe("recoverReferencesFromCvText", () => {
  it("recovers named referees with contact details from CV text", () => {
    const cvText = readFileSync(
      resolve(process.cwd(), "tmp/evidence-retention/source-cv-text.txt"),
      "utf8",
    );

    const referees = recoverReferencesFromCvText(cvText);

    expect(referees.length).toBeGreaterThanOrEqual(2);
    expect(referees.map((item) => item.name).join(" ")).toMatch(/Torin/i);
    expect(referees.map((item) => item.name).join(" ")).toMatch(/Suvetha/i);
    expect(referees.some((item) => item.email?.includes("@"))).toBe(true);
    expect(referees.every((item) => item.source_quote)).toBe(true);
  });

  it("does not invent referees when the section is absent", () => {
    expect(recoverReferencesFromCvText("EXPERIENCE\nBuilt APIs at Acme")).toEqual(
      [],
    );
  });
});
