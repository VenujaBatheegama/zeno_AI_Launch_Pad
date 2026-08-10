import { describe, expect, it } from "vitest";

import {
  emptyJobSearchPreferences,
  type JobSearchProfile,
} from "../domain/job";
import type { JobDiscoveryRepository } from "./ports";
import { saveJobSearchPreferences } from "./preferences";

function asRepo(repo: MemoryPrefsRepository): JobDiscoveryRepository {
  return repo as unknown as JobDiscoveryRepository;
}

const USER = "00000000-0000-4000-8000-000000000001";

describe("saveJobSearchPreferences", () => {
  it("creates preferences, bumps revision, and normalizes duplicates", async () => {
    const repository = new MemoryPrefsRepository();
    const profile = await saveJobSearchPreferences(
      {
        userId: USER,
        preferences: {
          ...emptyJobSearchPreferences,
          roles: ["Software Engineer", "Software Engineer", " Backend Developer "],
          locations: ["Colombo", "Colombo"],
          smart_skill_analyser_enabled: true,
        },
      },
      {
        repository: asRepo(repository),
        createId: () => "00000000-0000-4000-8000-000000000010",
        now: () => new Date("2026-08-09T12:00:00.000Z"),
      },
    );

    expect(profile.preferenceRevision).toBe(1);
    expect(profile.preferences.roles).toEqual([
      "Software Engineer",
      "Backend Developer",
    ]);
    expect(profile.preferences.locations).toEqual(["Colombo"]);
    expect(profile.preferences.smart_skill_analyser_enabled).toBe(true);
  });

  it("triggers plan refresh after save and keeps prefs if refresh fails", async () => {
    const repository = new MemoryPrefsRepository();
    let called = false;
    const profile = await saveJobSearchPreferences(
      {
        userId: USER,
        preferences: {
          ...emptyJobSearchPreferences,
          roles: ["Developer"],
        },
      },
      {
        repository: asRepo(repository),
        createId: () => "00000000-0000-4000-8000-000000000011",
        now: () => new Date("2026-08-09T12:00:00.000Z"),
        onPreferencesChanged: async () => {
          called = true;
          throw new Error("plan boom");
        },
      },
    );
    expect(called).toBe(true);
    expect(profile.preferences.roles).toEqual(["Developer"]);
  });

  it("rejects empty invalid role payloads through schema", async () => {
    const repository = new MemoryPrefsRepository();
    await expect(
      saveJobSearchPreferences(
        {
          userId: USER,
          preferences: {
            ...emptyJobSearchPreferences,
            roles: ["software engineer, devops engineer"],
          },
        },
        {
          repository: asRepo(repository),
          createId: () => "00000000-0000-4000-8000-000000000012",
          now: () => new Date("2026-08-09T12:00:00.000Z"),
        },
      ),
    ).resolves.toMatchObject({
      preferences: { roles: [] },
    });
  });
});

class MemoryPrefsRepository {
  profile: JobSearchProfile | null = null;

  async getSearchProfile(userId: string) {
    return this.profile?.userId === userId ? this.profile : null;
  }

  async saveSearchProfile(input: {
    id: string;
    userId: string;
    preferences: JobSearchProfile["preferences"];
    preferenceRevision: number;
    updatedAt: string;
  }) {
    this.profile = {
      id: input.id,
      userId: input.userId,
      preferences: input.preferences,
      preferenceRevision: input.preferenceRevision,
      createdAt: this.profile?.createdAt ?? input.updatedAt,
      updatedAt: input.updatedAt,
    };
    return this.profile;
  }
}
