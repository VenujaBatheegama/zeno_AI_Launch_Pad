import type { JobSource } from "../application/ports";
import {
  normalizedExternalJobSchema,
  titleMatchesExcludedKeyword,
  type JobSearchCriteria,
  type JobSourceResult,
  type NormalizedExternalJob,
} from "../domain/job";
import {
  jobMatchesLocationPreferences,
  linkedInGeoIdForLocations,
} from "../domain/location-match";
import { JobDiscoveryError } from "../domain/errors";

type Fetch = typeof globalThis.fetch;

const DEFAULT_BASE_URL = "https://www.linkedin.com";

/**
 * Unofficial LinkedIn jobs-guest HTML endpoint.
 * Useful coverage for markets like Sri Lanka, but undocumented/unsupported —
 * keep enablement explicit via JOB_SOURCES and tolerate failure in hybrid fan-out.
 */
export class LinkedInGuestJobSource implements JobSource {
  readonly identity = { key: "linkedin", name: "LinkedIn (guest)" } as const;

  constructor(
    private readonly options: {
      baseUrl?: string;
      timeoutMs: number;
      maxPages?: number;
      maxQueries?: number;
      pageSize?: number;
      enrichDescriptions?: boolean;
      enrichLimit?: number;
      fetch?: Fetch;
    },
  ) {}

  async search(criteria: JobSearchCriteria): Promise<JobSourceResult> {
    const baseUrl = (this.options.baseUrl ?? DEFAULT_BASE_URL).replace(
      /\/+$/u,
      "",
    );
    const maxPages = this.options.maxPages ?? 2;
    const maxQueries = this.options.maxQueries ?? 2;
    const pageSize = this.options.pageSize ?? criteria.page_size;
    const enrichDescriptions = this.options.enrichDescriptions ?? true;
    const enrichLimit = this.options.enrichLimit ?? Math.min(pageSize, 10);
    const location = primaryLocation(criteria.locations) ?? "Sri Lanka";
    const geoId = linkedInGeoIdForLocations(criteria.locations);
    const queries = [...new Set(criteria.role_titles)]
      .map((title) => title.trim())
      .filter(Boolean)
      .slice(0, maxQueries);

    if (queries.length === 0) {
      return { jobs: [], nextCursor: null, partialFailure: false };
    }

    const collected: NormalizedExternalJob[] = [];

    for (const keywords of queries) {
      for (let page = 0; page < maxPages; page += 1) {
        const start = page * 25;
        const url = buildGuestSearchUrl(baseUrl, {
          keywords,
          location,
          geoId,
          start,
          recencySeconds: 2_592_000,
        });

        let response: Response;
        try {
          response = await (this.options.fetch ?? globalThis.fetch)(url, {
            method: "GET",
            headers: {
              Accept: "text/html,application/xhtml+xml",
              "User-Agent":
                "Mozilla/5.0 (compatible; ZenoCareerAgent/0.1; +https://localhost)",
            },
            signal: AbortSignal.timeout(this.options.timeoutMs),
          });
        } catch (error) {
          throw new JobDiscoveryError(
            "SOURCE_UNAVAILABLE",
            "We couldn't reach LinkedIn guest search right now. Try again.",
            { cause: error },
          );
        }

        if (response.status === 429) {
          throw new JobDiscoveryError(
            "SOURCE_RATE_LIMITED",
            "LinkedIn guest search is temporarily rate limited. Try again later.",
          );
        }
        if (response.status === 403) {
          throw new JobDiscoveryError(
            "SOURCE_FORBIDDEN",
            "LinkedIn guest search is temporarily unavailable.",
          );
        }
        if (!response.ok) {
          throw new JobDiscoveryError(
            "SOURCE_UNAVAILABLE",
            "LinkedIn guest search returned an unexpected response. Try again.",
          );
        }

        const html = await response.text();
        if (looksLikeLinkedInBlockPage(html)) {
          throw new JobDiscoveryError(
            "SOURCE_UNAVAILABLE",
            "LinkedIn guest search returned an unexpected response. Try again.",
          );
        }
        const pageJobs = parseLinkedInGuestHtml(html);
        if (pageJobs.length === 0) break;
        collected.push(...pageJobs);
        if (collected.length >= pageSize) break;
        // Guest pages are typically ~10 cards; stop early on short pages.
        if (pageJobs.length < 5) break;
      }
      if (collected.length >= pageSize) break;
    }

    const byId = new Map<string, NormalizedExternalJob>();
    for (const job of collected) {
      if (
        titleMatchesExcludedKeyword(job.title, criteria.excluded_keywords)
      ) {
        continue;
      }
      if (!jobMatchesLocationPreferences(job, criteria.locations)) {
        continue;
      }
      if (!byId.has(job.external_id)) byId.set(job.external_id, job);
    }

    let jobs = [...byId.values()].slice(0, pageSize);
    if (enrichDescriptions && enrichLimit > 0) {
      jobs = await enrichLinkedInDescriptions(jobs, {
        baseUrl,
        timeoutMs: this.options.timeoutMs,
        limit: enrichLimit,
        fetch: this.options.fetch ?? globalThis.fetch,
      });
    }
    return {
      jobs,
      nextCursor: null,
      partialFailure: false,
    };
  }

