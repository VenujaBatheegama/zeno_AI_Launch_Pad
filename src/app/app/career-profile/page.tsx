import { CareerEvidenceWorkspace } from "@/modules/career-evidence/presentation/career-evidence-workspace";
import { requireUserId } from "@/server/auth";
import { getCareerEvidenceApplication } from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function CareerProfilePage() {
  const userId = await requireUserId();
  const evidenceSet = await getCareerEvidenceApplication(userId).getCurrent();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--zeno-ink)]">
          Career profile
        </h1>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          Review and verify the experience Zeno uses for matching and CVs.
        </p>
      </header>
      <CareerEvidenceWorkspace initialEvidenceSet={evidenceSet} />
    </div>
  );
}
