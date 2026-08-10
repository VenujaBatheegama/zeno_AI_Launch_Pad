import { z } from "zod";

export const onboardingStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "awaiting_verification",
  "completed",
]);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const onboardingMethodSchema = z.enum([
  "cv_import",
  "conversation",
  "manual",
]);
export type OnboardingMethod = z.infer<typeof onboardingMethodSchema>;

export const userProfileSchema = z
  .object({
    userId: z.string().uuid(),
    displayName: z.string().nullable(),
    onboardingStatus: onboardingStatusSchema,
    onboardingMethod: onboardingMethodSchema.nullable(),
    onboardingCurrentStep: z.string().nullable(),
    onboardingProgress: z.number().int().min(0).max(100),
    onboardingState: z.record(z.string(), z.unknown()).default({}),
    careerProfileVerifiedAt: z.string().nullable(),
    careerProfileVersion: z.number().int().min(0),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export type UserProfile = z.infer<typeof userProfileSchema>;

export function isOnboardingComplete(profile: UserProfile): boolean {
  return profile.onboardingStatus === "completed";
}
