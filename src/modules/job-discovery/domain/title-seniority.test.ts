import { describe, expect, it } from "vitest";

import { isJobTitleIncompatibleWithPreferences } from "./job";
import {
  inferTitleSeniorityTier,
  titleExceedsPreferredExperience,
} from "./title-seniority";

describe("title seniority inference", () => {
  it("detects elevated titles without the word senior", () => {
    expect(inferTitleSeniorityTier("Principal Platform Engineer")).toBe(
      "senior",
    );
    expect(inferTitleSeniorityTier("Staff Software Engineer")).toBe("senior");
    expect(inferTitleSeniorityTier("Head of People")).toBe("lead");
    expect(inferTitleSeniorityTier("Director of Sales")).toBe("lead");
    expect(inferTitleSeniorityTier("VP Marketing")).toBe("executive");
    expect(inferTitleSeniorityTier("Chief People Officer")).toBe("executive");
  });

  it("does not treat common mid/junior titles as elevated", () => {
    expect(inferTitleSeniorityTier("Software Engineer")).toBeNull();
    expect(inferTitleSeniorityTier("HR Coordinator")).toBeNull();
    expect(inferTitleSeniorityTier("Sales Development Representative")).toBeNull();
    expect(inferTitleSeniorityTier("Lead Generation Specialist")).toBeNull();
    expect(inferTitleSeniorityTier("Product Manager")).toBeNull();
    expect(inferTitleSeniorityTier("Account Manager")).toBeNull();
    expect(inferTitleSeniorityTier("Junior Software Engineer")).toBeNull();
  });

  it("filters elevated titles for entry-oriented preferences", () => {
    expect(
      titleExceedsPreferredExperience("Principal Platform Engineer", []),
    ).toBe(true);
    expect(
      titleExceedsPreferredExperience("Principal Platform Engineer", ["entry"]),
    ).toBe(true);
    expect(
      titleExceedsPreferredExperience("Software Engineer", ["entry"]),
    ).toBe(false);
    expect(
      titleExceedsPreferredExperience("Principal Platform Engineer", [
        "senior",
      ]),
    ).toBe(false);
    expect(
      titleExceedsPreferredExperience("VP Sales", ["senior"]),
    ).toBe(true);
  });

  it("combines seniority with excluded-keyword aliases", () => {
    expect(
      isJobTitleIncompatibleWithPreferences("Principal Platform Engineer", {
        excluded_keywords: [],
        experience_levels: [],
      }),
    ).toBe(true);
    expect(
      isJobTitleIncompatibleWithPreferences("Principal Consultant", {
        excluded_keywords: ["senior"],
        experience_levels: ["senior"],
      }),
    ).toBe(true);
    expect(
      isJobTitleIncompatibleWithPreferences("Software Engineer", {
        excluded_keywords: ["senior"],
        experience_levels: [],
      }),
    ).toBe(false);
  });
});
