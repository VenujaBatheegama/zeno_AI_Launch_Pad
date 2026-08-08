import { describe, expect, it } from "vitest";

import type { JobSearchCriteria, NormalizedExternalJob } from "../domain/job";
import { jobSearchCriteriaSchema } from "../domain/job";
import { JobDiscoveryError } from "../domain/errors";
import type { JobSource } from "./ports";
import { HybridJobSource, searchHybridSources } from "./hybrid-search";

function criteria(): JobSearchCriteria {
  return jobSearchCriteriaSchema.parse({
    role_titles: ["Software Engineer"],
    locations: ["Sri Lanka"],
    work_modes: [],
    employment_types: [],
    experience_levels: [],
    excluded_keywords: [],
    page_size: 10,
    cursor: null,
  });
}

function fakeJob(id: string, title = "Software Engineer"): NormalizedExternalJob {
  return {
    external_id: id,
    title,
    organization: { name: "Acme", logo_url: null, website_url: null },
    description: "Role",
    location: "Colombo, Sri Lanka",
    city: "Colombo",
    region: null,
    country: "Sri Lanka",
    employment_type: "full_time",
    work_mode: null,
    experience_level: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    published_at: null,
    closing_at: null,
    publisher: null,
    source_url: `https://example.com/${id}`,
    application_url: `https://example.com/${id}`,
    application_is_direct: true,
    raw_payload: {},
  };
}

function source(
  key: string,
  behavior: "ok" | "empty" | "fail",
  jobs: NormalizedExternalJob[] = [],
): JobSource {
  return {
    identity: { key, name: key },
    async search() {
      if (behavior === "fail") {
        throw new JobDiscoveryError("SOURCE_UNAVAILABLE", `${key} failed`);
      }
      return {
        jobs: behavior === "empty" ? [] : jobs,
        nextCursor: null,
        partialFailure: false,
      };
    },
  };
}

describe("hybrid search", () => {
  it("merges successful providers and reports statuses", async () => {
    const outcome = await searchHybridSources(criteria(), [
      source("jsearch", "ok", [fakeJob("j1")]),
      source("theirstack", "empty"),
      source("itpro", "ok", [fakeJob("i1", "Associate Software Engineer")]),
    ]);

    expect(outcome.jobs).toHaveLength(2);
    expect(outcome.providers).toEqual({
      jsearch: { status: "success", count: 1 },
      theirstack: { status: "empty", count: 0 },
      itpro: { status: "success", count: 1 },
    });
    expect(outcome.partialFailure).toBe(false);
  });

  it("keeps successful jobs when one provider fails", async () => {
    const outcome = await searchHybridSources(criteria(), [
      source("jsearch", "fail"),
      source("itpro", "ok", [fakeJob("i1")]),
    ]);
    expect(outcome.jobs).toHaveLength(1);
    expect(outcome.providers.jsearch?.status).toBe("error");
    expect(outcome.partialFailure).toBe(true);
  });

  it("throws when every enabled provider fails", async () => {
    await expect(
      searchHybridSources(criteria(), [
        source("jsearch", "fail"),
        source("theirstack", "fail"),
      ]),
    ).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("dedupes identical apply URLs across providers", async () => {
    const shared = fakeJob("shared");
    const outcome = await new HybridJobSource([
      source("jsearch", "ok", [shared]),
      source("itpro", "ok", [{ ...shared, external_id: "other" }]),
    ]).search(criteria());
    expect(outcome.jobs).toHaveLength(1);
    expect(outcome.dedupedCount).toBe(1);
    expect(outcome.rawCount).toBe(2);
  });

  it("ranks the merged pool by relevance, not by provider order", async () => {
    const outcome = await searchHybridSources(criteria(), [
      source("linkedin", "ok", [
        {
          ...fakeJob("li-senior", "Senior Platform Architect"),
          published_at: "2026-07-01T00:00:00.000Z",
          description: null,
        },
      ]),
      source("itpro", "ok", [
        {
          ...fakeJob("ip-match", "Software Engineer"),
          published_at: "2026-08-07T00:00:00.000Z",
          description: "Build and ship product features with the engineering team.",
        },
      ]),
    ]);
    expect(outcome.jobs.map((job) => job.external_id)).toEqual([
      "ip-match",
      "li-senior",
    ]);
  });

  it("keeps successful jobs when one provider times out", async () => {
    const slow: JobSource = {
      identity: { key: "theirstack", name: "TheirStack" },
      async search() {
        throw new JobDiscoveryError(
          "SOURCE_UNAVAILABLE",
          "TheirStack timed out.",
          { cause: new DOMException("The operation was aborted.", "TimeoutError") },
        );
      },
    };
    const outcome = await searchHybridSources(criteria(), [
      slow,
      source("itpro", "ok", [fakeJob("i1")]),
    ]);
    expect(outcome.jobs).toHaveLength(1);
    expect(outcome.providers.theirstack?.status).toBe("error");
    expect(outcome.providers.itpro?.status).toBe("success");
  });
});
