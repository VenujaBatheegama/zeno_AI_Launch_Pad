import type {
  CareerConversationMessage,
  CareerSnapshot,
  CareerSprint,
} from "../domain/schemas";

export interface CareerFriendRepository {
  createSprint(input: Omit<CareerSprint, "milestones"> & {
    milestoneRows: Array<{
      id: string;
      title: string;
      position: number;
    }>;
  }): Promise<CareerSprint>;
  findOpenSprintForGap(userId: string, gapKey: string): Promise<CareerSprint | null>;
  getSprint(userId: string, sprintId: string): Promise<CareerSprint | null>;
  listSprints(userId: string): Promise<CareerSprint[]>;
  updateMilestone(input: {
    userId: string;
    sprintId: string;
    milestoneId: string;
    completed: boolean;
    completedAt: string | null;
  }): Promise<CareerSprint>;
  submitEvidence(input: {
    userId: string;
    sprintId: string;
    evidenceUrl: string | null;
    evidenceNote: string | null;
    submittedAt: string;
  }): Promise<CareerSprint>;
  createConversation(input: {
    id: string;
    userId: string;
    title: string;
    createdAt: string;
  }): Promise<void>;
  conversationBelongsToUser(userId: string, conversationId: string): Promise<boolean>;
  addMessage(input: CareerConversationMessage & { userId: string }): Promise<void>;
  listMessages(input: {
    userId: string;
    conversationId: string;
    limit: number;
  }): Promise<CareerConversationMessage[]>;
  findOrCreateTelegramConversation(userId: string): Promise<string>;
}

import type { AgentUIPayload } from "../domain/agent-outputs";

export interface CareerAdvisor {
  reply(input: {
    message: string;
    snapshot: CareerSnapshot;
    recentMessages: CareerConversationMessage[];
    executeSearchJobListings?: (args: {
      roles: string[];
      locations: string[];
      workModes: ("remote" | "hybrid" | "onsite")[];
      experienceLevels: string[];
    }) => Promise<{ summaryText: string; uiPayload?: AgentUIPayload }>;
    executeRecommendRoleCategories?: (args: {
      focusArea?: string;
    }) => Promise<{ summaryText: string; uiPayload?: AgentUIPayload }>;
    executeSuggestGrowthAction?: (args: {
      gapArea?: string;
    }) => Promise<{ summaryText: string; uiPayload?: AgentUIPayload }>;
    executeCoverLetter?: (args: {
      jobTitle: string;
      organizationName?: string;
      jobDescription?: string;
    }) => Promise<{ summaryText: string; uiPayload?: AgentUIPayload }>;
    executeCv?: (args: {
      jobTitle: string;
      organizationName?: string;
      jobDescription?: string;
    }) => Promise<{ summaryText: string; uiPayload?: AgentUIPayload }>;
  }): Promise<{
    answer: string;
    thinking?: string;
    suggestedActions: Array<
      "view_jobs" | "review_recommendations" | "start_sprint" | "update_profile"
    >;
    usedModel: boolean;
    uiPayload?: AgentUIPayload;
  }>;
}
