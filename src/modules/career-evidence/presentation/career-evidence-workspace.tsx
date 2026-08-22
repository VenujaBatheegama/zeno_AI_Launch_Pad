"use client";

import type { CareerEvidenceSet } from "../domain/evidence";
import { CareerProfileView, type CareerProfileHandoff } from "./career-profile-view";

export function CareerEvidenceWorkspace({
  initialEvidenceSet,
  growthDraft,
  onboardingMode,
}: {
  initialEvidenceSet: CareerEvidenceSet | null;
  growthDraft?: CareerProfileHandoff | null;
  onboardingMode?: boolean;
}) {
  return (
    <CareerProfileView
      initialEvidenceSet={initialEvidenceSet}
      handoff={growthDraft}
      onboardingMode={onboardingMode}
    />
  );
}
