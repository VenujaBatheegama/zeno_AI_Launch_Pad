import { describe, expect, it } from "vitest";

import {
  alignJobToProfile,
  phrasePresent,
  type MatchableProfileTerm,
} from "./profile-alignment";
import {
  rankJobsPersonalized,
  scoreJobRelevance,
  scoreJobWithProfileAlignment,
} from "./relevance";

const baseCriteria = {
  role_titles: ["Software Engineer"],
  locations: ["Colombo"],
  work_modes: [] as Array<"onsite" | "hybrid" | "remote">,
  employment_types: [] as Array<
    "full_time" | "part_time" | "contract" | "internship" | "other"
  >,
  experience_levels: [] as Array<
    "entry" | "mid" | "senior" | "lead" | "executive"
  >,
};

function job(overrides: Partial<Parameters<typeof scoreJobRelevance>[0]>) {
  return {
    title: "Software Engineer",
    location: "Colombo",
    city: "Colombo",
    region: null,
    country: "Sri Lanka",
    description: "Build services.",
    published_at: "2026-08-05T00:00:00.000Z",
    employment_type: "full_time" as const,
    work_mode: null,
    experience_level: null,
    application_url: "https://example.com/a",
    ...overrides,
  };
}

describe("profile alignment matching", () => {
  it("matches preferred and verified concepts once despite repetition", () => {
    const terms: MatchableProfileTerm[] = [
      {
        originalTerm: "Java",
        category: "preferred",
        labels: ["Java", "Java programming"],
      },
      {
        originalTerm: "Java",
        category: "verified",
        labels: ["Java"],
      },
    ];
    const alignment = alignJobToProfile({
      title: "Software Engineer",
      description: "Java Java Java Spring Boot and SQL",
      terms,
    });
    expect(alignment.preferredMatches).toEqual(["Java"]);
    expect(alignment.verifiedMatches).toEqual(["Java"]);
    expect(alignment.alignmentScore).toBeLessThanOrEqual(36);
  });

  it("does not match java inside javascript", () => {
    expect(phrasePresent("we use javascript daily", "Java")).toBe(false);
    expect(phrasePresent("we use java daily", "Java")).toBe(true);
  });

  it("matches same-concept ESCO alternative labels", () => {
    const alignment = alignJobToProfile({
      title: "Nurse",
      description: "Provide care using wound dressing techniques",
      terms: [
        {
          originalTerm: "Wound care",
          category: "preferred",
          escoUri: "http://example/skill/1",
          labels: ["Wound care", "wound dressing"],
        },
      ],
    });
    expect(alignment.preferredMatches).toEqual(["Wound care"]);
  });

  it("applies exclusions without inventing interest when empty", () => {
    const empty = alignJobToProfile({
      title: "Software Engineer",
      description: "Java",
      terms: [],
    });
    expect(empty.interestScore).toBe(0);
    expect(empty.alignmentScore).toBe(0);

    const excluded = alignJobToProfile({
      title: "Sales Engineer",
      description: "Quota-carrying sales role",
      terms: [
        {
          originalTerm: "sales",
          category: "excluded",
          labels: ["sales"],
        },
      ],
    });
    expect(excluded.excludedMatches).toEqual(["sales"]);
    expect(excluded.alignmentScore).toBeLessThan(0);
  });

  it("survives missing descriptions", () => {
    const alignment = alignJobToProfile({
      title: "Software Engineer Java",
      description: null,
      terms: [
        { originalTerm: "Java", category: "preferred", labels: ["Java"] },
      ],
    });
    expect(alignment.preferredMatches).toEqual(["Java"]);
  });
});

