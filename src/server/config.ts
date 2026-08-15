import "server-only";

import { z } from "zod";

import {
  assertSupportedGroqModelConfig,
  GROQ_DEFAULT_FALLBACK_MODELS,
  GROQ_DEFAULT_PRIMARY_MODEL,
} from "./groq-models";

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
    // Primary key (still required for backwards compatibility).
    GROQ_API_KEY: z.string().min(1),
    // Optional extra free-tier keys for temporary MVP rotation.
    GROQ_API_KEY_2: z.string().min(1).optional(),
    GROQ_API_KEY_3: z.string().min(1).optional(),
    // Optional comma-separated override/addition: key1,key2,key3
    GROQ_API_KEYS: z.string().optional(),
    GROQ_MODEL: z.string().min(1).default(GROQ_DEFAULT_PRIMARY_MODEL),
    // Comma-separated models tried after GROQ_MODEL hits rate limits / failures.
    // Prefer json_schema-capable models (openai/gpt-oss-*).
    GROQ_FALLBACK_MODELS: z
      .string()
      .default(GROQ_DEFAULT_FALLBACK_MODELS.join(",")),
    // Campaign / proactive agent
    CRON_SECRET: z.string().min(16).optional(),
    CAMPAIGN_ANALYSIS_BATCH_SIZE: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10),
    CAMPAIGN_MAX_RECOMMENDATIONS_PER_RUN: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5),
    CAMPAIGN_RECOMMENDATION_MIN_SCORE: z.coerce
      .number()
      .min(0)
      .max(100)
      .default(55),
    CAMPAIGN_FOLLOW_UP_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    CAMPAIGN_CRON_USER_BATCH_SIZE: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10),
    FRESH_LINKEDIN_INTERVAL_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(180)
      .default(15),
    FRESH_LINKEDIN_RECENCY_SECONDS: z.coerce
      .number()
      .int()
      .min(900)
      .max(86_400)
      .default(3600),
    FRESH_BROAD_INTERVAL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(48)
      .default(12),
    FRESH_MAX_CANONICAL_SEARCHES_PER_TICK: z.coerce
      .number()
      .int()
      .min(1)
      .max(25)
      .default(5),
    FRESH_LINKEDIN_MAX_PAGES: z.coerce.number().int().min(1).max(2).default(1),
    FRESH_LINKEDIN_MAX_RESULTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(25)
      .default(10),
    FRESH_MAX_DESCRIPTION_FETCHES_PER_TICK: z.coerce
      .number()
      .int()
      .min(0)
      .max(25)
      .default(8),
    FRESH_MAX_GROQ_ANALYSES_PER_TICK: z.coerce
      .number()
      .int()
      .min(0)
      .max(20)
      .default(8),
    FRESH_MAX_ANALYSES_PER_USER: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(3),
    FRESH_PROVIDER_COOLDOWN_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(240)
      .default(30),
    FRESH_SCHEDULER_LEASE_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(600)
      .default(120),
    FRESH_INITIAL_ALERT_CAP: z.coerce.number().int().min(0).max(10).default(3),
    LINKEDIN_FRESH_ENABLED: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value !== "false"),
    WHATSAPP_ENABLED: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
    WHATSAPP_BUSINESS_PHONE_E164: z.string().min(8).optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
    WHATSAPP_APP_SECRET: z.string().min(1).optional(),
    WHATSAPP_TEMPLATE_RECOMMENDATION: z.string().min(1).optional(),
    WHATSAPP_TEMPLATE_LANGUAGE: z.string().min(2).default("en"),
    WHATSAPP_GRAPH_API_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/u)
      .default("v21.0"),
    PUBLIC_APP_BASE_URL: z.string().url().optional(),
    GROWTH_MARKET_MIN_ANALYSED_JOBS: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5),
    CAREER_EXTRACTION_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(4)
      .default(2),
    CAREER_EXTRACTION_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(2)
      .default(2),
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
      .default(15),
    ESCO_API_BASE_URL: z
      .string()
      .min(1)
      .default("https://ec.europa.eu/esco/api"),
    ESCO_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(60000)
      .default(10000),
    ESCO_LANGUAGE: z.string().min(2).max(10).default("en"),
    ESCO_MAX_ALTERNATIVE_TITLES: z.coerce
      .number()
      .int()
      .min(0)
      .max(3)
      .default(2),
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

    const groqFallbackModels = [
      ...new Set(
        config.GROQ_FALLBACK_MODELS.split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .filter((value) => value !== config.GROQ_MODEL),
      ),
    ];

    assertSupportedGroqModelConfig({
      primary: config.GROQ_MODEL,
      fallbacks: groqFallbackModels,
    });

    const fromList = (config.GROQ_API_KEYS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const groqApiKeys = [
      ...new Set(
        [
          config.GROQ_API_KEY,
          config.GROQ_API_KEY_2,
          config.GROQ_API_KEY_3,
          ...fromList,
        ].filter((value): value is string => Boolean(value?.trim())),
      ),
    ];

    return {
      ...config,
      jsearchApiKey: apiKey,
      jsearchBaseUrl: baseUrl.replace(/\/+$/u, ""),
      theirstackApiKey: config.THEIRSTACK_API_KEY,
      theirstackBaseUrl: config.THEIRSTACK_BASE_URL.replace(/\/+$/u, ""),
      jobSources,
      groqFallbackModels,
      groqApiKeys,
    };
  });

export type ServerConfig = z.infer<typeof configSchema>;
export type JobSourceKey = z.infer<typeof jobSourceKeySchema>;

let cachedConfig: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  // In development, re-parse so `next` env reloads pick up model/key changes.
  if (process.env.NODE_ENV === "development") {
    return configSchema.parse(process.env);
  }
  cachedConfig ??= configSchema.parse(process.env);
  return cachedConfig;
}
