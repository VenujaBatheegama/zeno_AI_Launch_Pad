import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { CareerCampaignError } from "@/modules/career-campaign/domain/errors";
import type { CareerFriendRepository } from "../application/ports";
import type {
  CareerConversationMessage,
  CareerSprint,
  CareerSprintMilestone,
  GapType,
} from "../domain/schemas";

type SprintRow = {
  id: string;
  user_id: string;
  growth_action_id: string | null;
  gap_key: string;
  gap_label: string;
  gap_type: GapType;
  title: string;
  objective: string;
  why_now: string;
  market_signal: CareerSprint["marketSignal"];
  estimated_hours: number;
  status: CareerSprint["status"];
  evidence_url: string | null;
  evidence_note: string | null;
  evidence_submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type MilestoneRow = {
  id: string;
  sprint_id: string;
  title: string;
  position: number;
  completed: boolean;
  completed_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: CareerConversationMessage["role"];
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export class SupabaseCareerFriendRepository implements CareerFriendRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createSprint(
    input: Omit<CareerSprint, "milestones"> & {
      milestoneRows: Array<{ id: string; title: string; position: number }>;
    },
  ): Promise<CareerSprint> {
    const { milestoneRows, ...sprint } = input;
    const { error } = await this.client.from("career_sprints").insert({
      id: sprint.id,
      user_id: sprint.userId,
      growth_action_id: sprint.growthActionId,
      gap_key: sprint.gapKey,
      gap_label: sprint.gapLabel,
      gap_type: sprint.gapType,
      title: sprint.title,
      objective: sprint.objective,
      why_now: sprint.whyNow,
      market_signal: sprint.marketSignal,
      estimated_hours: sprint.estimatedHours,
      status: sprint.status,
      created_at: sprint.createdAt,
      updated_at: sprint.updatedAt,
    });
    if (error) throw persistenceError("Career sprint could not be created.", error);

    const { error: milestonesError } = await this.client
      .from("career_sprint_milestones")
      .insert(
        milestoneRows.map((item) => ({
          id: item.id,
          sprint_id: sprint.id,
          user_id: sprint.userId,
          title: item.title,
          position: item.position,
        })),
      );
    if (milestonesError) {
      throw persistenceError("Career sprint milestones could not be created.", milestonesError);
    }
    const created = await this.getSprint(sprint.userId, sprint.id);
    if (!created) throw persistenceError("Career sprint could not be reloaded.", null);
    return created;
  }

  async findOpenSprintForGap(userId: string, gapKey: string) {
    const { data, error } = await this.client
      .from("career_sprints")
      .select()
      .eq("user_id", userId)
      .eq("gap_key", gapKey)
      .in("status", ["active", "paused", "evidence_submitted"])
      .maybeSingle();
    if (error) throw persistenceError("Career sprint could not be loaded.", error);
    return data ? this.withMilestones(data as SprintRow) : null;
  }

  async getSprint(userId: string, sprintId: string) {
    const { data, error } = await this.client
      .from("career_sprints")
      .select()
      .eq("user_id", userId)
      .eq("id", sprintId)
      .maybeSingle();
    if (error) throw persistenceError("Career sprint could not be loaded.", error);
    return data ? this.withMilestones(data as SprintRow) : null;
  }

  async listSprints(userId: string) {
    const { data, error } = await this.client
      .from("career_sprints")
      .select()
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw persistenceError("Career sprints could not be listed.", error);
    return Promise.all(((data ?? []) as SprintRow[]).map((row) => this.withMilestones(row)));
  }

  async updateMilestone(input: {
    userId: string;
    sprintId: string;
    milestoneId: string;
    completed: boolean;
    completedAt: string | null;
  }) {
    const { data, error } = await this.client
      .from("career_sprint_milestones")
      .update({ completed: input.completed, completed_at: input.completedAt })
      .eq("user_id", input.userId)
      .eq("sprint_id", input.sprintId)
      .eq("id", input.milestoneId)
      .select("id")
      .maybeSingle();
    if (error) throw persistenceError("Sprint milestone could not be updated.", error);
    if (!data) throw new CareerCampaignError("NOT_FOUND", "Sprint milestone was not found.");
    const sprint = await this.getSprint(input.userId, input.sprintId);
    if (!sprint) throw new CareerCampaignError("NOT_FOUND", "Career sprint was not found.");
    return sprint;
  }

  async submitEvidence(input: {
    userId: string;
    sprintId: string;
    evidenceUrl: string | null;
    evidenceNote: string | null;
    submittedAt: string;
  }) {
    const { data, error } = await this.client
      .from("career_sprints")
      .update({
        evidence_url: input.evidenceUrl,
        evidence_note: input.evidenceNote,
        evidence_submitted_at: input.submittedAt,
        status: "evidence_submitted",
      })
      .eq("user_id", input.userId)
      .eq("id", input.sprintId)
      .eq("status", "active")
      .select()
      .maybeSingle();
    if (error) throw persistenceError("Sprint evidence could not be submitted.", error);
    if (!data) throw new CareerCampaignError("INVALID_TRANSITION", "Sprint is no longer active.");
    return this.withMilestones(data as SprintRow);
  }

  async createConversation(input: {
    id: string;
    userId: string;
    title: string;
    createdAt: string;
  }) {
    const { error } = await this.client.from("career_conversations").upsert(
      {
        id: input.id,
        user_id: input.userId,
        title: input.title,
        created_at: input.createdAt,
        updated_at: input.createdAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.error("[career-friend] conversation insert error:", error);
      throw persistenceError(`Career conversation could not be created: ${error.message}`, error);
    }
  }

  async conversationBelongsToUser(userId: string, conversationId: string) {
    const { data, error } = await this.client
      .from("career_conversations")
      .select("id")
      .eq("user_id", userId)
      .eq("id", conversationId)
      .maybeSingle();
    if (error) throw persistenceError("Career conversation could not be loaded.", error);
    return Boolean(data);
  }

  async addMessage(input: CareerConversationMessage & { userId: string }) {
    // Ensure parent conversation exists before adding message to satisfy foreign key
    await this.client
      .from("career_conversations")
      .upsert(
        {
          id: input.conversationId,
          user_id: input.userId,
          title: input.content.slice(0, 80) || "Career conversation",
          updated_at: input.createdAt,
        },
        { onConflict: "id" },
      );

    const safeMetadata =
      typeof input.metadata === "object" && input.metadata !== null
        ? input.metadata
        : {};

    const { error } = await this.client.from("career_messages").upsert(
      {
        id: input.id,
        conversation_id: input.conversationId,
        user_id: input.userId,
        role: input.role,
        content: input.content.slice(0, 7990),
        metadata: safeMetadata,
        created_at: input.createdAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.error("[career-friend] message insert error:", error);
      throw persistenceError(`Career message could not be saved: ${error.message}`, error);
    }
  }

  async listMessages(input: { userId: string; conversationId: string; limit: number }) {
    const { data, error } = await this.client
      .from("career_messages")
      .select()
      .eq("user_id", input.userId)
      .eq("conversation_id", input.conversationId)
      .order("created_at", { ascending: false })
      .limit(input.limit);
    if (error) throw persistenceError("Career messages could not be listed.", error);
    return ((data ?? []) as MessageRow[]).reverse().map(mapMessage);
  }

  async findOrCreateTelegramConversation(userId: string): Promise<string> {
    const { data, error } = await this.client
      .from("career_conversations")
      .select("id")
      .eq("user_id", userId)
      .eq("title", "Telegram Chat")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw persistenceError("Career conversation could not be loaded.", error);
    if (data?.id) return data.id;

    const id = randomUUID();
    const now = new Date().toISOString();
    await this.createConversation({
      id,
      userId,
      title: "Telegram Chat",
      createdAt: now,
    });
    return id;
  }
  async getConversationPreferredName(userId: string, conversationId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from("career_conversations")
      .select("preferred_name")
      .eq("user_id", userId)
      .eq("id", conversationId)
      .maybeSingle();
    if (error) {
      if (error.code === "PGRST106") return null;
      throw persistenceError("Career conversation could not be loaded.", error);
    }
    return data?.preferred_name ?? null;
  }

  async updateConversationPreferredName(userId: string, conversationId: string, name: string): Promise<void> {
    const { error } = await this.client
      .from("career_conversations")
      .update({ preferred_name: name })
      .eq("user_id", userId)
      .eq("id", conversationId);
    if (error) {
      if (error.code === "PGRST106") return;
      throw persistenceError("Could not update preferred name.", error);
    }
  }

  private async withMilestones(row: SprintRow): Promise<CareerSprint> {
    const { data, error } = await this.client
      .from("career_sprint_milestones")
      .select()
      .eq("user_id", row.user_id)
      .eq("sprint_id", row.id)
      .order("position", { ascending: true });
    if (error) throw persistenceError("Sprint milestones could not be loaded.", error);
    return mapSprint(row, ((data ?? []) as MilestoneRow[]).map(mapMilestone));
  }
}

function mapSprint(row: SprintRow, milestones: CareerSprintMilestone[]): CareerSprint {
  return {
    id: row.id,
    userId: row.user_id,
    growthActionId: row.growth_action_id,
    gapKey: row.gap_key,
    gapLabel: row.gap_label,
    gapType: row.gap_type,
    title: row.title,
    objective: row.objective,
    whyNow: row.why_now,
    marketSignal: row.market_signal,
    estimatedHours: row.estimated_hours,
    status: row.status,
    evidenceUrl: row.evidence_url,
    evidenceNote: row.evidence_note,
    evidenceSubmittedAt: row.evidence_submitted_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    milestones,
  };
}

function mapMilestone(row: MilestoneRow): CareerSprintMilestone {
  return {
    id: row.id,
    sprintId: row.sprint_id,
    title: row.title,
    position: row.position,
    completed: row.completed,
    completedAt: row.completed_at,
  };
}

function mapMessage(row: MessageRow): CareerConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function persistenceError(message: string, cause: unknown) {
  return new CareerCampaignError("PERSISTENCE_FAILED", message, { cause });
}
