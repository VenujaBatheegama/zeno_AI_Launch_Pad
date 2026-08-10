import { z } from "zod";

import {
  jobSearchPreferencesSchema,
  type JobSearchProfile,
} from "../domain/job";
import type {
  Clock,
  IdGenerator,
  JobDiscoveryRepository,
} from "./ports";

const savePreferencesCommandSchema = z.object({
  userId: z.uuid(),
  preferences: jobSearchPreferencesSchema,
});

export type SavePreferencesCommand = z.input<
  typeof savePreferencesCommandSchema
>;

export async function getJobSearchProfile(
  userId: string,
  repository: JobDiscoveryRepository,
): Promise<JobSearchProfile | null> {
  return repository.getSearchProfile(z.uuid().parse(userId));
}

export async function saveJobSearchPreferences(
  command: SavePreferencesCommand,
  dependencies: {
    repository: JobDiscoveryRepository;
    createId: IdGenerator;
    now: Clock;
    /** Optional hook: regenerate internal search plan after prefs change. */
    onPreferencesChanged?: (profile: JobSearchProfile) => Promise<void>;
  },
): Promise<JobSearchProfile> {
  const parsed = savePreferencesCommandSchema.parse(command);
  const existing = await dependencies.repository.getSearchProfile(parsed.userId);
  const preferenceRevision = (existing?.preferenceRevision ?? 0) + 1;

  const profile = await dependencies.repository.saveSearchProfile({
    id: existing?.id ?? dependencies.createId(),
    userId: parsed.userId,
    preferences: parsed.preferences,
    preferenceRevision,
    updatedAt: dependencies.now().toISOString(),
  });

  if (dependencies.onPreferencesChanged) {
    try {
      await dependencies.onPreferencesChanged(profile);
    } catch (error) {
      // Preference save must succeed even if background plan refresh fails.
      console.error("Search plan refresh after preference save failed:", error);
    }
  }

  return profile;
}
