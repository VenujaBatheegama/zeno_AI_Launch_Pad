import { z } from "zod";

const optionalHttpUrlSchema = z
  .url()
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"))
  .nullable();
const timestampSchema = z.string().datetime({ offset: true });
const optionalTextSchema = z.string().trim().min(1).nullable();

export const workModeSchema = z.enum(["onsite", "hybrid", "remote"]);
export type WorkMode = z.infer<typeof workModeSchema>;
export const employmentTypeSchema = z.enum([
  "full_time",
  "part_time",
  "contract",
  "internship",
  "other",
]);
export type EmploymentType = z.infer<typeof employmentTypeSchema>;
export const experienceLevelSchema = z.enum([
  "entry",
  "mid",
  "senior",
  "lead",
  "executive",
]);
export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;
export const userJobStateSchema = z.enum(["discovered", "saved", "dismissed"]);
export type UserJobState = z.infer<typeof userJobStateSchema>;

const preferenceList = z
  .array(z.string().trim().min(1).max(100))
  .max(10)
  .transform((values) => [...new Set(values)]);

export const jobSearchPreferencesSchema = z
  .object({
    roles: preferenceList,
    locations: preferenceList,
    work_modes: z.array(workModeSchema).max(3),
    employment_types: z.array(employmentTypeSchema).max(5),
    experience_levels: z.array(experienceLevelSchema).max(5),
    excluded_keywords: preferenceList,
  })
  .strict();

export type JobSearchPreferences = z.infer<typeof jobSearchPreferencesSchema>;

export type JobSearchProfile = {
  id: string;
  userId: string;
  preferences: JobSearchPreferences;
  createdAt: string;
  updatedAt: string;
};

export const jobSearchCriteriaSchema = z
  .object({
    role_titles: z.array(z.string().trim().min(1)).min(1).max(1),
    locations: z.array(z.string().trim().min(1)).max(3),
    work_modes: z.array(workModeSchema),
    employment_types: z.array(employmentTypeSchema),
    experience_levels: z.array(experienceLevelSchema),
    excluded_keywords: z.array(z.string().trim().min(1)).max(10),
    page_size: z.number().int().min(1).max(20),
    cursor: z.string().min(1).nullable(),
  })
  .strict();

export type JobSearchCriteria = z.infer<typeof jobSearchCriteriaSchema>;

export const normalizedExternalJobSchema = z
  .object({
    external_id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    organization: z
      .object({
        name: z.string().trim().min(1),
        logo_url: optionalHttpUrlSchema,
        website_url: optionalHttpUrlSchema,
      })
      .strict()
      .nullable(),
    description: optionalTextSchema,
    location: optionalTextSchema,
    city: optionalTextSchema,
    region: optionalTextSchema,
    country: optionalTextSchema,
    employment_type: employmentTypeSchema.nullable(),
    work_mode: workModeSchema.nullable(),
    experience_level: experienceLevelSchema.nullable(),
    salary_min: z.number().nonnegative().nullable(),
    salary_max: z.number().nonnegative().nullable(),
    salary_currency: optionalTextSchema,
    salary_period: optionalTextSchema,
    published_at: timestampSchema.nullable(),
    closing_at: timestampSchema.nullable(),
    publisher: optionalTextSchema,
    source_url: optionalHttpUrlSchema,
    application_url: optionalHttpUrlSchema,
    application_is_direct: z.boolean().nullable(),
    raw_payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type NormalizedExternalJob = z.infer<
  typeof normalizedExternalJobSchema
>;

export type JobSourceResult = {
  jobs: NormalizedExternalJob[];
  nextCursor: string | null;
  partialFailure: boolean;
};

export const discoveredJobSchema = z
  .object({
    job_id: z.uuid(),
    listing_id: z.uuid(),
    title: z.string().min(1),
    organization_name: optionalTextSchema,
    organization_logo_url: optionalHttpUrlSchema,
    description: optionalTextSchema,
    location: optionalTextSchema,
    city: optionalTextSchema,
    region: optionalTextSchema,
    country: optionalTextSchema,
    employment_type: employmentTypeSchema.nullable(),
    work_mode: workModeSchema.nullable(),
    experience_level: experienceLevelSchema.nullable(),
    salary_min: z.number().nonnegative().nullable(),
    salary_max: z.number().nonnegative().nullable(),
    salary_currency: optionalTextSchema,
    salary_period: optionalTextSchema,
    published_at: timestampSchema.nullable(),
    closing_at: timestampSchema.nullable(),
    publisher: optionalTextSchema,
    source_name: z.string().min(1),
    source_url: optionalHttpUrlSchema,
    application_url: optionalHttpUrlSchema,
    application_is_direct: z.boolean().nullable(),
    first_seen_at: timestampSchema,
    last_seen_at: timestampSchema,
    user_state: userJobStateSchema,
  })
  .strict();

export type DiscoveredJob = z.infer<typeof discoveredJobSchema>;

export type DiscoveryPage = {
  jobs: DiscoveredJob[];
  partialFailure: boolean;
  nextCursor: string | null;
  requestsMade: number;
};

export const emptyJobSearchPreferences: JobSearchPreferences = {
  roles: [],
  locations: [],
  work_modes: [],
  employment_types: [],
  experience_levels: [],
  excluded_keywords: [],
};

export function titleMatchesExcludedKeyword(
  title: string,
  keywords: string[],
): boolean {
  if (keywords.length === 0) return false;
  return keywords.some((keyword) => {
    const normalized = keyword.trim().toLocaleLowerCase();
    if (!normalized) return false;
    const aliases = exclusionAliases(normalized);
    return aliases.some((alias) => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "iu").test(title);
    });
  });
}

function exclusionAliases(keyword: string): string[] {
  if (keyword === "senior") {
    return ["senior", "sr", "snr"];
  }
  return [keyword];
}
