import { z } from "zod";

import type { JobSource } from "../application/ports";
import {
  normalizedExternalJobSchema,
  titleMatchesExcludedKeyword,
  type ExperienceLevel,
  type JobSearchCriteria,
  type JobSourceResult,
  type NormalizedExternalJob,
} from "../domain/job";
import { JobDiscoveryError } from "../domain/errors";

type Fetch = typeof globalThis.fetch;

const DEFAULT_BASE_URL = "https://api.theirstack.com";
const DEFAULT_POSTED_AT_MAX_AGE_DAYS = 30;

const locationSchema = z
  .object({
    name: z.string().nullish(),
    display_name: z.string().nullish(),
    country_code: z.string().nullish(),
    country_name: z.string().nullish(),
    state: z.string().nullish(),
    state_code: z.string().nullish(),
    admin1_name: z.string().nullish(),
  })
  .passthrough();

const companyObjectSchema = z
  .object({
    name: z.string().nullish(),
    logo: z.string().nullish(),
    url: z.string().nullish(),
    domain: z.string().nullish(),
  })
  .passthrough();

const providerJobSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    job_title: z.string().nullish(),
    normalized_title: z.string().nullish(),
    company: z.union([z.string(), z.null()]).nullish(),
    company_object: companyObjectSchema.nullish(),
    description: z.string().nullish(),
    location: z.string().nullish(),
    long_location: z.string().nullish(),
    short_location: z.string().nullish(),
    city: z.string().nullish(),
    cities: z.array(z.string()).nullish(),
    country: z.string().nullish(),
    country_code: z.string().nullish(),
    country_codes: z.array(z.string()).nullish(),
    state_code: z.string().nullish(),
    locations: z.array(locationSchema).nullish(),
    remote: z.boolean().nullish(),
    hybrid: z.boolean().nullish(),
    seniority: z.string().nullish(),
    employment_statuses: z.array(z.string()).nullish(),
    date_posted: z.string().nullish(),
    discovered_at: z.string().nullish(),
    closed_at: z.string().nullish(),
    min_annual_salary: z.number().nullish(),
    max_annual_salary: z.number().nullish(),
    salary_currency: z.string().nullish(),
    url: z.string().nullish(),
    final_url: z.string().nullish(),
    source_url: z.string().nullish(),
  })
  .passthrough();

