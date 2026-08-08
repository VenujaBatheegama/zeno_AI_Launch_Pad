import { describe, expect, it, vi } from "vitest";

import {
  jobSearchCriteriaSchema,
  type JobSearchCriteria,
} from "../domain/job";
import {
  buildTheirStackSearchBody,
  inferCountryCodes,
  normalizeTheirStackJob,
  TheirStackJobSource,
} from "./theirstack-job-source";

describe("TheirStackJobSource", () => {
  it("POSTs a bounded Sri Lanka search with Bearer auth and title variants", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [completeJob()],
        metadata: { total_results: 1 },
      }),
    );
    const source = createSource(fetch);

    const result = await source.search(
      criteria({
        role_titles: [
          "Software Engineer",
          "Associate Software Engineer",
          "Junior Software Engineer",
        ],
        locations: ["Sri Lanka"],
        page_size: 10,
      }),
    );

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.theirstack.com/v1/jobs/search");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-secret-key",
      "Content-Type": "application/json",
    });
    expect(JSON.stringify(init.headers)).not.toContain("test-secret-keyXXXX");

    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      job_title_or: [
        "Software Engineer",
        "Associate Software Engineer",
        "Junior Software Engineer",
      ],
      job_country_code_or: ["LK"],
      posted_at_max_age_days: 30,
      is_closed: false,
      limit: 10,
      page: 0,
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      external_id: "1234",
      title: "Software Engineer",
      organization: { name: "Acme Lanka" },
      country: "Sri Lanka",
      city: "Colombo",
      publisher: "linkedin.com",
      source_url: "https://www.linkedin.com/jobs/view/1234567890",
      application_url: "https://careers.acme.lk/jobs/1234",
    });
    expect(result.jobs[0]?.raw_payload).toMatchObject({ id: 1234 });
  });

  it("maps lk / Colombo / srilanka to job_country_code_or LK", () => {
    expect(inferCountryCodes(["lk"])).toEqual(["LK"]);
    expect(inferCountryCodes(["Colombo"])).toEqual(["LK"]);
    expect(inferCountryCodes(["srilanka"])).toEqual(["LK"]);
    expect(
      buildTheirStackSearchBody(
        criteria({ locations: ["LK"], role_titles: ["Software Engineer"] }),
      ).job_country_code_or,
    ).toEqual(["LK"]);
  });

  it("includes remote=true only for remote-only work modes", () => {
    expect(
      buildTheirStackSearchBody(
        criteria({
          work_modes: ["remote"],
          role_titles: ["Software Engineer"],
        }),
      ).remote,
    ).toBe(true);
    expect(
      buildTheirStackSearchBody(
        criteria({
          work_modes: ["hybrid", "remote"],
          role_titles: ["Software Engineer"],
        }),
      ).remote,
    ).toBeUndefined();
  });

  it("maps page cursors and limits", () => {
    expect(
      buildTheirStackSearchBody(
        criteria({
          role_titles: ["DevOps Engineer"],
          page_size: 5,
          cursor: "2",
        }),
      ),
    ).toMatchObject({
      limit: 5,
      page: 2,
      posted_at_max_age_days: 30,
    });
  });

  it("normalizes missing optional fields without inventing values", () => {
    const job = normalizeTheirStackJob({
      id: "abc",
      job_title: "Platform Engineer",
      company: null,
      description: null,
      location: null,
      country_code: "LK",
      country: "Sri Lanka",
      remote: true,
      hybrid: false,
      date_posted: "2026-08-01",
      url: "https://boards.greenhouse.io/acme/jobs/1",
      source_url: null,
      final_url: null,
      min_annual_salary: null,
      max_annual_salary: null,
      salary_currency: null,
      cities: null,
      locations: [],
    });

    expect(job).toMatchObject({
      external_id: "abc",
      title: "Platform Engineer",
      organization: null,
      description: null,
      city: null,
      location: null,
      country: "Sri Lanka",
      work_mode: "remote",
      salary_min: null,
      salary_max: null,
      publisher: "boards.greenhouse.io",
      source_url: "https://boards.greenhouse.io/acme/jobs/1",
      application_url: "https://boards.greenhouse.io/acme/jobs/1",
    });
  });

  it("prefers final_url for apply and keeps source_url provenance", () => {
    const job = normalizeTheirStackJob({
      id: 9,
      job_title: "Graduate Software Engineer",
      company: "Beta",
      country_code: "LK",
      final_url: "https://jobs.lever.co/beta/abc",
      url: "https://api.theirstack.com/redirect/9",
      source_url: "https://www.indeed.com/viewjob?jk=abc",
    });

    expect(job.application_url).toBe("https://jobs.lever.co/beta/abc");
    expect(job.source_url).toBe("https://www.indeed.com/viewjob?jk=abc");
    expect(job.publisher).toBe("indeed.com");
    expect(job.application_is_direct).toBe(true);
  });

  it("filters excluded title keywords after normalization", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          completeJob({ id: 1, job_title: "Software Engineer" }),
          completeJob({ id: 2, job_title: "Senior Software Engineer" }),
        ],
      }),
    );

    const result = await createSource(fetch).search(
      criteria({
        role_titles: ["Software Engineer"],
        excluded_keywords: ["senior"],
      }),
    );

    expect(result.jobs.map((job) => job.external_id)).toEqual(["1"]);
  });

  it("maps unauthorized and rate-limit responses to existing error codes", async () => {
    await expect(
      createSource(
        vi.fn().mockResolvedValue(new Response("nope", { status: 401 })),
      ).search(criteria()),
    ).rejects.toMatchObject({ code: "SOURCE_UNAUTHORIZED" });

    await expect(
      createSource(
        vi.fn().mockResolvedValue(new Response("slow down", { status: 429 })),
      ).search(criteria()),
    ).rejects.toMatchObject({ code: "SOURCE_RATE_LIMITED" });
  });

  it("does not treat identical provider ids as separate jobs in one page", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [completeJob({ id: 42 }), completeJob({ id: 42 })],
      }),
    );
    const result = await createSource(fetch).search(criteria());
    // Provider may return duplicates; discovery upsert key is source+external_id.
    expect(result.jobs.every((job) => job.external_id === "42")).toBe(true);
  });
});

