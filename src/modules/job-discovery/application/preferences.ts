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
  },
): Promise<JobSearchProfile> {
  const parsed = savePreferencesCommandSchema.parse(command);
  const existing = await dependencies.repository.getSearchProfile(parsed.userId);

  return dependencies.repository.saveSearchProfile({
    id: existing?.id ?? dependencies.createId(),
    userId: parsed.userId,
    preferences: parsed.preferences,
    updatedAt: dependencies.now().toISOString(),
  });
}
