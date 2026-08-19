/**
 * Classifies a Supabase/PostgREST schema-cache error into the missing migration
 * that caused it. Returns null when the error is not a recognisable schema miss.
 */

export type MigrationGap = {
  migrationFile: string;
  feature: string;
  description: string;
};

/**
 * Maps migration number → feature metadata.
 * 0001–0009 are pre-campaign core migrations; we surface a generic banner for those.
 */
export const MIGRATION_FEATURE_MAP: Record<string, MigrationGap> = {
  "0010": {
    migrationFile: "supabase/migrations/0010_career_campaign.sql",
    feature: "Job Campaign",
    description:
      "Campaign runs, job recommendations, application packets, and applications tables are missing.",
  },
  "0011": {
    migrationFile: "supabase/migrations/0011_fresh_job_watch.sql",
    feature: "Fresh Job Watch",
    description: "Fresh job watch tables are missing.",
  },
  "0012": {
    migrationFile: "supabase/migrations/0012_observe_provider_job_ambiguous.sql",
    feature: "Job Observation",
    description: "Provider ambiguity tracking tables are missing.",
  },
  "0013": {
    migrationFile: "supabase/migrations/0013_career_friend.sql",
    feature: "Career Friend chat",
    description: "Career Friend conversation history tables are missing.",
  },
  "0014": {
    migrationFile: "supabase/migrations/0014_job_search_campaigns.sql",
    feature: "Job Search Campaigns",
    description:
      "Job search campaign tables (canonical searches, sightings) are missing.",
  },
  "0015": {
    migrationFile: "supabase/migrations/0015_career_growth.sql",
    feature: "Career Growth",
    description:
      "Career Growth assessment, recommendations, and project tables are missing.",
  },
  "0016": {
    migrationFile: "supabase/migrations/0016_whatsapp_connection.sql",
    feature: "WhatsApp integration",
    description: "WhatsApp connection tables are missing.",
  },
  "0017": {
    migrationFile: "supabase/migrations/0017_telegram_connection.sql",
    feature: "Telegram integration",
    description: "Telegram connection tables are missing.",
  },
  "0018": {
    migrationFile: "supabase/migrations/0018_application_outcomes.sql",
    feature: "Application Outcomes index",
    description: "Application outcomes partial index is missing.",
  },
};

/** Core migrations (pre-campaign). */
const CORE_MIGRATION_NUMBERS = ["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009"];

function isSchemaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const obj = error as Record<string, unknown>;
  const cause = obj["cause"] as Record<string, unknown> | undefined;
  const message = `${cause?.["message"] ?? ""} ${obj["message"] ?? ""}`.toLocaleLowerCase();
  return (
    cause?.["code"] === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

/**
 * Extracts a specific migration number hint from the error message.
 * PostgREST errors often mention the missing table name; we map that back to
 * the migration that introduced it.
 */
function extractMigrationHint(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const obj = error as Record<string, unknown>;
  const cause = obj["cause"] as Record<string, unknown> | undefined;
  const message = `${cause?.["message"] ?? ""} ${obj["message"] ?? ""}`.toLocaleLowerCase();

  if (
    message.includes("telegram") ||
    message.includes("telegram_connections") ||
    message.includes("telegram_link")
  )
    return "0017";
  if (
    message.includes("whatsapp") ||
    message.includes("whatsapp_connections") ||
    message.includes("whatsapp_link")
  )
    return "0016";
  if (
    message.includes("growth_assessment") ||
    message.includes("growth_recommendation") ||
    message.includes("growth_project")
  )
    return "0015";
  if (
    message.includes("job_search_campaign") ||
    message.includes("campaign_listing_sighting") ||
    message.includes("canonical_search")
  )
    return "0014";
  if (message.includes("career_friend") || message.includes("advisor_message"))
    return "0013";
  if (message.includes("provider_job_ambiguous")) return "0012";
  if (message.includes("fresh_job_watch")) return "0011";
  if (
    message.includes("campaign_run") ||
    message.includes("job_recommendation") ||
    message.includes("application_packet") ||
    message.includes("job_application") ||
    message.includes("feedback_signal")
  )
    return "0010";

  return null; // generic schema miss
}

/**
 * Classifies a thrown error into a `MigrationGap`, or returns null if the
 * error is not a recognisable schema miss.
 */
export function classifyMissingMigration(error: unknown): MigrationGap | null {
  if (!isSchemaError(error)) return null;
  const hint = extractMigrationHint(error);
  if (!hint) {
    // Core migration miss — return a generic gap for 0001
    return {
      migrationFile: "supabase/migrations/0001_slice_0.sql",
      feature: "Core schema",
      description:
        "One or more core database migrations (0001–0009) are missing.",
    };
  }
  if (CORE_MIGRATION_NUMBERS.includes(hint)) {
    return {
      migrationFile: `supabase/migrations/${hint}_slice_*.sql`,
      feature: "Core schema",
      description:
        "One or more core database migrations (0001–0009) are missing.",
    };
  }
  return MIGRATION_FEATURE_MAP[hint] ?? null;
}
