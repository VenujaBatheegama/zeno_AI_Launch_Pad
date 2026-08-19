import { describe, expect, it } from "vitest";

import { classifyMissingMigration } from "./migration-guard";

function makeSchemaError(message: string, causeMessage?: string): unknown {
  const err = new Error(message);
  Object.assign(err, {
    code: "PERSISTENCE_FAILED",
    cause: causeMessage
      ? { code: "PGRST205", message: causeMessage }
      : { code: "PGRST205", message: "" },
  });
  return err;
}

describe("classifyMissingMigration", () => {
  it("returns null for a non-schema error", () => {
    expect(classifyMissingMigration(new Error("network error"))).toBeNull();
    expect(classifyMissingMigration("string error")).toBeNull();
    expect(classifyMissingMigration(null)).toBeNull();
  });

  it("identifies a missing campaign schema (0010) from table name in message", () => {
    const gap = classifyMissingMigration(
      makeSchemaError("could not find the table campaign_runs"),
    );
    expect(gap?.migrationFile).toContain("0010");
    expect(gap?.feature).toBe("Job Campaign");
  });

  it("identifies a missing campaign schema (0010) from PGRST205 code", () => {
    const gap = classifyMissingMigration(
      makeSchemaError("Persistence failed", "schema cache lookup failed for job_recommendation"),
    );
    expect(gap?.migrationFile).toContain("0010");
  });

  it("identifies a missing Growth schema (0015) from table mention", () => {
    const gap = classifyMissingMigration(
      makeSchemaError("could not find the table growth_assessment"),
    );
    expect(gap?.migrationFile).toContain("0015");
    expect(gap?.feature).toBe("Career Growth");
  });

  it("identifies a missing Telegram schema (0017) from table mention", () => {
    const gap = classifyMissingMigration(
      makeSchemaError("could not find the table telegram_connections"),
    );
    expect(gap?.migrationFile).toContain("0017");
    expect(gap?.feature).toBe("Telegram integration");
  });

  it("identifies a missing WhatsApp schema (0016)", () => {
    const gap = classifyMissingMigration(
      makeSchemaError("could not find the table whatsapp_connections"),
    );
    expect(gap?.migrationFile).toContain("0016");
  });

  it("returns a generic core-schema gap for an unrecognised table miss", () => {
    const gap = classifyMissingMigration(
      makeSchemaError("could not find the table unknown_table"),
    );
    // Should still return a gap (schema error confirmed)
    expect(gap).not.toBeNull();
    expect(gap?.feature).toBe("Core schema");
  });

  it("identifies job search campaign schema (0014)", () => {
    const gap = classifyMissingMigration(
      makeSchemaError("could not find the table job_search_campaign"),
    );
    expect(gap?.migrationFile).toContain("0014");
  });
});
