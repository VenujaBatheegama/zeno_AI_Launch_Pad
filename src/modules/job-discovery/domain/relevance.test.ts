import { describe, expect, it } from "vitest";

import { rankJobsByRelevance, scoreJobRelevance } from "./relevance";

const criteria = {
  role_titles: ["Software Engineer", "Associate Software Engineer"],
  locations: ["Sri Lanka", "Colombo"],
  work_modes: [],
  employment_types: [],
  experience_levels: [],
};

describe("relevance ranking", () => {
  it("ranks closer title + location matches above weaker ones, ignoring source fields", () => {
    const ranked = rankJobsByRelevance(
      [
        {
          title: "Senior Software Engineer",
          location: "Colombo, Sri Lanka",
          city: "Colombo",
          region: null,
          country: "Sri Lanka",
          description: "Build backend services with Node.js and PostgreSQL.",
          published_at: "2026-07-01T00:00:00.000Z",
          employment_type: "full_time",
          work_mode: null,
          experience_level: "senior",
          application_url: "https://example.com/senior",
        },
        {
          title: "Associate Software Engineer",
          location: "Colombo, Sri Lanka",
          city: "Colombo",
          region: null,
          country: "Sri Lanka",
          description: "Join our engineering team building product features.",
          published_at: "2026-08-06T00:00:00.000Z",
          employment_type: "full_time",
          work_mode: null,
          experience_level: "entry",
          application_url: "https://example.com/associate",
        },
        {
          title: "Marketing Coordinator",
          location: "Sri Lanka",
          city: null,
          region: null,
          country: "Sri Lanka",
          description: null,
          published_at: "2026-08-07T00:00:00.000Z",
          employment_type: null,
          work_mode: null,
          experience_level: null,
          application_url: null,
        },
      ],
      criteria,
    );

    expect(ranked.map((job) => job.title)).toEqual([
      "Associate Software Engineer",
      "Senior Software Engineer",
      "Marketing Coordinator",
    ]);
  });

  it("does not use publisher/source identity in the score inputs", () => {
    const base = {
      title: "Software Engineer",
      location: "Sri Lanka",
      city: null,
      region: null,
      country: "Sri Lanka",
      description: "A solid engineering role with clear responsibilities.",
      published_at: "2026-08-05T00:00:00.000Z",
      employment_type: "full_time" as const,
      work_mode: null,
      experience_level: null,
      application_url: "https://example.com/se",
    };
    expect(scoreJobRelevance(base, criteria)).toBe(
      scoreJobRelevance(base, criteria),
    );
  });
});
