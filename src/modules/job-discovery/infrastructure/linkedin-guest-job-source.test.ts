import { describe, expect, it, vi } from "vitest";

import { jobSearchCriteriaSchema } from "../domain/job";
import {
  LinkedInGuestJobSource,
  parseLinkedInGuestHtml,
  parseLinkedInJobDetailHtml,
} from "./linkedin-guest-job-source";

const SAMPLE_HTML = `
<li>
  <div class="base-card base-search-card job-search-card"
    data-entity-urn="urn:li:jobPosting:4446601813">
    <a class="base-card__full-link"
      href="https://lk.linkedin.com/jobs/view/software-engineer-professional-ii-at-zebra-technologies-4446601813?position=1&amp;pageNum=0&amp;refId=abc&amp;trackingId=xyz">
      <span class="sr-only">Software Engineer, Professional II</span>
    </a>
    <div class="base-search-card__info">
      <h3 class="base-search-card__title">Software Engineer, Professional II</h3>
      <h4 class="base-search-card__subtitle">
        <a href="https://www.linkedin.com/company/zebra-technologies">Zebra Technologies</a>
      </h4>
      <div class="base-search-card__metadata">
        <span class="job-search-card__location">Colombo, Western Province, Sri Lanka</span>
        <time class="job-search-card__listdate" datetime="2026-08-04">4 days ago</time>
      </div>
    </div>
  </div>
</li>
<li>
  <div class="base-card base-search-card job-search-card"
    data-entity-urn="urn:li:jobPosting:111">
    <a class="base-card__full-link"
      href="https://www.linkedin.com/jobs/view/backend-engineer-at-acme-111">
    </a>
    <h3 class="base-search-card__title">Backend Engineer</h3>
    <h4 class="base-search-card__subtitle"><a>Acme</a></h4>
    <span class="job-search-card__location">Sri Lanka</span>
    <time datetime="2026-08-01"></time>
  </div>
</li>
`;

describe("LinkedInGuestJobSource", () => {
  it("parses guest HTML cards into normalized jobs", () => {
    const jobs = parseLinkedInGuestHtml(SAMPLE_HTML);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      external_id: "4446601813",
      title: "Software Engineer, Professional II",
      organization: {
        name: "Zebra Technologies",
        logo_url: null,
        website_url: "https://www.linkedin.com/company/zebra-technologies",
      },
      location: "Colombo, Western Province, Sri Lanka",
      city: "Colombo",
      country: "Sri Lanka",
      publisher: "linkedin.com",
      application_url:
        "https://lk.linkedin.com/jobs/view/software-engineer-professional-ii-at-zebra-technologies-4446601813",
      published_at: "2026-08-04T00:00:00.000Z",
    });
  });

  it("queries the guest endpoint with keywords + location and paginates", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(SAMPLE_HTML, { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    const result = await new LinkedInGuestJobSource({
      timeoutMs: 5000,
      maxPages: 2,
      pageSize: 25,
      enrichDescriptions: false,
      fetch: fetch as unknown as typeof globalThis.fetch,
    }).search(
      jobSearchCriteriaSchema.parse({
        role_titles: ["Software Engineer", "Backend Engineer"],
        locations: ["Sri Lanka"],
        work_modes: [],
        employment_types: [],
        experience_levels: [],
        excluded_keywords: [],
        page_size: 25,
        cursor: null,
      }),
    );

    expect(fetch).toHaveBeenCalled();
    const firstUrl = String(fetch.mock.calls[0]?.[0]);
    expect(firstUrl).toContain("/jobs-guest/jobs/api/seeMoreJobPostings/search");
    expect(firstUrl).toContain("keywords=Software");
    expect(firstUrl).toContain("location=Sri");
    expect(firstUrl).toContain("geoId=100446352");
    expect(result.jobs.length).toBeGreaterThanOrEqual(2);
    expect(result.jobs.every((job) => job.publisher === "linkedin.com")).toBe(
      true,
    );
  });

  it("enriches card results with guest job-detail descriptions", async () => {
    const detailHtml = `
      <div class="show-more-less-html__markup">
        <p>Build reliable platforms with Kubernetes and Terraform in Colombo.</p>
        <p>Collaborate with product teams to ship production-ready services.</p>
      </div>
    `;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(SAMPLE_HTML, { status: 200 }))
      .mockResolvedValueOnce(new Response(detailHtml, { status: 200 }))
      .mockResolvedValueOnce(new Response(detailHtml, { status: 200 }));

    const result = await new LinkedInGuestJobSource({
      timeoutMs: 5000,
      maxPages: 1,
      pageSize: 2,
      enrichDescriptions: true,
      enrichLimit: 2,
      fetch: fetch as unknown as typeof globalThis.fetch,
    }).search(
      jobSearchCriteriaSchema.parse({
        role_titles: ["Software Engineer"],
        locations: ["Sri Lanka"],
        work_modes: [],
        employment_types: [],
        experience_levels: [],
        excluded_keywords: [],
        page_size: 2,
        cursor: null,
      }),
    );

    expect(
      String(fetch.mock.calls[1]?.[0]),
    ).toContain("/jobs-guest/jobs/api/jobPosting/");
    expect(result.jobs[0]?.description).toContain("Kubernetes");
  });

  it("parses guest job-detail HTML into plain text", () => {
    const text = parseLinkedInJobDetailHtml(`
      <div class="show-more-less-html__markup">
        <p>Ship features safely.</p><br/><p>Own production reliability.</p>
      </div>
    `);
    expect(text).toContain("Ship features safely.");
    expect(text).toContain("Own production reliability.");
  });

  it("drops cards outside the preferred country", async () => {
    const foreignHtml = `
      <div data-entity-urn="urn:li:jobPosting:999">
        <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/999"></a>
        <h3 class="base-search-card__title">Software Engineer</h3>
        <h4 class="base-search-card__subtitle"><a>Acme US</a></h4>
        <span class="job-search-card__location">New York, NY</span>
      </div>
    `;
    const fetch = vi.fn().mockResolvedValue(new Response(foreignHtml, { status: 200 }));
    const result = await new LinkedInGuestJobSource({
      timeoutMs: 1000,
      maxPages: 1,
      enrichDescriptions: false,
      fetch: fetch as unknown as typeof globalThis.fetch,
    }).search(
      jobSearchCriteriaSchema.parse({
        role_titles: ["Software Engineer"],
        locations: ["Sri Lanka", "Remote"],
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

  it("isolates guest failures as SOURCE_UNAVAILABLE", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 429 }));
    await expect(
      new LinkedInGuestJobSource({
        timeoutMs: 1000,
        enrichDescriptions: false,
        fetch: fetch as unknown as typeof globalThis.fetch,
      }).search(
        jobSearchCriteriaSchema.parse({
          role_titles: ["Software Engineer"],
          locations: ["Sri Lanka"],
          work_modes: [],
          employment_types: [],
          experience_levels: [],
          excluded_keywords: [],
          page_size: 10,
          cursor: null,
        }),
      ),
    ).rejects.toMatchObject({ code: "SOURCE_RATE_LIMITED" });
  });
});