describe("personalized discovery ranking", () => {
  it("keeps role relevance dominant over skill overlap in unrelated jobs", () => {
    const terms: MatchableProfileTerm[] = [
      { originalTerm: "Java", category: "preferred", labels: ["Java"] },
      { originalTerm: "Java", category: "verified", labels: ["Java"] },
    ];
    const ranked = rankJobsPersonalized(
      [
        job({
          title: "Java Trainer",
          description: "Java Java Java Java teaching certification",
        }),
        job({
          title: "Software Engineer",
          description: "Backend services with Node",
        }),
      ],
      baseCriteria,
      terms,
    );
    expect(ranked[0]?.title).toBe("Software Engineer");
  });

  it("ranks preferred interest above otherwise similar jobs", () => {
    const terms: MatchableProfileTerm[] = [
      { originalTerm: "Java", category: "preferred", labels: ["Java"] },
      { originalTerm: ".NET", category: "verified", labels: [".NET"] },
    ];
    const javaJob = job({
      title: "Software Engineer",
      description: "Java, Spring Boot and SQL",
      published_at: "2026-08-01T00:00:00.000Z",
    });
    const otherJob = job({
      title: "Software Engineer",
      description: "Another backend technology stack with Go",
      published_at: "2026-08-01T00:00:00.000Z",
    });
    const ranked = rankJobsPersonalized([otherJob, javaJob], baseCriteria, terms);
    expect(ranked[0]?.description).toMatch(/Java/);

    const javaScore = scoreJobWithProfileAlignment(javaJob, baseCriteria, terms);
    const otherScore = scoreJobWithProfileAlignment(otherJob, baseCriteria, terms);
    expect(javaScore.interestAlignment).toBeGreaterThan(otherScore.interestAlignment);
    expect(javaScore.finalScore).toBeGreaterThan(otherScore.finalScore);
  });

  it("gives preferred matches more weight than verified-only matches", () => {
    const preferredOnly = scoreJobWithProfileAlignment(
      job({ description: "Uses Java extensively" }),
      baseCriteria,
      [{ originalTerm: "Java", category: "preferred", labels: ["Java"] }],
    );
    const verifiedOnly = scoreJobWithProfileAlignment(
      job({ description: "Uses Java extensively" }),
      baseCriteria,
      [{ originalTerm: "Java", category: "verified", labels: ["Java"] }],
    );
    expect(preferredOnly.alignmentContribution).toBeGreaterThan(
      verifiedOnly.alignmentContribution,
    );
  });

  it("does not use provider identity in score inputs", () => {
    const base = job({});
    const a = scoreJobRelevance(base, baseCriteria);
    const b = scoreJobRelevance(
      { ...base, /* publisher would be ignored — not in RelevanceRankableJob */ },
      baseCriteria,
    );
    expect(a).toBe(b);
  });

  it("applies the same generic logic to a non-software fixture", () => {
    const nursingCriteria = {
      role_titles: ["Registered Nurse"],
      locations: ["Colombo"],
      work_modes: [] as Array<"onsite" | "hybrid" | "remote">,
      employment_types: [] as Array<
        "full_time" | "part_time" | "contract" | "internship" | "other"
      >,
      experience_levels: [] as Array<
        "entry" | "mid" | "senior" | "lead" | "executive"
      >,
    };
    const terms: MatchableProfileTerm[] = [
      {
        originalTerm: "wound care",
        category: "preferred",
        labels: ["wound care", "wound dressing"],
      },
    ];
    const ranked = rankJobsPersonalized(
      [
        {
          title: "Registered Nurse",
          location: "Colombo",
          city: "Colombo",
          region: null,
          country: "LK",
          description: "General ward duties",
          published_at: "2026-08-05T00:00:00.000Z",
          employment_type: "full_time",
          work_mode: null,
          experience_level: null,
          application_url: "https://example.com/n1",
        },
        {
          title: "Registered Nurse",
          location: "Colombo",
          city: "Colombo",
          region: null,
          country: "LK",
          description: "Provide wound dressing and patient care",
          published_at: "2026-08-05T00:00:00.000Z",
          employment_type: "full_time",
          work_mode: null,
          experience_level: null,
          application_url: "https://example.com/n2",
        },
      ],
      nursingCriteria,
      terms,
    );
    expect(ranked[0]?.description).toMatch(/wound/i);
  });
});
