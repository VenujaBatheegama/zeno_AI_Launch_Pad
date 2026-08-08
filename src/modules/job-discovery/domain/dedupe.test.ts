import { describe, expect, it } from "vitest";

import type { NormalizedExternalJob } from "./job";
import { canonicalizeJobUrl, dedupeNormalizedJobs } from "./dedupe";

function job(
  overrides: Partial<NormalizedExternalJob> & { external_id: string; title: string },
): NormalizedExternalJob {
  return {
    organization: { name: "Acme", logo_url: null, website_url: null },
    description: "Build things.",
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
    source_url: null,
    application_url: null,
    application_is_direct: null,
    raw_payload: {},
    ...overrides,
  };
}

describe("cross-provider dedupe", () => {
  it("collapses the same canonical apply URL across providers", () => {
    const result = dedupeNormalizedJobs([
      {
        providerKey: "jsearch",
        providerName: "JSearch",
        job: job({
          external_id: "js-1",
          title: "Software Engineer",
          application_url: "https://www.linkedin.com/jobs/view/1?utm_source=x",
        }),
      },
      {
        providerKey: "theirstack",
        providerName: "TheirStack",
        job: job({
          external_id: "ts-1",
          title: "Software Engineer",
          application_url: "https://linkedin.com/jobs/view/1",
          description: "Longer description for the same role.",
        }),
      },
    ]);

    expect(result.rawCount).toBe(2);
    expect(result.dedupedCount).toBe(1);
    expect(result.jobs[0]?.description).toContain("Longer description");
    expect(result.jobs[0]?.raw_payload.zeno_provenance).toHaveLength(2);
  });

  it("keeps distinct roles at the same company", () => {
    const result = dedupeNormalizedJobs([
      {
        providerKey: "itpro",
        providerName: "ITPro.lk",
        job: job({
          external_id: "1",
          title: "Software Engineer I",
          organization: { name: "Acme", logo_url: null, website_url: null },
        }),
      },
      {
        providerKey: "itpro",
        providerName: "ITPro.lk",
        job: job({
          external_id: "2",
          title: "Senior Software Engineer",
          organization: { name: "Acme", logo_url: null, website_url: null },
        }),
      },
    ]);
    expect(result.dedupedCount).toBe(2);
  });

  it("treats company/title casing as the same vacancy when URLs are absent", () => {
    const result = dedupeNormalizedJobs([
      {
        providerKey: "jsearch",
        providerName: "JSearch",
        job: job({
          external_id: "a",
          title: "Software Engineer",
          organization: { name: "ACME Lanka", logo_url: null, website_url: null },
        }),
      },
      {
        providerKey: "itpro",
        providerName: "ITPro.lk",
        job: job({
          external_id: "b",
          title: "software engineer",
          organization: { name: "acme lanka", logo_url: null, website_url: null },
        }),
      },
    ]);
    expect(result.dedupedCount).toBe(1);
  });

  it("canonicalizes tracking parameters", () => {
    expect(
      canonicalizeJobUrl(
        "https://www.Example.com/jobs/1/?utm_campaign=x&fbclid=1",
      ),
    ).toBe("https://example.com/jobs/1");
  });

  it("merges duplicate vacancies by richness, not by provider brand", () => {
    const result = dedupeNormalizedJobs([
      {
        providerKey: "theirstack",
        providerName: "TheirStack",
        job: job({
          external_id: "ts-1",
          title: "Software Engineer",
          application_url: "https://www.linkedin.com/jobs/view/99",
          description: "Longer TheirStack description for richness.",
          publisher: "theirstack",
        }),
      },
      {
        providerKey: "linkedin",
        providerName: "LinkedIn (guest)",
        job: job({
          external_id: "99",
          title: "Software Engineer",
          application_url: "https://lk.linkedin.com/jobs/view/software-engineer-99",
          description: null,
          publisher: "linkedin.com",
        }),
      },
    ]);
    expect(result.dedupedCount).toBe(1);
    expect(result.jobs[0]?.description).toContain("Longer TheirStack");
    expect(result.jobs[0]?.raw_payload.zeno_provenance).toHaveLength(2);
  });
});