  /**
   * Narrow freshness poll: one primary role, overlapping recency window,
   * newest-first, cards only — never fetch job-detail HTML here.
   */
  async searchFreshCards(input: {
    keywords: string;
    location: string;
    recencySeconds: number;
    maxPages?: number;
    pageSize?: number;
    sortBy?: "DD";
  }): Promise<JobSourceResult> {
    const baseUrl = (this.options.baseUrl ?? DEFAULT_BASE_URL).replace(
      /\/+$/u,
      "",
    );
    const maxPages = Math.min(this.options.maxPages ?? 1, input.maxPages ?? 1);
    const pageSize = Math.min(
      this.options.pageSize ?? 10,
      input.pageSize ?? 10,
    );
    const keywords = input.keywords.trim();
    if (!keywords) {
      return { jobs: [], nextCursor: null, partialFailure: false };
    }
    const location = input.location.trim() || "Sri Lanka";
    const geoId = linkedInGeoIdForLocations([location]);
    const collected: NormalizedExternalJob[] = [];

    for (let page = 0; page < Math.max(1, maxPages); page += 1) {
      const start = page * 25;
      const url = buildGuestSearchUrl(baseUrl, {
        keywords,
        location,
        geoId,
        start,
        recencySeconds: input.recencySeconds,
        sortBy: input.sortBy ?? "DD",
      });

      let response: Response;
      try {
        response = await (this.options.fetch ?? globalThis.fetch)(url, {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent":
              "Mozilla/5.0 (compatible; ZenoCareerAgent/0.1; +https://localhost)",
          },
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
      } catch (error) {
        throw new JobDiscoveryError(
          "SOURCE_UNAVAILABLE",
          "We couldn't reach LinkedIn guest search right now. Try again.",
          { cause: error },
        );
      }

      if (response.status === 429) {
        throw new JobDiscoveryError(
          "SOURCE_RATE_LIMITED",
          "LinkedIn guest search is temporarily rate limited. Try again later.",
        );
      }
      if (response.status === 403) {
        throw new JobDiscoveryError(
          "SOURCE_FORBIDDEN",
          "LinkedIn guest search is temporarily unavailable.",
        );
      }
      if (!response.ok) {
        throw new JobDiscoveryError(
          "SOURCE_UNAVAILABLE",
          "LinkedIn guest search returned an unexpected response. Try again.",
        );
      }

      const html = await response.text();
      if (looksLikeLinkedInBlockPage(html)) {
        throw new JobDiscoveryError(
          "SOURCE_UNAVAILABLE",
          "LinkedIn guest search returned an unexpected response. Try again.",
        );
      }
      const pageJobs = parseLinkedInGuestHtml(html);
      if (pageJobs.length === 0) break;
      collected.push(...pageJobs);
      if (collected.length >= pageSize) break;
      if (pageJobs.length < 5) break;
    }

    const byId = new Map<string, NormalizedExternalJob>();
    for (const job of collected) {
      if (!byId.has(job.external_id)) byId.set(job.external_id, job);
    }

    return {
      jobs: [...byId.values()].slice(0, pageSize),
      nextCursor: null,
      partialFailure: false,
    };
  }

  async fetchJobDescription(externalId: string): Promise<string | null> {
    const baseUrl = (this.options.baseUrl ?? DEFAULT_BASE_URL).replace(
      /\/+$/u,
      "",
    );
    return fetchLinkedInJobDescription(baseUrl, externalId, {
      timeoutMs: this.options.timeoutMs,
      fetch: this.options.fetch ?? globalThis.fetch,
    });
  }
}

export function buildGuestSearchUrl(
  baseUrl: string,
  options: {
    keywords: string;
    location: string;
    start: number;
    geoId?: string | null;
    recencySeconds?: number;
    sortBy?: "DD" | null;
  },
): string {
  const url = new URL(
    `${baseUrl.replace(/\/+$/u, "")}/jobs-guest/jobs/api/seeMoreJobPostings/search`,
  );
  url.searchParams.set("keywords", options.keywords);
  url.searchParams.set("location", options.location);
  if (options.geoId) {
    url.searchParams.set("geoId", options.geoId);
  }
  url.searchParams.set("start", String(options.start));
  const recencySeconds = options.recencySeconds ?? 2_592_000;
  url.searchParams.set("f_TPR", `r${recencySeconds}`);
  if (options.sortBy) {
    url.searchParams.set("sortBy", options.sortBy);
  }
  return url.toString();
}

export function looksLikeLinkedInBlockPage(html: string): boolean {
  if (!html.trim()) return false;
  const lower = html.toLocaleLowerCase();
  const hasCards = /urn:li:jobposting:/iu.test(html);
  if (hasCards) return false;
  return (
    /authwall|captcha|challenge-form|security check|join now/iu.test(lower) &&
    html.length > 400
  );
}

export function parseLinkedInGuestHtml(html: string): NormalizedExternalJob[] {
  if (!html.trim()) return [];

  const cards = html.split(/data-entity-urn="urn:li:jobPosting:/iu).slice(1);
  const jobs: NormalizedExternalJob[] = [];

  for (const card of cards) {
    const idMatch = card.match(/^(\d+)/u);
    if (!idMatch?.[1]) continue;
    const externalId = idMatch[1];

    const title =
      firstMatch(card, /base-search-card__title[^>]*>\s*([^<]+)/iu) ??
      firstMatch(card, /sr-only">\s*([^<]+)/iu);
    if (!title) continue;

    const company =
      firstMatch(
        card,
        /base-search-card__subtitle[\s\S]*?<a[^>]*>\s*([^<]+)/iu,
      ) ?? null;
    const companyUrl =
      firstMatch(
        card,
        /base-search-card__subtitle[\s\S]*?<a[^>]*href="([^"]+)"/iu,
      ) ?? null;
    const location =
      firstMatch(card, /job-search-card__location[^>]*>\s*([^<]+)/iu) ?? null;
    const href =
      firstMatch(card, /base-card__full-link[^>]*href="([^"]+)"/iu) ??
      firstMatch(card, /href="(https?:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"]+)"/iu);
    const posted =
      firstMatch(card, /datetime="(\d{4}-\d{2}-\d{2})"/iu) ?? null;

