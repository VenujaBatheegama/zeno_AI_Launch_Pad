"use client";

import type { CareerEvidenceSet } from "../domain/evidence";
import { CareerProfileView } from "./career-profile-view";

export function CareerEvidenceWorkspace({
  initialEvidenceSet,
}: {
  initialEvidenceSet: CareerEvidenceSet | null;
}) {
  return <CareerProfileView initialEvidenceSet={initialEvidenceSet} />;
}
