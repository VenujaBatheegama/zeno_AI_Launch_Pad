import type { SupabaseClient } from "@supabase/supabase-js";

import {
  userProfileSchema,
  type OnboardingMethod,
  type OnboardingStatus,
  type UserProfile,
} from "../domain/profile";

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  onboarding_status: OnboardingStatus;
  onboarding_method: OnboardingMethod | null;
  onboarding_current_step: string | null;
  onboarding_progress: number;
  onboarding_state: Record<string, unknown>;
  career_profile_verified_at: string | null;
  career_profile_version: number;
  created_at: string;
  updated_at: string;
};

export class SupabaseProfileRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getOrCreate(userId: string, displayName?: string | null): Promise<UserProfile> {
    const existing = await this.get(userId);
    if (existing) return existing;

    const { data, error } = await this.client
      .from("user_profiles")
      .upsert(
        {
          user_id: userId,
          display_name: displayName ?? null,
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(
        error?.message
          ? `Could not create your profile. ${error.message}`
          : "Could not create your profile. Please try again.",
      );
    }

    return mapRow(data as ProfileRow);
  }

  async get(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this.client
      .from("user_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(
        error.message?.includes("user_profiles") || error.code === "PGRST205"
          ? `Could not load your profile. ${error.message}`
          : "Could not load your profile.",
      );
    }
    if (!data) return null;
    return mapRow(data as ProfileRow);
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
    const payload: Record<string, unknown> = {};
    if (patch.displayName !== undefined) payload.display_name = patch.displayName;
    if (patch.onboardingStatus !== undefined) {
      payload.onboarding_status = patch.onboardingStatus;
    }
    if (patch.onboardingMethod !== undefined) {
      payload.onboarding_method = patch.onboardingMethod;
    }
    if (patch.onboardingCurrentStep !== undefined) {
      payload.onboarding_current_step = patch.onboardingCurrentStep;
    }
    if (patch.onboardingProgress !== undefined) {
      payload.onboarding_progress = patch.onboardingProgress;
    }
    if (patch.onboardingState !== undefined) {
      payload.onboarding_state = patch.onboardingState;
    }
    if (patch.careerProfileVerifiedAt !== undefined) {
      payload.career_profile_verified_at = patch.careerProfileVerifiedAt;
    }
    if (patch.careerProfileVersion !== undefined) {
      payload.career_profile_version = patch.careerProfileVersion;
    }

    const { data, error } = await this.client
      .from("user_profiles")
      .update(payload)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error("Could not save your onboarding progress.");
    }

    return mapRow(data as ProfileRow);
  }
}

function mapRow(row: ProfileRow): UserProfile {
  return userProfileSchema.parse({
    userId: row.user_id,
    displayName: row.display_name,
    onboardingStatus: row.onboarding_status,
    onboardingMethod: row.onboarding_method,
    onboardingCurrentStep: row.onboarding_current_step,
    onboardingProgress: row.onboarding_progress,
    onboardingState: row.onboarding_state ?? {},
    careerProfileVerifiedAt: row.career_profile_verified_at,
    careerProfileVersion: row.career_profile_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
