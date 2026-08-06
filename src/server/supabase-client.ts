import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { ServerConfig } from "./config";

export function createSupabaseClient(config: ServerConfig): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
