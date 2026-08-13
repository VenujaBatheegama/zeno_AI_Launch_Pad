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

function match(
  overrides: Partial<RankedJobMatchCard> &
    Pick<RankedJobMatchCard, "listingId" | "title" | "evidenceFitScore">,
): RankedJobMatchCard {
  return {
    listingId: overrides.listingId,
    jobId: overrides.jobId ?? "job-id",
    title: overrides.title,
    organizationName: overrides.organizationName ?? "Acme",
    applicationUrl: overrides.applicationUrl ?? null,
    userState: overrides.userState ?? "discovered",
    evidenceFitScore: overrides.evidenceFitScore,
    careerLevel: overrides.careerLevel ?? "aligned",
    confidence: overrides.confidence ?? "medium",
    topMatched: overrides.topMatched ?? [],
    primaryGaps: overrides.primaryGaps ?? [],
    explanation: overrides.explanation ?? "Fit note",
    stale: overrides.stale ?? false,
    eligible: overrides.eligible ?? true,
    queryProvenance: overrides.queryProvenance ?? [],
    preferredMatches: overrides.preferredMatches ?? [],
    verifiedMatches: overrides.verifiedMatches ?? [],
  };
}

describe("buildMatchedJobRows", () => {
  it("only includes analysed matches, not every discovered job", () => {
    const listingMatched = "11111111-1111-4111-8111-111111111111";
    const listingExtra = "22222222-2222-4222-8222-222222222222";
    const jobs = [
      job({ listing_id: listingMatched, title: "Analysed role" }),
      job({ listing_id: listingExtra, title: "Unanalysed discovery" }),
    ];
    const rows = buildMatchedJobRows(jobs, [
      match({
        listingId: listingMatched,
        title: "Analysed role",
        evidenceFitScore: 72,
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.listingId).toBe(listingMatched);
    expect(rows[0]?.analysed).toBe(true);
    expect(rows[0]?.fitScore).toBe(72);
  });

  it("omits dismissed matches and sorts by fit", () => {
    const listingA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const listingB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const listingC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const jobs = [
      job({ listing_id: listingA, title: "A" }),
      job({ listing_id: listingB, title: "B" }),
      job({ listing_id: listingC, title: "C" }),
    ];
    const rows = buildMatchedJobRows(jobs, [
      match({
        listingId: listingA,
        title: "A",
        evidenceFitScore: 40,
        preferredMatches: ["React"],
      }),
      match({
        listingId: listingB,
        title: "B",
        evidenceFitScore: 90,
        verifiedMatches: ["TypeScript"],
      }),
      match({
        listingId: listingC,
        title: "C",
        evidenceFitScore: 99,
        userState: "dismissed",
      }),
    ]);
    expect(rows.map((row) => row.listingId)).toEqual([listingB, listingA]);
    expect(rows[0]?.verifiedMatches).toEqual(["TypeScript"]);
  });

  it("does not invent missing company or location fields from empty jobs", () => {
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
      [
        match({
          listingId,
          title: "Engineer",
          evidenceFitScore: 55,
          explanation: "",
        }),
      ],
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