    const applyUrl = canonicalizeLinkedInJobUrl(decodeHtml(href));
    const { city, country, label } = splitLocation(location);

    try {
      jobs.push(
        normalizedExternalJobSchema.parse({
          external_id: externalId,
          title: decodeHtml(title).trim(),
          organization: company
            ? {
                name: decodeHtml(company).trim(),
                logo_url: null,
                website_url: httpUrlOrNull(decodeHtml(companyUrl)),
              }
            : null,
          description: null,
          location: label,
          city,
          region: null,
          country,
          employment_type: null,
          work_mode: null,
          experience_level: null,
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          salary_period: null,
          published_at: posted ? `${posted}T00:00:00.000Z` : null,
          closing_at: null,
          publisher: "linkedin.com",
          source_url: applyUrl,
          application_url: applyUrl,
          application_is_direct: false,
          raw_payload: {
            provider: "linkedin_guest",
            job_posting_id: externalId,
          },
        }),
      );
    } catch {
      // Skip malformed cards rather than failing the whole page.
    }
  }

  return jobs;
}

export async function enrichLinkedInDescriptions(
  jobs: NormalizedExternalJob[],
  options: {
    baseUrl: string;
    timeoutMs: number;
    limit: number;
    fetch: Fetch;
  },
): Promise<NormalizedExternalJob[]> {
  const targets = jobs.slice(0, options.limit);
  const remainder = jobs.slice(options.limit);
  const enriched = await Promise.all(
    targets.map(async (job) => {
      if (job.description && job.description.trim().length >= 80) return job;
      const description = await fetchLinkedInJobDescription(
        options.baseUrl,
        job.external_id,
        options,
      );
      if (!description) return job;
      return {
        ...job,
        description,
        raw_payload: {
          ...job.raw_payload,
          description_enriched: true,
        },
      };
    }),
  );
  return [...enriched, ...remainder];
}

