import "server-only";

import { z } from "zod";

const configSchema = z.object({
  DEMO_USER_ID: z.uuid(),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("cv-sources"),
  GROQ_API_KEY: z.string().min(1),
  GROQ_MODEL: z.string().min(1),
});

export type ServerConfig = z.infer<typeof configSchema>;

let cachedConfig: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  cachedConfig ??= configSchema.parse(process.env);
  return cachedConfig;
}
