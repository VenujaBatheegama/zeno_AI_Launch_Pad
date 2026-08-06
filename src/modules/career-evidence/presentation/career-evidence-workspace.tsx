"use client";

import { useState } from "react";

import type { CareerEvidenceSet } from "../domain/evidence";
import { EvidenceForm } from "./evidence-form";
import { UploadForm } from "./upload-form";

export function CareerEvidenceWorkspace({
  initialEvidenceSet,
}: {
  initialEvidenceSet: CareerEvidenceSet | null;
}) {
  const [evidenceSet, setEvidenceSet] = useState(initialEvidenceSet);

  return (
    <div className="space-y-4">
      <UploadForm onUploaded={setEvidenceSet} />
      {evidenceSet ? (
        <EvidenceForm
          key={evidenceSet.id}
          evidenceSet={evidenceSet}
          onChanged={setEvidenceSet}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
          <p className="font-medium text-slate-800">No career evidence yet.</p>
          <p className="mt-2 text-sm text-slate-600">
            Upload a CV to create the first reviewable draft.
          </p>
        </div>
      )}
    </div>
  );
}
