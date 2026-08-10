import { describe, expect, it } from "vitest";

import { isOnboardingComplete, userProfileSchema } from "./profile";

describe("userProfileSchema", () => {
  it("parses onboarding state for a new user", () => {
    const profile = userProfileSchema.parse({
      userId: "00000000-0000-4000-8000-000000000099",
      displayName: "Ada",
      onboardingStatus: "not_started",
      onboardingMethod: null,
      onboardingCurrentStep: null,
      onboardingProgress: 0,
      onboardingState: {},
      careerProfileVerifiedAt: null,
      careerProfileVersion: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(isOnboardingComplete(profile)).toBe(false);
  });

  it("marks completed profiles as finished", () => {
    const profile = userProfileSchema.parse({
      userId: "00000000-0000-4000-8000-000000000099",
      displayName: "Ada",
      onboardingStatus: "completed",
      onboardingMethod: "cv_import",
      onboardingCurrentStep: "completed",
      onboardingProgress: 100,
      onboardingState: {},
      careerProfileVerifiedAt: new Date().toISOString(),
      careerProfileVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(isOnboardingComplete(profile)).toBe(true);
  });
});
