import { CareerEvidenceWorkspace } from "@/modules/career-evidence/presentation/career-evidence-workspace";
import { requireUserId } from "@/server/auth";
import { getCareerEvidenceApplication } from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function CareerProfilePage() {
  const userId = await requireUserId();
  const evidenceSet = await getCareerEvidenceApplication(userId).getCurrent();

  return <CareerEvidenceWorkspace initialEvidenceSet={evidenceSet} />;
}
