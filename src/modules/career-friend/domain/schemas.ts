import { z } from "zod";

export const gapTypeSchema = z.enum([
  "skill",
  "evidence",
  "visibility",
  "qualification",
]);
export type GapType = z.infer<typeof gapTypeSchema>;

export type CareerSprintMilestone = {
  id: string;
  sprintId: string;
  title: string;
  position: number;
  completed: boolean;
  completedAt: string | null;
};

export type CareerSprint = {
  id: string;
  userId: string;
  growthActionId: string | null;
  gapKey: string;
  gapLabel: string;
  gapType: GapType;
  title: string;
  objective: string;
  whyNow: string;
  marketSignal: {
    frequency: number;
    affectedListingIds: string[];
  };
  estimatedHours: number;
  status: "active" | "paused" | "evidence_submitted" | "completed" | "dismissed";
  evidenceUrl: string | null;
  evidenceNote: string | null;
  evidenceSubmittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  milestones: CareerSprintMilestone[];
};

export type CareerConversationMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CareerSnapshot = {
  profile: {
    name: string | null;
    headline: string | null;
    skills: string[];
    projects: string[];
  };
  opportunities: {
    pendingRecommendations: number;
    discoveredJobs: number;
    applications: number;
    interviews: number;
  };
  growthSignals: Array<{
    id: string;
    label: string;
    frequency: number;
    whyItMatters: string;
  }>;
  activeSprints: Array<{
    id: string;
    title: string;
    gapType: GapType;
    completedMilestones: number;
    totalMilestones: number;
  }>;
};

export const askCareerFriendSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.uuid().optional(),
  clientMessageId: z.string().trim().min(8).max(200),
});

export const createSprintSchema = z.object({
  growthActionId: z.uuid(),
});

export const updateMilestoneSchema = z.object({
  completed: z.boolean(),
});

export const submitSprintEvidenceSchema = z
  .object({
    evidenceUrl: z.url().max(1000).optional(),
    evidenceNote: z.string().trim().max(2000).optional(),
  })
  .refine((value) => Boolean(value.evidenceUrl || value.evidenceNote), {
    message: "Add an evidence link or a short evidence note.",
  });
