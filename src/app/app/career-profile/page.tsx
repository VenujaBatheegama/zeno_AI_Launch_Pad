import { CareerEvidenceWorkspace } from "@/modules/career-evidence/presentation/career-evidence-workspace";
import { GrowthProfileHandoff } from "@/modules/career-growth/presentation/growth-profile-handoff";
import { CareerGrowthError } from "@/modules/career-growth/domain/errors";
import { requireUserId } from "@/server/auth";
import {
  getCareerEvidenceApplication,
  getCareerGrowthApplication,
} from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function CareerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ fromGrowth?: string }>;
}) {
  const userId = await requireUserId();
  const { fromGrowth } = await searchParams;
  const evidenceSet = await getCareerEvidenceApplication(userId).getCurrent();
  let growthDraft = null;
  if (fromGrowth) {
    try {
      const payload = await getCareerGrowthApplication(userId).getProject(fromGrowth);
      growthDraft = {
        projectId: payload.project.id,
        title: payload.project.title,
        objective: payload.project.objective,
        expectedEvidence: payload.project.expectedEvidence,
        startDate: payload.project.startDate,
        endDate: payload.project.targetDate,
      };
    } catch (error) {
      if (!(error instanceof CareerGrowthError && error.code === "NOT_FOUND")) {
        throw error;
      }
    }
  }

  return (
    <div className="space-y-6">
      {growthDraft ? <GrowthProfileHandoff draft={growthDraft} /> : null}
      <CareerEvidenceWorkspace
        initialEvidenceSet={evidenceSet}
        growthDraft={
          growthDraft
            ? {
                title: growthDraft.title,
                objective: growthDraft.objective,
                expectedEvidence: growthDraft.expectedEvidence,
                startDate: growthDraft.startDate,
                endDate: growthDraft.endDate,
              }
            : null
        }
      />
    </div>
  );
}
