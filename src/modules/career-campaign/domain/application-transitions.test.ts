import { describe, expect, it } from "vitest";

import {
  assertApplicationTransition,
  assertUserAppliedTransition,
  canTransitionApplication,
} from "./application-transitions";
import { CareerCampaignError } from "./errors";

describe("application transitions", () => {
  it("allows the primary happy path", () => {
    expect(canTransitionApplication("ready", "applied")).toBe(true);
    expect(canTransitionApplication("applied", "interview")).toBe(true);
    expect(canTransitionApplication("interview", "offer")).toBe(true);
  });

  it("rejects invalid jumps", () => {
    expect(canTransitionApplication("ready", "offer")).toBe(false);
    expect(() => assertApplicationTransition("ready", "interview")).toThrow(
      CareerCampaignError,
    );
  });

  it("blocks system from marking applied", () => {
    expect(() =>
      assertUserAppliedTransition("ready", "applied", "system"),
    ).toThrow(/Only the user/);
    expect(() =>
      assertUserAppliedTransition("ready", "applied", "web"),
    ).not.toThrow();
  });
});
