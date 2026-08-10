import {
  userProfileSchema,
  type OnboardingMethod,
  type OnboardingStatus,
  type UserProfile,
} from "../domain/profile";

const store = new Map<string, UserProfile>();

function now() {
  return new Date().toISOString();
}

export class MemoryProfileRepository {
  async getOrCreate(userId: string, displayName?: string | null): Promise<UserProfile> {
    const existing = await this.get(userId);
    if (existing) return existing;

    const created = userProfileSchema.parse({
      userId,
      displayName: displayName ?? "Demo",
      onboardingStatus: "completed",
      onboardingMethod: "manual",
      onboardingCurrentStep: null,
      onboardingProgress: 100,
      onboardingState: { source: "memory_fallback" },
      careerProfileVerifiedAt: now(),
      careerProfileVersion: 1,
      createdAt: now(),
      updatedAt: now(),
    });
    store.set(userId, created);
    return created;
  }

  async get(userId: string): Promise<UserProfile | null> {
    return store.get(userId) ?? null;
  }

  async updateOnboarding(
    userId: string,
    patch: {
      displayName?: string | null;
      onboardingStatus?: OnboardingStatus;
      onboardingMethod?: OnboardingMethod | null;
      onboardingCurrentStep?: string | null;
      onboardingProgress?: number;
      onboardingState?: Record<string, unknown>;
      careerProfileVerifiedAt?: string | null;
      careerProfileVersion?: number;
    },
  ): Promise<UserProfile> {
    const current = await this.getOrCreate(userId);
    const next = userProfileSchema.parse({
      ...current,
      displayName:
        patch.displayName !== undefined ? patch.displayName : current.displayName,
      onboardingStatus: patch.onboardingStatus ?? current.onboardingStatus,
      onboardingMethod:
        patch.onboardingMethod !== undefined
          ? patch.onboardingMethod
          : current.onboardingMethod,
      onboardingCurrentStep:
        patch.onboardingCurrentStep !== undefined
          ? patch.onboardingCurrentStep
          : current.onboardingCurrentStep,
      onboardingProgress: patch.onboardingProgress ?? current.onboardingProgress,
      onboardingState: patch.onboardingState ?? current.onboardingState,
      careerProfileVerifiedAt:
        patch.careerProfileVerifiedAt !== undefined
          ? patch.careerProfileVerifiedAt
          : current.careerProfileVerifiedAt,
      careerProfileVersion:
        patch.careerProfileVersion ?? current.careerProfileVersion,
      updatedAt: now(),
    });
    store.set(userId, next);
    return next;
  }
}