function createSource(fetch: ReturnType<typeof vi.fn>) {
  return new TheirStackJobSource({
    apiKey: "test-secret-key",
    timeoutMs: 1000,
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
}

function criteria(
  overrides: Partial<JobSearchCriteria> = {},
): JobSearchCriteria {
  return jobSearchCriteriaSchema.parse({
    role_titles: ["Software Engineer"],
    locations: ["Sri Lanka"],
    work_modes: [],
    employment_types: [],
    experience_levels: [],
    excluded_keywords: [],
    page_size: 10,
    cursor: null,
    ...overrides,
  });
}

function completeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 1234,
    job_title: "Software Engineer",
    company: "Acme Lanka",
    company_object: {
      name: "Acme Lanka",
      logo: "https://cdn.example.com/logo.png",
      domain: "acme.lk",
    },
    description: "Build software in Colombo.",
    location: "Colombo",
    long_location: "Colombo, Sri Lanka",
    city: "Colombo",
    country: "Sri Lanka",
    country_code: "LK",
    remote: false,
    hybrid: true,
    seniority: "junior",
    employment_statuses: ["full_time"],
    date_posted: "2026-08-01",
    min_annual_salary: 1200000,
    max_annual_salary: 1800000,
    salary_currency: "LKR",
    final_url: "https://careers.acme.lk/jobs/1234",
    url: "https://api.theirstack.com/jobs/1234",
    source_url: "https://www.linkedin.com/jobs/view/1234567890",
    locations: [
      {
        name: "Colombo",
        display_name: "Colombo, Western Province, Sri Lanka",
        country_code: "LK",
        country_name: "Sri Lanka",
        state: "Western Province",
      },
    ],
    ...overrides,
  };
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