const providerResponseSchema = z
  .object({
    data: z.array(z.unknown()).default([]),
    metadata: z
      .object({
        total_results: z.number().nullish(),
      })
      .passthrough()
      .optional(),
    error: z
      .object({
        code: z.string().nullish(),
        title: z.string().nullish(),
        description: z.string().nullish(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type TheirStackSearchBody = {
  job_title_or: string[];
  job_country_code_or: string[];
  posted_at_max_age_days: number;
  is_closed: boolean;
  limit: number;
  page: number;
  remote?: boolean;
};

const COUNTRY_HINTS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\bsri\s*lanka\b|\bsrilanka\b|\bcolombo\b|\bkandy\b|\bgalle\b|\blk\b/iu, code: "LK" },
  { pattern: /\bunited\s*kingdom\b|\bengland\b|\blondon\b|\buk\b|\bgb\b/iu, code: "GB" },
  {
    pattern: /\bindia\b|\bbangalore\b|\bbengaluru\b|\bmumbai\b|\bdelhi\b|\bhyderabad\b/iu,
    code: "IN",
  },
  { pattern: /\bsingapore\b|\bsg\b/iu, code: "SG" },
  { pattern: /\baustralia\b|\bsydney\b|\bmelbourne\b/iu, code: "AU" },
  { pattern: /\bcanada\b|\btoronto\b|\bvancouver\b/iu, code: "CA" },
  { pattern: /\bgermany\b|\bberlin\b|\bmunich\b/iu, code: "DE" },
  {
    pattern:
      /\bunited\s*states\b|\busa\b|\bnew\s*york\b|\bsan\s*francisco\b|\bchicago\b/iu,
    code: "US",
  },
];

export class TheirStackJobSource implements JobSource {
  readonly identity = { key: "theirstack", name: "TheirStack" } as const;

  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl?: string;
      timeoutMs: number;
      postedAtMaxAgeDays?: number;
      /** Own fetch budget — do not inherit the hybrid aggregate page size. */
      pageSize?: number;
      fetch?: Fetch;
    },
  ) {}

  async search(criteria: JobSearchCriteria): Promise<JobSourceResult> {
    const baseUrl = (this.options.baseUrl ?? DEFAULT_BASE_URL).replace(
      /\/+$/u,
      "",
    );
    const url = `${baseUrl}/v1/jobs/search`;
    const pageSize = this.options.pageSize ?? criteria.page_size;
    const body = buildTheirStackSearchBody(
      { ...criteria, page_size: pageSize },
      {
        postedAtMaxAgeDays:
          this.options.postedAtMaxAgeDays ?? DEFAULT_POSTED_AT_MAX_AGE_DAYS,
      },
    );
    let response: Response;
    try {
      response = await (this.options.fetch ?? globalThis.fetch)(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new JobDiscoveryError(
          "SOURCE_UNAVAILABLE",
          "Job search timed out before TheirStack responded. Try again with fewer roles or a broader location.",
          { cause: error },
        );
      }
      throw new JobDiscoveryError(
        "SOURCE_UNAVAILABLE",
        "We couldn't search for jobs right now. Try again.",
        { cause: error },
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new JobDiscoveryError(
        "SOURCE_UNAUTHORIZED",
        "TheirStack is not configured correctly. Add THEIRSTACK_API_KEY to the server environment.",
      );
    }
    if (response.status === 429) {
      throw new JobDiscoveryError(
        "SOURCE_RATE_LIMITED",
        "TheirStack is temporarily rate limited. Try again later.",
      );
    }
    if (!response.ok) {
      throw new JobDiscoveryError(
        "SOURCE_UNAVAILABLE",
        "We couldn't search for jobs right now. Try again.",
      );
    }

    try {
      const parsed = providerResponseSchema.parse(await response.json());
      if (parsed.error) {
        throw new Error(
          parsed.error.description ??
            parsed.error.title ??
            "TheirStack returned an error payload.",
        );
      }

      const jobs = parsed.data.flatMap((rawJob) => {
        const parsedJob = providerJobSchema.safeParse(rawJob);
        if (!parsedJob.success) return [];
        try {
          return [normalizeTheirStackJob(parsedJob.data)];
        } catch {
          return [];
        }
      });

      if (parsed.data.length > 0 && jobs.length === 0) {
        throw new Error("No TheirStack jobs matched the expected contract.");
      }

      const filtered = jobs
        .filter(
          (job) =>
            !titleMatchesExcludedKeyword(
              job.title,
              criteria.excluded_keywords,
            ),
        )
        .slice(0, pageSize);

      const nextPage = decodePageCursor(criteria.cursor) + 1;
      const maybeMore =
        parsed.data.length >= body.limit ||
        (typeof parsed.metadata?.total_results === "number" &&
          (nextPage + 1) * body.limit < parsed.metadata.total_results);

      return {
        jobs: filtered,
        nextCursor: maybeMore ? String(nextPage) : null,
        partialFailure: jobs.length < parsed.data.length,
      };
    } catch (error) {
      if (error instanceof JobDiscoveryError) throw error;
      throw new JobDiscoveryError(
        "SOURCE_UNAVAILABLE",
        "The job source returned an unexpected response. Try again.",
        { cause: error },
      );
    }
  }
}

export function buildTheirStackSearchBody(
  criteria: JobSearchCriteria,
  options: { postedAtMaxAgeDays?: number } = {},
): TheirStackSearchBody {
  const page = decodePageCursor(criteria.cursor);
  const body: TheirStackSearchBody = {
    job_title_or: [...new Set(criteria.role_titles)].slice(0, 5),
    job_country_code_or: inferCountryCodes(criteria.locations),
    posted_at_max_age_days:
      options.postedAtMaxAgeDays ?? DEFAULT_POSTED_AT_MAX_AGE_DAYS,
    is_closed: false,
    limit: criteria.page_size,
    page,
  };

  if (
    criteria.work_modes.includes("remote") &&
    !criteria.work_modes.includes("onsite") &&
    !criteria.work_modes.includes("hybrid")
  ) {
    body.remote = true;
  }

  return body;
}

export function inferCountryCodes(locations: string[]): string[] {
  const codes = new Set<string>();
  for (const location of locations) {
    const normalized = location.trim();
    if (!normalized || isRemoteLocation(normalized)) continue;
    const compact = normalized.toLocaleLowerCase().replace(/[\s._-]+/gu, "");
    if (/^[a-z]{2}$/iu.test(normalized)) {
      codes.add(normalized.toUpperCase());
      continue;
    }
    if (compact === "lk" || compact === "srilanka") {
      codes.add("LK");
      continue;
    }
    for (const hint of COUNTRY_HINTS) {
      if (hint.pattern.test(normalized)) {
        codes.add(hint.code);
      }
    }
  }
  return codes.size > 0 ? [...codes] : ["US"];
}

export function normalizeTheirStackJob(
  job: z.infer<typeof providerJobSchema>,
): NormalizedExternalJob {
  const title = textOrNull(job.job_title) ?? textOrNull(job.normalized_title);
  if (!title) {
    throw new Error("TheirStack job is missing a title.");
  }

  const companyName =
    textOrNull(
      typeof job.company === "string" ? job.company : null,
    ) ?? textOrNull(job.company_object?.name);
  const primaryLocation = job.locations?.[0];
  const city =
    textOrNull(job.city) ??
    textOrNull(job.cities?.[0]) ??
    textOrNull(primaryLocation?.name) ??
    null;
  const countryCode =
    textOrNull(job.country_code) ??
    textOrNull(job.country_codes?.[0]) ??
    textOrNull(primaryLocation?.country_code) ??
    null;
  const country =
    textOrNull(job.country) ??
    textOrNull(primaryLocation?.country_name) ??
    countryCode;
  const location =
    textOrNull(job.long_location) ??
    textOrNull(job.location) ??
    textOrNull(job.short_location) ??
    textOrNull(primaryLocation?.display_name) ??
    null;

  const applicationUrl =
    httpUrlOrNull(job.final_url) ??
    httpUrlOrNull(job.url) ??
    httpUrlOrNull(job.source_url);
  const sourceUrl =
    httpUrlOrNull(job.source_url) ??
    httpUrlOrNull(job.url) ??
    httpUrlOrNull(job.final_url);
  const publisher = publisherFromUrl(job.source_url ?? job.url ?? null);

  return normalizedExternalJobSchema.parse({
    external_id: String(job.id),
    title,
    organization: companyName
      ? {
          name: companyName,
          logo_url: httpUrlOrNull(job.company_object?.logo),
          website_url: websiteUrlOrNull(
            job.company_object?.url ?? job.company_object?.domain ?? null,
          ),
        }
      : null,
    description: textOrNull(job.description),
    location,
    city,
    region:
      textOrNull(job.state_code) ??
      textOrNull(primaryLocation?.state) ??
      textOrNull(primaryLocation?.admin1_name) ??
      null,
    country,
    employment_type: normalizeEmploymentType(job.employment_statuses),
    work_mode: normalizeWorkMode(job.remote, job.hybrid),
    experience_level: normalizeSeniority(job.seniority),
    salary_min:
      typeof job.min_annual_salary === "number" ? job.min_annual_salary : null,
    salary_max:
      typeof job.max_annual_salary === "number" ? job.max_annual_salary : null,
    salary_currency: textOrNull(job.salary_currency),
    salary_period:
      job.min_annual_salary != null || job.max_annual_salary != null
        ? "YEAR"
        : null,
    published_at: toIsoTimestamp(job.date_posted),
    closing_at: toIsoTimestamp(job.closed_at),
    publisher,
    source_url: sourceUrl,
    application_url: applicationUrl,
    application_is_direct: applicationUrl
      ? applicationUrl !== sourceUrl
      : null,
    raw_payload: job as Record<string, unknown>,
  });
}

function decodePageCursor(cursor: string | null): number {
  if (!cursor) return 0;
  const page = Number.parseInt(cursor, 10);
  return Number.isFinite(page) && page >= 0 ? page : 0;
}

function isRemoteLocation(location: string): boolean {
  return /\bremote\b|\bwfh\b|\bwork\s*from\s*home\b/iu.test(location);
}

function normalizeEmploymentType(
  statuses: string[] | null | undefined,
): NormalizedExternalJob["employment_type"] {
  const value = statuses?.[0]?.toLocaleLowerCase();
  if (!value) return null;
  if (value.includes("full")) return "full_time";
  if (value.includes("part")) return "part_time";
  if (value.includes("contract") || value.includes("freelance")) {
    return "contract";
  }
  if (value.includes("intern")) return "internship";
  return "other";
}

function normalizeWorkMode(
  remote: boolean | null | undefined,
  hybrid: boolean | null | undefined,
): NormalizedExternalJob["work_mode"] {
  if (remote) return "remote";
  if (hybrid) return "hybrid";
  if (remote === false && hybrid === false) return "onsite";
  return null;
}

function normalizeSeniority(
  seniority: string | null | undefined,
): ExperienceLevel | null {
  if (!seniority) return null;
  const value = seniority.toLocaleLowerCase();
  if (/(intern|entry|junior|graduate)/u.test(value)) return "entry";
  if (/(mid|intermediate)/u.test(value)) return "mid";
  if (/(senior|staff|principal)/u.test(value)) return "senior";
  if (/(lead|manager|head)/u.test(value)) return "lead";
  if (/(c_level|executive|director|vp|chief)/u.test(value)) return "executive";
  return null;
}

function publisherFromUrl(value: string | null): string | null {
  const url = httpUrlOrNull(value);
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return null;
  }
}

function websiteUrlOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return httpUrlOrNull(value);
  }
  return httpUrlOrNull(`https://${value}`);
}

function httpUrlOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function textOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    // date_posted may be YYYY-MM-DD
    const day = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(day.getTime()) ? null : day.toISOString();
  }
  return parsed.toISOString();
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    /aborted|timeout/iu.test(error.message)
  );
}
