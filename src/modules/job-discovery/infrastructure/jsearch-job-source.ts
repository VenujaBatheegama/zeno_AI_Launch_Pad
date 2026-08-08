import { z } from "zod";

import type { JobSource } from "../application/ports";
import {
  normalizedExternalJobSchema,
  isJobTitleIncompatibleWithPreferences,
  type EmploymentType,
  type ExperienceLevel,
  type JobSearchCriteria,
  type JobSourceResult,
  type NormalizedExternalJob,
  type WorkMode,
} from "../domain/job";
import { JobDiscoveryError } from "../domain/errors";

type Fetch = typeof globalThis.fetch;

const providerJobSchema = z
  .object({
    job_id: z.string().min(1),
    job_title: z.string().min(1),
    employer_name: z.string().nullish(),
    employer_logo: z.string().nullish(),
    employer_website: z.string().nullish(),
    job_publisher: z.string().nullish(),
    job_employment_type: z.string().nullish(),
    job_employment_types: z.array(z.string()).nullish(),
    job_apply_link: z.string().nullish(),
    job_apply_is_direct: z.boolean().nullish(),
    job_description: z.string().nullish(),
    job_is_remote: z.boolean().nullish(),
    work_arrangement: z.string().nullish(),
    seniority_level: z.string().nullish(),
    job_posted_at_timestamp: z.number().nullish(),
    job_posted_at_datetime_utc: z.string().nullish(),
    job_location: z.string().nullish(),
    job_city: z.string().nullish(),
    job_state: z.string().nullish(),
    job_country: z.string().nullish(),
    job_min_salary: z.number().nullish(),
    job_max_salary: z.number().nullish(),
    job_salary_currency: z.string().nullish(),
    job_salary_period: z.string().nullish(),
    job_offer_expiration_datetime_utc: z.string().nullish(),
    job_google_link: z.string().nullish(),
  })
  .passthrough();

const providerResponseSchema = z
  .object({
    status: z.string().optional(),
    data: z.union([
      z.array(z.unknown()),
      z
        .object({
          jobs: z.array(z.unknown()),
          cursor: z.string().nullish(),
        })
        .passthrough(),
    ]),
  })
  .passthrough();

/**
 * JSearch wants:
 * - `country`: ISO 3166-1 alpha-2 (defaults to `us` if omitted — a common footgun)
 * - `query`: free text that includes a *readable* place name, not a bare ISO code
 *
 * So "lk" must become country=lk + "… in Sri Lanka", never "… in lk" with country=us.
 */
type LocationResolution = {
  country: string;
  /** Human place for the query string; null means country-only search. */
  queryPlace: string | null;
  language: string;
};

type LocationHint = {
  /** Compact form without spaces/punctuation, e.g. srilanka. */
  compactAliases: string[];
  pattern: RegExp;
  country: string;
  /** Canonical country/region name when the user typed a country or ISO code. */
  countryName: string;
  language: string;
  /** City/region aliases that should appear in the query as-is (canonical casing). */
  places: Record<string, string>;
};