export function parseLinkedInJobDetailHtml(html: string): string | null {
  const markup =
    firstMatch(
      html,
      /show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/iu,
    ) ??
    firstMatch(html, /description__text[^>]*>([\s\S]*?)<\/div>/iu) ??
    firstMatch(
      html,
      /class="description__text[^"]*"[^>]*>([\s\S]*?)<\/div>/iu,
    );
  if (!markup) return null;
  const text = stripHtml(markup);
  return text.length >= 40 ? text : null;
}

async function fetchLinkedInJobDescription(
  baseUrl: string,
  externalId: string,
  options: { timeoutMs: number; fetch: Fetch },
): Promise<string | null> {
  const url = `${baseUrl.replace(/\/+$/u, "")}/jobs-guest/jobs/api/jobPosting/${externalId}`;
  try {
    const response = await options.fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; ZenoCareerAgent/0.1; +https://localhost)",
      },
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (!response.ok) return null;
    return parseLinkedInJobDetailHtml(await response.text());
  } catch {
    return null;
  }
}

function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/giu, "\n")
      .replace(/<\/p>/giu, "\n")
      .replace(/<li>/giu, "- ")
      .replace(/<[^>]+>/gu, " "),
  )
    .replace(/\s+/gu, " ")
    .trim();
}

function primaryLocation(locations: string[]): string | null {
  for (const location of locations) {
    const trimmed = location.trim();
    if (!trimmed) continue;
    if (/^remote$/iu.test(trimmed)) continue;
    return trimmed;
  }
  return null;
}

function splitLocation(location: string | null): {
  city: string | null;
  country: string | null;
  label: string | null;
} {
  if (!location) return { city: null, country: null, label: null };
  const label = decodeHtml(location).replace(/\s+/gu, " ").trim();
  if (!label) return { city: null, country: null, label: null };

  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  const country = parts.at(-1) ?? null;
  const city = parts.length > 1 ? parts[0]! : null;
  return { city, country, label };
}

function canonicalizeLinkedInJobUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/u, "");
  } catch {
    return null;
  }
}

function httpUrlOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function firstMatch(input: string, pattern: RegExp): string | null {
  const match = pattern.exec(input);
  return match?.[1]?.trim() ? match[1].trim() : null;
}

function decodeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&nbsp;/gu, " ")
    .trim();
}
