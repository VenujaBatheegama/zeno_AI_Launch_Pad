import { describe, expect, it, vi } from "vitest";

import { jobSearchCriteriaSchema } from "../domain/job";
import { ITProJobSource, normalizeITProJob } from "./itpro-job-source";

describe("ITProJobSource", () => {
  it("GETs the public jobs list and filters to the requested title family", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: "1",
          title: "Software Engineer",
          company: "Acme",
          location: 79,
          summary: "Join Acme as a Software Engineer in Colombo, Full-time.",
          description: "<p>Build software</p>",
          website: "https://acme.lk",
          created_on: "2026-08-08 10:00:00",
          type_id: 1,
        },
        {
          id: "2",
          title: "Digital Marketing Intern",
          company: "Other",
          location: 79,
          summary: "Marketing in Colombo",
          description: "Sell things",
          created_on: "2026-08-08 11:00:00",
          type_id: 4,
        },
      ]),
    );

    const result = await new ITProJobSource({
      timeoutMs: 1000,
      fetch: fetch as unknown as typeof globalThis.fetch,
    }).search(
      jobSearchCriteriaSchema.parse({
        role_titles: ["Software Engineer", "Associate Software Engineer"],
        locations: ["Sri Lanka"],
        work_modes: [],
        employment_types: [],
        experience_levels: [],
        excluded_keywords: [],
        page_size: 10,
        cursor: null,
      }),
    );

    expect(fetch.mock.calls[0]?.[0]).toBe("https://itpro.lk/api/v1/jobs");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      external_id: "1",
      title: "Software Engineer",
      country: "Sri Lanka",
      city: "Colombo",
      publisher: "itpro.lk",
      application_url: "https://itpro.lk/job/1",
    });
  });

  it("does not treat Cloud ERP titles as Cloud Engineer", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: "3",
          title: "Trainee QA Engineers (Cloud ERP)",
          company: "Acme",
          location: 79,
          summary: "QA in Colombo",
          description: "Test ERP",
          created_on: "2026-08-08 10:00:00",
          type_id: 4,
        },
      ]),
    );

    const result = await new ITProJobSource({
      timeoutMs: 1000,
      fetch: fetch as unknown as typeof globalThis.fetch,
    }).search(
      jobSearchCriteriaSchema.parse({
        role_titles: ["Cloud Engineer", "DevOps Engineer"],
        locations: ["Sri Lanka"],
        work_modes: [],
        employment_types: [],
        experience_levels: [],
        excluded_keywords: [],
        page_size: 10,
        cursor: null,
      }),
    );
    expect(result.jobs).toHaveLength(0);
  });

  it("normalizes missing optional fields without inventing salary", () => {
    const job = normalizeITProJob({
      id: 9,
      title: "Platform Engineer",
      company: null,
      location: null,
      description: null,
      summary: null,
      website: null,
      created_on: null,
    });
    expect(job.organization).toBeNull();
    expect(job.salary_min).toBeNull();
    expect(job.country).toBe("Sri Lanka");
    expect(job.application_url).toBe("https://itpro.lk/job/9");
  });
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