const LOCATION_HINTS: LocationHint[] = [
  {
    compactAliases: ["srilanka", "lk"],
    pattern: /\bsri\s*lanka\b|\bcolombo\b|\bkandy\b|\bgalle\b/iu,
    country: "lk",
    countryName: "Sri Lanka",
    language: "en",
    places: {
      colombo: "Colombo",
      kandy: "Kandy",
      galle: "Galle",
    },
  },
  {
    compactAliases: ["unitedkingdom", "uk", "gb", "england"],
    pattern: /\bunited\s*kingdom\b|\bengland\b|\blondon\b/iu,
    country: "gb",
    countryName: "United Kingdom",
    language: "en",
    places: { london: "London", england: "England" },
  },
  {
    compactAliases: ["india", "in"],
    pattern:
      /\bindia\b|\bbangalore\b|\bbengaluru\b|\bmumbai\b|\bdelhi\b|\bhyderabad\b/iu,
    country: "in",
    countryName: "India",
    language: "en",
    places: {
      bangalore: "Bangalore",
      bengaluru: "Bengaluru",
      mumbai: "Mumbai",
      delhi: "Delhi",
      hyderabad: "Hyderabad",
    },
  },
  {
    compactAliases: ["singapore", "sg"],
    pattern: /\bsingapore\b/iu,
    country: "sg",
    countryName: "Singapore",
    language: "en",
    places: { singapore: "Singapore" },
  },
  {
    compactAliases: ["australia", "au"],
    pattern: /\baustralia\b|\bsydney\b|\bmelbourne\b/iu,
    country: "au",
    countryName: "Australia",
    language: "en",
    places: { sydney: "Sydney", melbourne: "Melbourne" },
  },
  {
    compactAliases: ["canada", "ca"],
    pattern: /\bcanada\b|\btoronto\b|\bvancouver\b/iu,
    country: "ca",
    countryName: "Canada",
    language: "en",
    places: { toronto: "Toronto", vancouver: "Vancouver" },
  },
  {
    compactAliases: ["germany", "de"],
    pattern: /\bgermany\b|\bberlin\b|\bmunich\b/iu,
    country: "de",
    countryName: "Germany",
    language: "en",
    places: { berlin: "Berlin", munich: "Munich" },
  },
  {
    compactAliases: ["unitedstates", "usa", "us"],
    pattern:
      /\bunited\s*states\b|\busa\b|\bnew\s*york\b|\bsan\s*francisco\b|\bchicago\b/iu,
    country: "us",
    countryName: "United States",
    language: "en",
    places: {
      "new york": "New York",
      "san francisco": "San Francisco",
      chicago: "Chicago",
    },
  },
];

