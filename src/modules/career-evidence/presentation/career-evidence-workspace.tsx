"use client";

import type { CareerEvidenceSet } from "../domain/evidence";
import { CareerProfileView, type CareerProfileHandoff } from "./career-profile-view";

export function CareerEvidenceWorkspace({
  initialEvidenceSet,
  growthDraft,
}: {
  initialEvidenceSet: CareerEvidenceSet | null;
  growthDraft?: CareerProfileHandoff | null;
}) {
  return (
    <CareerProfileView
      initialEvidenceSet={initialEvidenceSet}
      handoff={growthDraft}
    />
  );
}
