import { CareerCampaignError } from "./errors";
import type { ApplicationStatus } from "./schemas";

const ALLOWED: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  ready: ["applied", "withdrawn"],
  applied: ["interview", "rejected", "offer", "withdrawn"],
  interview: ["rejected", "offer", "withdrawn"],
  rejected: [],
  offer: [],
  withdrawn: [],
};

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  if (from === to) return false;
  return ALLOWED[from].includes(to);
}

export function assertApplicationTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): void {
  if (!canTransitionApplication(from, to)) {
    throw new CareerCampaignError(
      "INVALID_TRANSITION",
      `Cannot move application from ${from} to ${to}.`,
    );
  }
}

/** System must never auto-mark applied. */
export function assertUserAppliedTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  source: "web" | "whatsapp" | "system",
): void {
  assertApplicationTransition(from, to);
  if (to === "applied" && source === "system") {
    throw new CareerCampaignError(
      "INVALID_TRANSITION",
      "Only the user can mark an application as applied.",
    );
  }
}

export function isTerminalApplicationStatus(status: ApplicationStatus): boolean {
  return status === "rejected" || status === "offer" || status === "withdrawn";
}