export class JSearchJobSource implements JobSource {
  readonly identity = { key: "jsearch", name: "JSearch" } as const;

  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl: string;
      timeoutMs: number;
      fetch?: Fetch;
    },
  ) {}

  async search(criteria: JobSearchCriteria): Promise<JobSourceResult> {
    const url = buildSearchUrl(this.options.baseUrl, criteria);

    let response: Response;
    try {
      response = await (this.options.fetch ?? globalThis.fetch)(url, {
        method: "GET",
        headers: buildAuthHeaders(this.options.baseUrl, this.options.apiKey),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new JobDiscoveryError(
          "SOURCE_UNAVAILABLE",
          "Job search timed out before JSearch responded. Try again with fewer roles or a broader location.",
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
        "Job search is not configured correctly.",
      );
    }
    if (response.status === 429) {
      throw new JobDiscoveryError(
        "SOURCE_RATE_LIMITED",
        "Job search is temporarily rate limited. Try again later.",
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
      if (
        parsed.status &&
        !["ok", "success"].includes(parsed.status.toLocaleLowerCase())
      ) {
        throw new Error("Provider response status was not successful.");
      }
      const rawJobs = Array.isArray(parsed.data)
        ? parsed.data
        : parsed.data.jobs;
      const cursor = Array.isArray(parsed.data) ? null : parsed.data.cursor;
      const jobs = rawJobs.flatMap((rawJob) => {
        const parsedJob = providerJobSchema.safeParse(rawJob);
        if (!parsedJob.success) return [];
        try {
          return [normalizeProviderJob(parsedJob.data)];
        } catch {
          return [];
        }
      });
      if (rawJobs.length > 0 && jobs.length === 0) {
        throw new Error("No provider jobs matched the expected contract.");
      }

      const filtered = jobs
        .filter(
          (job) =>
            !isJobTitleIncompatibleWithPreferences(job.title, {
              excluded_keywords: criteria.excluded_keywords,
              experience_levels: criteria.experience_levels,
            }),
        )
        .slice(0, criteria.page_size);

      return {
        jobs: filtered,
        nextCursor: cursor ?? null,
        partialFailure: jobs.length < rawJobs.length,
      };
    } catch (error) {
      throw new JobDiscoveryError(
        "SOURCE_UNAVAILABLE",
        "The job source returned an unexpected response. Try again.",
        { cause: error },
      );
    }
  }
}

export type JSearchRequestPreview = {
  query: string;
  country: string;
  language: string;
  num_pages: string;
  date_posted: string;
  work_from_home: string | null;
  employment_types: string | null;
  job_requirements: string | null;
};

/** Same params Find jobs sends to JSearch (without auth / base URL). */
export function describeJSearchParams(
  criteria: JobSearchCriteria,
): JSearchRequestPreview {
  const role = criteria.role_titles[0];
  const resolved = resolveLocation(criteria.locations);
  const query = resolved.queryPlace
    ? `${role} jobs in ${resolved.queryPlace}`
    : `${role} jobs`;

  const employmentTypes = criteria.employment_types
    .map(toProviderEmploymentType)
    .filter((value): value is string => Boolean(value));
  const requirements = [
    ...new Set(
      criteria.experience_levels
        .map(toProviderRequirement)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  return {
    query,
    country: resolved.country,
    language: resolved.language,
    num_pages: "1",
    date_posted: "all",
    work_from_home: shouldRequestRemoteOnly(criteria) ? "true" : null,
    employment_types:
      employmentTypes.length > 0 ? employmentTypes.join(",") : null,
    job_requirements: requirements.length > 0 ? requirements.join(",") : null,
  };
}

export function buildSearchUrl(
  baseUrl: string,
  criteria: JobSearchCriteria,
): URL {
  const normalizedBase = baseUrl.replace(/\/+$/u, "");
  const url = new URL(`${normalizedBase}/search-v2`);
  const params = describeJSearchParams(criteria);

  url.searchParams.set("query", params.query);
  url.searchParams.set("num_pages", params.num_pages);
  url.searchParams.set("date_posted", params.date_posted);
  url.searchParams.set("country", params.country);
  url.searchParams.set("language", params.language);

  if (criteria.cursor) {
    url.searchParams.set("cursor", criteria.cursor);
  }
  if (params.work_from_home) {
    url.searchParams.set("work_from_home", params.work_from_home);
  }
  if (params.employment_types) {
    url.searchParams.set("employment_types", params.employment_types);
  }
  if (params.job_requirements) {
    url.searchParams.set("job_requirements", params.job_requirements);
  }

  return url;
}

/** Exported for tests — how Zeno maps preference locations onto JSearch params. */
export function resolveLocation(locations: string[]): LocationResolution {
  const raw = primaryPlace(locations);
  if (!raw) {
    return { country: "us", queryPlace: null, language: "en" };
  }

  const normalized = raw.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
  const compact = normalized.replace(/[\s._-]+/gu, "");

  for (const hint of LOCATION_HINTS) {
    const matched =
      hint.compactAliases.includes(compact) || hint.pattern.test(normalized);
    if (!matched) continue;

    const city = hint.places[normalized] ?? hint.places[compact];
    return {
      country: hint.country,
      // Never put bare ISO codes into the query — Google for Jobs ignores them.
      queryPlace: city ?? hint.countryName,
      language: hint.language,
    };
  }

  // Unknown free-text place: keep it in the query, but do not silently search the US.
  // Two-letter tokens are treated as ISO country codes per JSearch docs.
  if (/^[a-z]{2}$/u.test(normalized)) {
    return {
      country: normalized,
      queryPlace: null,
      language: "en",
    };
  }

  return {
    country: "us",
    queryPlace: raw.trim(),
    language: "en",
  };
}

function buildAuthHeaders(
  baseUrl: string,
  apiKey: string,
): Record<string, string> {
  const hostname = new URL(
    baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`,
  ).hostname;

  if (hostname.includes("rapidapi.com")) {
    return {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": hostname,
    };
  }

  return {
    "x-api-key": apiKey,
  };
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    /aborted|timeout/iu.test(error.message)
  );
}

function primaryPlace(locations: string[]): string | null {
  return locations.find((location) => !isRemoteLocation(location)) ?? null;
}

function shouldRequestRemoteOnly(criteria: JobSearchCriteria): boolean {
  const remoteOnlyWorkMode =
    criteria.work_modes.includes("remote") &&
    !criteria.work_modes.includes("onsite") &&
    !criteria.work_modes.includes("hybrid");
  const remoteLocationOnly =
    criteria.locations.some(isRemoteLocation) &&
    primaryPlace(criteria.locations) === null;
  return remoteOnlyWorkMode || remoteLocationOnly;
}

function isRemoteLocation(location: string): boolean {
  return /\bremote\b|\bwfh\b|\bwork\s*from\s*home\b/iu.test(location);
}

function toProviderEmploymentType(type: EmploymentType): string | null {
  switch (type) {
    case "full_time":
      return "FULLTIME";
    case "part_time":
      return "PARTTIME";
    case "contract":
      return "CONTRACTOR";
    case "internship":
      return "INTERN";
    default:
      return null;
  }
}

function toProviderRequirement(level: ExperienceLevel): string | null {
  switch (level) {
    case "entry":
      return "under_3_years_experience";
    case "mid":
    case "senior":
    case "lead":
    case "executive":
      return "more_than_3_years_experience";
    default:
      return null;
  }
}

function normalizeProviderJob(
  job: z.infer<typeof providerJobSchema>,
): NormalizedExternalJob {
  return normalizedExternalJobSchema.parse({
    external_id: job.job_id,
    title: job.job_title,
    organization: job.employer_name
      ? {
          name: job.employer_name,
          logo_url: httpUrlOrNull(job.employer_logo),
          website_url: httpUrlOrNull(job.employer_website),
        }
      : null,
    description: textOrNull(job.job_description),
    location: textOrNull(job.job_location),
    city: textOrNull(job.job_city),
    region: textOrNull(job.job_state),
    country: textOrNull(job.job_country),
    employment_type: normalizeEmploymentType(
      job.job_employment_types?.[0] ?? job.job_employment_type,
    ),
    work_mode: normalizeWorkMode(job.job_is_remote, job.work_arrangement),
    experience_level: normalizeExperienceLevel(job.seniority_level),
    salary_min: job.job_min_salary ?? null,
    salary_max: job.job_max_salary ?? null,
    salary_currency: textOrNull(job.job_salary_currency),
    salary_period: textOrNull(job.job_salary_period),
    published_at: timestampOrNull(
      job.job_posted_at_datetime_utc,
      job.job_posted_at_timestamp,
    ),
    closing_at: isoTimestampOrNull(job.job_offer_expiration_datetime_utc),
    publisher: textOrNull(job.job_publisher),
    source_url: httpUrlOrNull(job.job_google_link),
    application_url: httpUrlOrNull(job.job_apply_link),
    application_is_direct: job.job_apply_is_direct ?? null,
    raw_payload: job,
  });
}

function normalizeEmploymentType(value?: string | null): EmploymentType | null {
  const normalized = value?.replace(/[^a-z]/giu, "").toLowerCase();
  if (normalized === "fulltime") return "full_time";
  if (normalized === "parttime") return "part_time";
  if (normalized === "contract" || normalized === "contractor") return "contract";
  if (normalized === "internship" || normalized === "intern") return "internship";
  return value ? "other" : null;
}

function normalizeWorkMode(
  isRemote?: boolean | null,
  arrangement?: string | null,
): WorkMode | null {
  if (isRemote === true) return "remote";
  const normalized = arrangement?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("remote")) return "remote";
  if (normalized.includes("hybrid")) return "hybrid";
  if (
    normalized.includes("onsite") ||
    normalized.includes("on-site") ||
    normalized.includes("on site")
  ) {
    return "onsite";
  }
  return null;
}

function normalizeExperienceLevel(
  value?: string | null,
): ExperienceLevel | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("entry") || normalized.includes("junior")) return "entry";
  if (normalized.includes("mid")) return "mid";
  if (normalized.includes("senior")) return "senior";
  if (normalized.includes("lead") || normalized.includes("staff")) return "lead";
  if (normalized.includes("executive") || normalized.includes("director")) {
    return "executive";
  }
  return null;
}

function textOrNull(value?: string | null): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function httpUrlOrNull(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function isoTimestampOrNull(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function timestampOrNull(
  value?: string | null,
  unixSeconds?: number | null,
): string | null {
  return (
    isoTimestampOrNull(value) ??
    (unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null)
  );
}
