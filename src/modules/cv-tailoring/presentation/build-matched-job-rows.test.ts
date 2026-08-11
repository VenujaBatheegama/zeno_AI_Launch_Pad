import { describe, expect, it } from "vitest";

import type { RankedJobMatchCard } from "@/modules/career-intelligence/application/ports";
import type { DiscoveredJob } from "@/modules/job-discovery/domain/job";

import { buildMatchedJobRows } from "./build-matched-job-rows";

function job(
  overrides: Partial<DiscoveredJob> &
    Pick<DiscoveredJob, "listing_id" | "title">,
): DiscoveredJob {
  return {
    job_id: overrides.job_id ?? "00000000-0000-4000-8000-000000000001",
    listing_id: overrides.listing_id,
    title: overrides.title,
    organization_name:
      "organization_name" in overrides ? overrides.organization_name! : "Acme",
    organization_logo_url: null,
    description: "description" in overrides ? overrides.description! : "Build things.",
    location: "location" in overrides ? overrides.location! : "Remote",
    city: null,
    region: null,
    country: null,
    employment_type:
      "employment_type" in overrides ? overrides.employment_type! : "full_time",
    work_mode: "work_mode" in overrides ? overrides.work_mode! : "remote",
    experience_level:
      "experience_level" in overrides ? overrides.experience_level! : "entry",
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    published_at:
      "published_at" in overrides
        ? overrides.published_at!
        : "2026-08-01T00:00:00.000Z",
    closing_at: null,
    publisher: null,
    source_name: "jsearch",
    source_url: null,
    application_url: null,
    application_is_direct: null,
    first_seen_at: "2026-08-01T00:00:00.000Z",
    last_seen_at: "2026-08-01T00:00:00.000Z",
    user_state: overrides.user_state ?? "discovered",
  };
}

describe("buildMatchedJobRows", () => {
  it("uses stored jobs only and omits dismissed rows", () => {
    const jobs = [
      job({
        listing_id: "11111111-1111-4111-8111-111111111111",
        title: "Intern",
      }),
      job({
        listing_id: "22222222-2222-4222-8222-222222222222",
        title: "Gone",
        user_state: "dismissed",
      }),
    ];
    const rows = buildMatchedJobRows(jobs, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.listingId).toBe("11111111-1111-4111-8111-111111111111");
    expect(rows[0]?.fitScore).toBeNull();
    expect(rows[0]?.analysed).toBe(false);
  });

  it("attaches match scores when available and sorts by fit", () => {
    const listingA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const listingB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const jobs = [
      job({ listing_id: listingA, title: "A" }),
      job({ listing_id: listingB, title: "B" }),
    ];
    const matches = [
      {
        listingId: listingA,
        jobId: "job-a",
        title: "A",
        organizationName: "Acme",
        applicationUrl: null,
        userState: "discovered",
        evidenceFitScore: 40,
        careerLevel: "aligned",
        confidence: "medium",
        topMatched: [],
        primaryGaps: [],
        explanation: "Some fit",
        stale: false,
        eligible: true,
        queryProvenance: [],
        preferredMatches: ["React"],
        verifiedMatches: [],
      },
      {
        listingId: listingB,
        jobId: "job-b",
        title: "B",
        organizationName: "Acme",
        applicationUrl: null,
        userState: "discovered",
        evidenceFitScore: 90,
        careerLevel: "aligned",
        confidence: "high",
        topMatched: [],
        primaryGaps: [],
        explanation: "Strong fit",
        stale: false,
        eligible: true,
        queryProvenance: [],
        preferredMatches: [],
        verifiedMatches: ["TypeScript"],
      },
    ] as RankedJobMatchCard[];

    const rows = buildMatchedJobRows(jobs, matches);
    expect(rows.map((row) => row.listingId)).toEqual([listingB, listingA]);
    expect(rows[0]?.fitScore).toBe(90);
    expect(rows[0]?.verifiedMatches).toEqual(["TypeScript"]);
  });

  it("does not invent missing company or location fields", () => {
    const listingId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const rows = buildMatchedJobRows(
      [
        job({
          listing_id: listingId,
          title: "Engineer",
          organization_name: null,
          location: null,
          work_mode: null,
          employment_type: null,
          experience_level: null,
          published_at: null,
          description: null,
        }),
      ],
      [],
    );
    expect(rows[0]).toMatchObject({
      company: null,
      location: null,
      workMode: null,
      employmentType: null,
      experienceLevel: null,
      publishedAt: null,
      description: null,
    });
  });
});
