import { describe, expect, it } from "vitest";

import {
  formatFirstSeenLabel,
  formatPublicationLabel,
} from "./fresh-watch";

describe("honest freshness wording", () => {
  it("labels Zeno first-seen time without claiming publication time", () => {
    const now = new Date("2026-08-13T10:08:00.000Z");
    expect(
      formatFirstSeenLabel("2026-08-13T10:00:00.000Z", now),
    ).toBe("First seen by Zeno 8 minutes ago");
    expect(formatPublicationLabel(null)).toBe("Publication time unavailable");
    expect(formatPublicationLabel("2026-08-13T09:50:00.000Z")).toBe(
      "Posted recently",
    );
  });
});
