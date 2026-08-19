import { describe, expect, it } from "vitest";

import { canResurface } from "./resurfacing";

const DAY_MS = 1000 * 60 * 60 * 24;

function daysAgo(n: number, from = new Date()): string {
  return new Date(from.getTime() - n * DAY_MS).toISOString();
}

function daysFromNow(n: number, from = new Date()): string {
  return new Date(from.getTime() + n * DAY_MS).toISOString();
}

describe("canResurface", () => {
  const WINDOW = 30;
  const now = new Date("2026-08-01T12:00:00Z");
  const asOf = now.toISOString();

  it("returns false when lastSeenAt is null (no new sighting)", () => {
    expect(
      canResurface({
        dismissedAt: daysAgo(35, now),
        lastSeenAt: null,
        windowDays: WINDOW,
        asOf,
      }),
    ).toBe(false);
  });

  it("returns false when within the re-surfacing window (29 days)", () => {
    const dismissedAt = daysAgo(29, now);
    const lastSeenAt = daysFromNow(1, new Date(dismissedAt));
    expect(
      canResurface({ dismissedAt, lastSeenAt, windowDays: WINDOW, asOf }),
    ).toBe(false);
  });

  it("returns false when outside window but no new sighting after dismissal", () => {
    const dismissedAt = daysAgo(35, now);
    const lastSeenAt = daysAgo(37, now); // before dismissal
    expect(
      canResurface({ dismissedAt, lastSeenAt, windowDays: WINDOW, asOf }),
    ).toBe(false);
  });

  it("returns true when outside window AND new sighting after dismissal", () => {
    const dismissedAt = daysAgo(35, now);
    const lastSeenAt = daysAgo(3, now); // after dismissal
    expect(
      canResurface({ dismissedAt, lastSeenAt, windowDays: WINDOW, asOf }),
    ).toBe(true);
  });

  it("returns false when lastSeenAt equals dismissedAt exactly (not strictly after)", () => {
    const dismissedAt = daysAgo(35, now);
    const lastSeenAt = dismissedAt; // same timestamp
    expect(
      canResurface({ dismissedAt, lastSeenAt, windowDays: WINDOW, asOf }),
    ).toBe(false);
  });

  it("supports custom window (7 days)", () => {
    const dismissedAt = daysAgo(8, now);
    const lastSeenAt = daysAgo(1, now);
    expect(
      canResurface({ dismissedAt, lastSeenAt, windowDays: 7, asOf }),
    ).toBe(true);
  });
});
