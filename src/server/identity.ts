import "server-only";

import { cache } from "react";

import { MemoryProfileRepository } from "@/modules/identity/infrastructure/memory-profile-repository";
import { SupabaseProfileRepository } from "@/modules/identity/infrastructure/supabase-profile-repository";
import type {
  OnboardingMethod,
  OnboardingStatus,
  UserProfile,
} from "@/modules/identity/domain/profile";

import { requireUser } from "./auth";
import { getServerConfig } from "./config";
import { createSupabaseClient } from "./supabase-client";

type ProfileRepository = {
  getOrCreate(userId: string, displayName?: string | null): Promise<UserProfile>;
  get(userId: string): Promise<UserProfile | null>;
  updateOnboarding(
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
  ): Promise<UserProfile>;
};

let cachedRepository: ProfileRepository | null = null;
let usingMemoryFallback = false;

function isMissingProfilesTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : String(error);
  return (
    message.includes("user_profiles") ||
    message.includes("Could not load your profile") ||
    message.includes("Could not create your profile") ||
    message.includes("Could not find the table")
  );
}

export function getProfileRepository(): ProfileRepository {
  if (cachedRepository) return cachedRepository;

  const supabaseRepo = new SupabaseProfileRepository(
    createSupabaseClient(getServerConfig()),
  );

  cachedRepository = {
    async get(userId) {
      if (usingMemoryFallback) {
        return new MemoryProfileRepository().get(userId);
      }
      try {
        return await supabaseRepo.get(userId);
      } catch (error) {
        if (process.env.NODE_ENV === "development" && isMissingProfilesTable(error)) {
          console.warn(
            "[identity] user_profiles unavailable; using in-memory profile fallback. Apply supabase/migrations/0006_slice_4.sql.",
          );
          usingMemoryFallback = true;
          return new MemoryProfileRepository().get(userId);
        }
        throw error;
      }
    },
    async getOrCreate(userId, displayName) {
      if (usingMemoryFallback) {
        return new MemoryProfileRepository().getOrCreate(userId, displayName);
      }
      try {
        return await supabaseRepo.getOrCreate(userId, displayName);
      } catch (error) {
        if (process.env.NODE_ENV === "development" && isMissingProfilesTable(error)) {
          console.warn(
            "[identity] user_profiles unavailable; using in-memory profile fallback. Apply supabase/migrations/0006_slice_4.sql.",
          );
          usingMemoryFallback = true;
          return new MemoryProfileRepository().getOrCreate(userId, displayName);
        }
        throw error;
      }
    },
    async updateOnboarding(userId, patch) {
      if (usingMemoryFallback) {
        return new MemoryProfileRepository().updateOnboarding(userId, patch);
      }
      try {
        return await supabaseRepo.updateOnboarding(userId, patch);
      } catch (error) {
        if (process.env.NODE_ENV === "development" && isMissingProfilesTable(error)) {
          usingMemoryFallback = true;
          return new MemoryProfileRepository().updateOnboarding(userId, patch);
        }
        throw error;
      }
    },
  };

  return cachedRepository;
}

export const requireProfile = cache(async function requireProfile(): Promise<UserProfile> {
  const user = await requireUser();
  const repository = getProfileRepository();
  return repository.getOrCreate(
    user.id,
    (user.user_metadata?.display_name as string | undefined) ?? null,
  );
});

export async function updateProfileOnboarding(
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
  return getProfileRepository().updateOnboarding(userId, patch);
}
