import { describe, expect, it } from "vitest";

import { deriveTargetTitle, sanitizeJobTitleForCv } from "./content-plan";

describe("sanitizeJobTitleForCv", () => {
  it("strips location parentheses and seniority range fluff", () => {
    expect(
      sanitizeJobTitleForCv(
        "Software Engineer - Mid to Experienced Level (Maryland)",
      ),
    ).toBe("Software Engineer");
  });

  it("keeps a clean professional role title", () => {
    expect(sanitizeJobTitleForCv("Backend Software Engineer")).toBe(
      "Backend Software Engineer",
    );
  });

  it("drops remote/hybrid tags and contract markers", () => {
    expect(
      sanitizeJobTitleForCv("Full Stack Developer | Remote | Contract"),
    ).toBe("Full Stack Developer");
  });

  it("drops bracketed posting tags", () => {
    expect(sanitizeJobTitleForCv("Data Analyst [On-site] (NYC)")).toBe(
      "Data Analyst",
    );
  });
});

describe("deriveTargetTitle", () => {
  it("uses a cleaned role and early-career Junior prefix", () => {
    expect(
      deriveTargetTitle({
        jobTitle: "Software Engineer - Mid to Experienced Level (Maryland)",
        earlyCareer: true,
      }),
    ).toBe("Junior Software Engineer");
  });

  it("does not invent Junior for senior roles", () => {
    expect(
      deriveTargetTitle({
        jobTitle: "Senior Software Engineer (Remote)",
        earlyCareer: true,
      }),
    ).toBe("Senior Software Engineer");
  });

  it("preserves existing junior wording", () => {
    expect(
      deriveTargetTitle({
        jobTitle: "Junior Developer (Colombo)",
        earlyCareer: true,
      }),
    ).toBe("Junior Developer");
  });
});
