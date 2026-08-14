import { JobCampaignForm } from "@/modules/career-campaign/presentation/job-campaign-form";
import { requireUserId } from "@/server/auth";
import { getJobDiscoveryApplication } from "@/server/composition-root";
import { getServerConfig } from "@/server/config";

export const dynamic = "force-dynamic";

export default async function NewJobCampaignPage() {
  const userId = await requireUserId();
  const profile = await getJobDiscoveryApplication(userId).getProfile();
  const preferences = profile?.preferences;
  const workMode = preferences?.work_modes[0] ?? "any";
  return (
    <JobCampaignForm
      mode="create"
      defaultRole={preferences?.roles[0] ?? ""}
      defaultLocation={
        preferences?.locations[0] ??
        (workMode === "remote" || workMode === "any" ? "Remote" : "")
      }
      defaultWorkMode={workMode === "onsite" || workMode === "hybrid" || workMode === "remote" ? workMode : "any"}
      defaultMinScore={getServerConfig().CAMPAIGN_RECOMMENDATION_MIN_SCORE}
    />
  );
}
