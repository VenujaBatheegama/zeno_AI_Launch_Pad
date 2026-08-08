import { z } from "zod";

import type { JobSource } from "../application/ports";
import {
  normalizedExternalJobSchema,
  titleMatchesExcludedKeyword,
  type JobSearchCriteria,
  type JobSourceResult,
  type NormalizedExternalJob,
} from "../domain/job";
import { JobDiscoveryError } from "../domain/errors";

type Fetch = typeof globalThis.fetch;

const DEFAULT_BASE_URL = "https://itpro.lk";

/** Known ITPro location IDs observed from public listings / RSS labels. */
const LOCATION_BY_ID: Record<string, { city: string | null; label: string }> = {
  "79": { city: "Colombo", label: "Colombo, Sri Lanka" },
  // Remote feed exists on ITPro RSS; ID may vary — kept for future enrichment.
};

const providerJobSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string().min(1),
    description: z.string().nullish(),
    summary: z.string().nullish(),
    company: z.string().nullish(),
    location: z.union([z.string(), z.number()]).nullish(),
    website: z.string().nullish(),
    created_on: z.string().nullish(),
    type_id: z.union([z.string(), z.number()]).nullish(),
    category_id: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough();

export class ITProJobSource implements JobSource {
  readonly identity = { key: "itpro", name: "ITPro.lk" } as const;

  constructor(
    private readonly options: {
      baseUrl?: string;
      timeoutMs: number;
      pageSize?: number;
      fetch?: Fetch;
    },
  ) {}

  async search(criteria: JobSearchCriteria): Promise<JobSourceResult> {
    const baseUrl = (this.options.baseUrl ?? DEFAULT_BASE_URL).replace(
      /\/+$/u,
      "",
    );
    const url = `${baseUrl}/api/v1/jobs`;

    let response: Response;
    try {
      response = await (this.options.fetch ?? globalThis.fetch)(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      throw new JobDiscoveryError(
        "SOURCE_UNAVAILABLE",
        "We couldn't reach ITPro.lk right now. Try again.",
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new JobDiscoveryError(
        "SOURCE_UNAVAILABLE",
        "ITPro.lk returned an unexpected response. Try again.",
      );
    }

    try {
      const payload = z.array(z.unknown()).parse(await response.json());
      const limit = this.options.pageSize ?? criteria.page_size;
      const titleNeedles = criteria.role_titles.map((title) =>
        title.toLocaleLowerCase(),
      );
      const jobs = payload
        .flatMap((raw) => {
          const parsed = providerJobSchema.safeParse(raw);
          if (!parsed.success) return [];
          try {
            return [normalizeITProJob(parsed.data, baseUrl)];
          } catch {
            return [];
          }
        })
        .filter((job) => matchesTitleFamily(job.title, titleNeedles))
        .filter(
          (job) =>
            !titleMatchesExcludedKeyword(job.title, criteria.excluded_keywords),
        )
        .slice(0, limit);

      return {
        jobs,
        nextCursor: null,
        partialFailure: false,
      };
    } catch (error) {
      throw new JobDiscoveryError(
        "SOURCE_UNAVAILABLE",
        "ITPro.lk returned an unexpected response. Try again.",
        { cause: error },
      );
    }
  }
}

export function normalizeITProJob(
  job: z.infer<typeof providerJobSchema>,
  baseUrl = DEFAULT_BASE_URL,
): NormalizedExternalJob {
  const id = String(job.id);
  const applyUrl = `${baseUrl.replace(/\/+$/u, "")}/job/${id}`;
  const locationId =
    job.location === null || job.location === undefined
      ? null
      : String(job.location);
  const mapped = locationId ? LOCATION_BY_ID[locationId] : undefined;
  const fromSummary = locationFromSummary(job.summary);
  const city = mapped?.city ?? fromSummary.city;
  const location =
    mapped?.label ??
    fromSummary.label ??
    (city ? `${city}, Sri Lanka` : "Sri Lanka");

  return normalizedExternalJobSchema.parse({
    external_id: id,
    title: job.title.trim(),
    organization: job.company?.trim()
      ? {
          name: job.company.trim(),
          logo_url: null,
          website_url: httpUrlOrNull(job.website),
        }
      : null,
    description: textOrNull(stripHtml(job.description ?? job.summary ?? null)),
    location,
    city,
    region: null,
    country: "Sri Lanka",
    employment_type: mapTypeId(job.type_id),
    work_mode: /\bremote\b/iu.test(`${job.summary ?? ""} ${job.title}`)
      ? "remote"
      : null,
    experience_level: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    published_at: toIsoTimestamp(job.created_on),
    closing_at: null,
    publisher: "itpro.lk",
    source_url: applyUrl,
    application_url: applyUrl,
    application_is_direct: true,
    raw_payload: job as Record<string, unknown>,
  });
}

function matchesTitleFamily(title: string, needles: string[]): boolean {
  if (needles.length === 0) return true;
  const haystack = normalizeTitlePhrase(title);
  return needles.some((needle) => {
    const normalizedNeedle = normalizeTitlePhrase(needle);
    if (!normalizedNeedle) return false;
    // Phrase match keeps "Software Engineer" → "Associate Software Engineer"
    // without treating "Cloud ERP" as "Cloud Engineer".
    if (haystack.includes(normalizedNeedle)) return true;
    const tokens = normalizedNeedle.split(" ").filter((token) => token.length > 2);
    if (tokens.length < 2) return false;
    // Ordered whole-word match for light variants (punctuation/spacing).
    let from = 0;
    for (const token of tokens) {
      const pattern = new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(token)}(?:$|[^\\p{L}\\p{N}])`,
        "iu",
      );
      const slice = haystack.slice(from);
      const match = pattern.exec(slice);
      if (!match) return false;
      from += (match.index ?? 0) + match[0].length;
    }
    return true;
  });
}

function normalizeTitlePhrase(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/\bengineers\b/gu, "engineer")
    .replace(/\bdevelopers\b/gu, "developer")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function mapTypeId(
  typeId: string | number | null | undefined,
): NormalizedExternalJob["employment_type"] {
  switch (String(typeId ?? "")) {
    case "1":
      return "full_time";
    case "2":
      return "part_time";
    case "3":
      return "contract";
    case "4":
      return "internship";
    default:
      return null;
  }
}

function locationFromSummary(summary: string | null | undefined): {
  city: string | null;
  label: string | null;
} {
  if (!summary) return { city: null, label: null };
  const match = summary.match(
    /\bin\s+([A-Za-z][A-Za-z\s]+?)(?:,|\.|$)/u,
  );
  if (!match?.[1]) return { city: null, label: null };
  const city = match[1].trim();
  if (!city || /full-?time|part-?time|internship/iu.test(city)) {
    return { city: null, label: null };
  }
  return { city, label: `${city}, Sri Lanka` };
}

function stripHtml(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&#\d+;/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
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
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(
    normalized.endsWith("Z") ? normalized : `${normalized}+05:30`,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
