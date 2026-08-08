import { describe, expect, it, vi } from "vitest";

import {
  jobSearchCriteriaSchema,
  type JobSearchCriteria,
} from "../domain/job";
import {
  buildSearchUrl,
  JSearchJobSource,
  resolveLocation,
} from "./jsearch-job-source";

describe("JSearchJobSource", () => {
  it("builds a doc-aligned JSearch request for title, country, and filters", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "OK",
        data: {
          cursor: "next-page",
          jobs: [
            {
              job_id: "provider-123",
              job_title: "Software Engineer",
              employer_name: "Acme",
              employer_logo: "https://example.com/logo.png",
              job_publisher: "LinkedIn",
              job_employment_types: ["FULLTIME"],
              job_apply_link: "https://example.com/jobs/123",
              job_apply_is_direct: true,
              job_description: "Build software.",
              job_is_remote: true,
              job_posted_at_datetime_utc: "2026-08-01T10:00:00Z",
              job_location: "Colombo, Sri Lanka",
              job_city: "Colombo",
              job_country: "LK",
              job_min_salary: 1000,
              job_max_salary: 2000,
              job_salary_currency: "USD",
              job_salary_period: "MONTH",
              job_google_link: "https://www.google.com/search?q=job-123",
            },
          ],
        },
      }),
    );
    const source = createSource(fetch);

    const result = await source.search(criteria());

    expect(result.nextCursor).toBe("next-page");
    expect(result.partialFailure).toBe(false);
    expect(result.jobs[0]).toMatchObject({
      external_id: "provider-123",
      title: "Software Engineer",
      organization: { name: "Acme" },
      location: "Colombo, Sri Lanka",
      employment_type: "full_time",
      work_mode: "remote",
      experience_level: null,
      publisher: "LinkedIn",
      source_url: "https://www.google.com/search?q=job-123",
      application_url: "https://example.com/jobs/123",
      published_at: "2026-08-01T10:00:00.000Z",
      closing_at: null,
    });
    const requestedUrl = new URL(fetch.mock.calls[0][0]);
    expect(requestedUrl.origin).toBe("https://api.openwebninja.com");
    expect(requestedUrl.pathname).toBe("/jsearch/search-v2");
    expect(requestedUrl.searchParams.get("query")).toBe(
      "Software Engineer jobs in Colombo",
    );
    expect(requestedUrl.searchParams.get("country")).toBe("lk");
    expect(requestedUrl.searchParams.get("language")).toBe("en");
    expect(requestedUrl.searchParams.get("work_from_home")).toBe("true");
    expect(requestedUrl.searchParams.get("employment_types")).toBe("FULLTIME");
    expect(requestedUrl.searchParams.get("num_pages")).toBe("1");
    expect(fetch.mock.calls[0][1].headers).toMatchObject({
      "x-api-key": "secret",
    });
  });

  it("uses RapidAPI auth headers when configured with the RapidAPI host", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "OK",
        data: { jobs: [{ job_id: "rapid", job_title: "Developer" }] },
      }),
    );
    const source = createSource(fetch, "https://jsearch.p.rapidapi.com");

    await source.search(criteria());

    expect(fetch.mock.calls[0][1].headers).toMatchObject({
      "x-rapidapi-key": "secret",
      "x-rapidapi-host": "jsearch.p.rapidapi.com",
    });
  });

  it("excludes keywords from job titles only, not descriptions", async () => {
    const source = createSource(
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: "OK",
          data: {
            jobs: [
              {
                job_id: "keep",
                job_title: "Software Engineer",
                job_description: "Work with senior mentors on production systems.",
              },
              {
                job_id: "drop",
                job_title: "Senior Software Engineer",
                job_description: "Lead delivery.",
              },
            ],
          },
        }),
      ),
    );

    const result = await source.search({
      ...criteria(),
      excluded_keywords: ["senior"],
    });

    expect(result.jobs.map((job) => job.external_id)).toEqual(["keep"]);
  });

  it("keeps missing optional provider fields null", async () => {
    const source = createSource(
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [{ job_id: "minimal", job_title: "Developer" }],
        }),
      ),
    );

    expect((await source.search(criteria())).jobs[0]).toMatchObject({
      organization: null,
      description: null,
      location: null,
      employment_type: null,
      work_mode: null,
      salary_min: null,
      application_url: null,
      published_at: null,
    });
  });

  it("forwards cursors and preserves valid jobs from a partially malformed page", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "OK",
        data: {
          cursor: "following",
          jobs: [
            { job_id: "valid", job_title: "Developer" },
            { job_id: "missing-title" },
          ],
        },
      }),
    );
    const source = createSource(fetch);

    const result = await source.search({
      ...criteria(),
      cursor: "previous",
    });

    expect(result).toMatchObject({
      nextCursor: "following",
      partialFailure: true,
      jobs: [{ external_id: "valid" }],
    });
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("cursor")).toBe(
      "previous",
    );
  });

  it("maps malformed responses and network errors to source errors", async () => {
    const malformed = createSource(
      vi.fn().mockResolvedValue(jsonResponse({ data: [{ job_id: "missing" }] })),
    );
    const unavailable = createSource(
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    await expect(malformed.search(criteria())).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
    });
    await expect(unavailable.search(criteria())).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
    });
  });

  it.each([
    [401, "SOURCE_UNAUTHORIZED"],
    [403, "SOURCE_UNAUTHORIZED"],
    [429, "SOURCE_RATE_LIMITED"],
    [500, "SOURCE_UNAVAILABLE"],
  ])("maps HTTP %s without leaking provider details", async (status, code) => {
    const source = createSource(
      vi.fn().mockResolvedValue(new Response(null, { status })),
    );

    await expect(source.search(criteria())).rejects.toMatchObject({ code });
  });

  it("maps Sri Lanka aliases and ISO codes without defaulting country to us", () => {
    expect(resolveLocation(["lk"])).toEqual({
      country: "lk",
      queryPlace: "Sri Lanka",
      language: "en",
    });
    expect(resolveLocation(["srilanka"])).toEqual({
      country: "lk",
      queryPlace: "Sri Lanka",
      language: "en",
    });
    expect(resolveLocation(["Sri Lanka"])).toEqual({
      country: "lk",
      queryPlace: "Sri Lanka",
      language: "en",
    });
    expect(resolveLocation(["Colombo"])).toEqual({
      country: "lk",
      queryPlace: "Colombo",
      language: "en",
    });

    const url = buildSearchUrl("https://jsearch.p.rapidapi.com", {
      ...criteria(),
      locations: ["lk"],
      work_modes: [],
      employment_types: [],
    });
    expect(url.toString()).toBe(
      "https://jsearch.p.rapidapi.com/search-v2?query=Software+Engineer+jobs+in+Sri+Lanka&num_pages=1&date_posted=all&country=lk&language=en",
    );
  });

  it("maps fetch timeouts to a clear unavailable error", async () => {
    const timeout = Object.assign(new Error("The operation was aborted"), {
      name: "TimeoutError",
    });
    const source = createSource(vi.fn().mockRejectedValue(timeout));

    await expect(source.search(criteria())).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      message: expect.stringContaining("timed out"),
    });
  });
});

function createSource(fetch: ReturnType<typeof vi.fn>, baseUrl?: string) {
  return new JSearchJobSource({
    apiKey: "secret",
    baseUrl: baseUrl ?? "https://api.openwebninja.com/jsearch",
    timeoutMs: 100,
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
}

function criteria(): JobSearchCriteria {
  return jobSearchCriteriaSchema.parse({
    role_titles: ["Software Engineer"],
    locations: ["Colombo", "Remote"],
    work_modes: ["remote"],
    employment_types: ["full_time"],
    experience_levels: [],
    excluded_keywords: ["Senior"],
    page_size: 10,
    cursor: null,
  });
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
