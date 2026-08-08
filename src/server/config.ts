import "server-only";

import { z } from "zod";

const jobSourceKeySchema = z.enum([
  "linkedin",
  "jsearch",
  "theirstack",
  "itpro",
]);

const configSchema = z
  .object({
    DEMO_USER_ID: z.uuid(),
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_STORAGE_BUCKET: z.string().min(1).default("cv-sources"),
    GROQ_API_KEY: z.string().min(1),
    GROQ_MODEL: z.string().min(1),
    JSEARCH_API_KEY: z.string().min(1).optional(),
    RAPIDAPI_KEY: z.string().min(1).optional(),
    JSEARCH_BASE_URL: z
      .string()
      .min(1)
      .default("https://api.openwebninja.com/jsearch"),
    // Kept for older local env files; prefer JSEARCH_BASE_URL.
    JSEARCH_API_HOST: z.string().min(1).optional(),
    JSEARCH_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(120000)
      .default(60000),
    JSEARCH_MAX_REQUESTS: z.coerce.number().int().min(1).max(5).default(1),
    JSEARCH_MAX_PAGES: z.coerce.number().int().min(1).max(5).default(2),
    JSEARCH_PAGE_SIZE: z.coerce.number().int().min(1).max(20).default(10),
    CAREER_SEARCH_QUERY_BUDGET: z.coerce
      .number()
      .int()
      .min(1)
      .max(8)
      .default(2),
    CAREER_ANALYSIS_BATCH_SIZE: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5),
    // Hybrid provider list, comma-separated. All enabled sources are equal peers.
    JOB_SOURCES: z
      .string()
      .min(1)
      .default("linkedin,jsearch,theirstack,itpro"),
    LINKEDIN_BASE_URL: z.string().min(1).default("https://www.linkedin.com"),
    LINKEDIN_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(60000)
      .default(20000),
    LINKEDIN_PAGE_SIZE: z.coerce.number().int().min(1).max(50).default(25),
    LINKEDIN_MAX_PAGES: z.coerce.number().int().min(1).max(4).default(2),
    LINKEDIN_MAX_QUERIES: z.coerce.number().int().min(1).max(4).default(2),
    // Fetch guest job-detail pages so analyse/match has descriptions.
    LINKEDIN_ENRICH_DESCRIPTIONS: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    LINKEDIN_ENRICH_LIMIT: z.coerce.number().int().min(0).max(25).default(10),
    THEIRSTACK_API_KEY: z.string().min(1).optional(),
    THEIRSTACK_BASE_URL: z
      .string()
      .min(1)
      .default("https://api.theirstack.com"),
    THEIRSTACK_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(120000)
      .default(60000),
    THEIRSTACK_POSTED_AT_MAX_AGE_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(30),
    THEIRSTACK_PAGE_SIZE: z.coerce.number().int().min(1).max(25).default(5),
    ITPRO_BASE_URL: z.string().min(1).default("https://itpro.lk"),
    ITPRO_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(60000)
      .default(20000),
    ITPRO_PAGE_SIZE: z.coerce.number().int().min(1).max(50).default(20),
  })
  .transform((config) => {
    const apiKey = config.JSEARCH_API_KEY ?? config.RAPIDAPI_KEY;
    const baseUrl = config.JSEARCH_API_HOST
      ? config.JSEARCH_API_HOST.startsWith("http")
        ? config.JSEARCH_API_HOST
        : `https://${config.JSEARCH_API_HOST}`
      : config.RAPIDAPI_KEY && !config.JSEARCH_API_KEY
        ? "https://jsearch.p.rapidapi.com"
        : config.JSEARCH_BASE_URL;

    const jobSources = [
      ...new Set(
        config.JOB_SOURCES.split(",")
          .map((value) => value.trim().toLocaleLowerCase())
          .filter(Boolean)
          .map((value) => jobSourceKeySchema.parse(value)),
      ),
    ];

    return {
      ...config,
      jsearchApiKey: apiKey,
      jsearchBaseUrl: baseUrl.replace(/\/+$/u, ""),
      theirstackApiKey: config.THEIRSTACK_API_KEY,
      theirstackBaseUrl: config.THEIRSTACK_BASE_URL.replace(/\/+$/u, ""),
      jobSources,
    };
  });

export type ServerConfig = z.infer<typeof configSchema>;
export type JobSourceKey = z.infer<typeof jobSourceKeySchema>;

let cachedConfig: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  cachedConfig ??= configSchema.parse(process.env);
  return cachedConfig;
}
