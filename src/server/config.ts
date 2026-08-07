import "server-only";

import { z } from "zod";

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
      .max(60000)
      .default(20000),
    JSEARCH_MAX_REQUESTS: z.coerce.number().int().min(1).max(5).default(1),
    JSEARCH_MAX_PAGES: z.coerce.number().int().min(1).max(5).default(2),
    JSEARCH_PAGE_SIZE: z.coerce.number().int().min(1).max(20).default(10),
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

    return {
      ...config,
      jsearchApiKey: apiKey,
      jsearchBaseUrl: baseUrl.replace(/\/+$/u, ""),
    };
  });

export type ServerConfig = z.infer<typeof configSchema>;

let cachedConfig: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  cachedConfig ??= configSchema.parse(process.env);
  return cachedConfig;
}
