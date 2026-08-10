import { describe, expect, it } from "vitest";

import {
  addExtractionMetadata,
  careerEvidenceSchema,
  extractedCareerEvidenceSchema,
  reconcileUserEdits,
  verifiedCareerEvidenceSchema,
} from "./evidence";

const minimalExtraction = {
  profile: {
    full_name: "Ada Lovelace",
    email: null,
    phone: null,
    location: null,
    summary: null,
  },
  work_experience: [],
  education: [],
  skills: [
    {
      name: "Analytical Engine programming",
      source_quote: "programmed the Analytical Engine",
    },
  ],
  projects: [],
  certifications: [],
  achievements: [],
  references: [],
  warnings: [],
};

describe("career evidence contract", () => {
  it("accepts absent optional facts only when represented explicitly", () => {
    expect(extractedCareerEvidenceSchema.parse(minimalExtraction)).toEqual(
      minimalExtraction,
    );
  });

  it("rejects evidence without a verbatim source quote", () => {
    expect(() =>
      extractedCareerEvidenceSchema.parse({
        ...minimalExtraction,
        skills: [{ name: "Leadership" }],
      }),
    ).toThrow();
  });

  it("normalizes varied source dates before canonical persistence", () => {
    const evidence = addExtractionMetadata(
      extractedCareerEvidenceSchema.parse({
        ...minimalExtraction,
        skills: [],
        education: [
          {
            institution: "University of London",
            qualification: null,
            field_of_study: null,
            start_date: "Jan 1840",
            end_date: null,
            source_quote: "University of London, Jan 1840",
          },
        ],
      }),
      () => "00000000-0000-4000-8000-000000000010",
    );

    expect(careerEvidenceSchema.parse(evidence).education[0].start_date).toBe(
      "1840-01",
    );
  });

  it("keeps an incomplete entry visible until the user completes it", () => {
    const evidence = addExtractionMetadata(
      extractedCareerEvidenceSchema.parse({
        ...minimalExtraction,
        skills: [],
        education: [
          {
            institution: null,
            qualification: "GCE O/L",
            field_of_study: null,
            start_date: null,
            end_date: "2019",
            source_quote: "GCE O/L — 9A passes, Dec 2019",
          },
        ],
      }),
      () => "00000000-0000-4000-8000-000000000010",
    );

    expect(evidence.education).toHaveLength(1);
    expect(evidence.education[0]).toMatchObject({
      institution: "",
      qualification: "GCE O/L",
    });
    expect(evidence.warnings).toContain(
      "Education “GCE O/L — 9A passes, Dec 2019” was kept for review because the institution was missing.",
    );
    // Qualification-only school exams are allowed at verification time.
    expect(() => verifiedCareerEvidenceSchema.parse(evidence)).not.toThrow();
  });

  it("rejects education that has neither institution nor qualification", () => {
    const evidence = addExtractionMetadata(
      extractedCareerEvidenceSchema.parse({
        ...minimalExtraction,
        skills: [],
        education: [
          {
            institution: null,
            qualification: null,
            field_of_study: null,
            start_date: null,
            end_date: "2019",
            source_quote: "Completed secondary schooling in 2019",
          },
        ],
      }),
      () => "00000000-0000-4000-8000-000000000010",
    );

    expect(() => verifiedCareerEvidenceSchema.parse(evidence)).toThrow(
      /school\/institution or qualification/i,
    );
  });

  it("adds stable metadata before evidence can be persisted", () => {
    const ids = ["00000000-0000-4000-8000-000000000010"];
    const evidence = addExtractionMetadata(
      extractedCareerEvidenceSchema.parse(minimalExtraction),
      () => ids.shift()!,
    );

    expect(careerEvidenceSchema.parse(evidence).skills[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000010",
      origin: "extracted",
      source_quote: "programmed the Analytical Engine",
    });
  });

  it("makes provenance server-owned when a user changes extracted evidence", () => {
    const current = addExtractionMetadata(
      extractedCareerEvidenceSchema.parse(minimalExtraction),
      () => "00000000-0000-4000-8000-000000000010",
    );
    const submitted = {
      ...current,
      skills: [
        {
          ...current.skills[0],
          name: "Kubernetes",
          origin: "extracted" as const,
          source_quote: "programmed the Analytical Engine",
        },
      ],
    };

    expect(reconcileUserEdits(current, submitted).skills[0]).toMatchObject({
      name: "Kubernetes",
      origin: "user_edited",
      source_quote: null,
    });
  });
});
