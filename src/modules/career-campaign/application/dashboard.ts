import type { CareerCampaignRepository } from "./ports";

export type CampaignDashboard = {
  needsAttention: {
    pendingRecommendations: number;
    readyPackets: number;
    dueFollowUps: number;
  };
  funnel: {
    jobsDiscovered: number;
    recommendationsMade: number;
    accepted: number;
    applied: number;
    interviews: number;
  };
  bottleneck: string | null;
  learned: Array<{ signalType: string; signalValue: string; count: number }>;
  completedWork: {
    runs: number;
    lastRunStatus: string | null;
    packetsReady: number;
  };
  growthActions: Awaited<
    ReturnType<CareerCampaignRepository["listGrowthActions"]>
  >;
};

export async function getCampaignDashboard(
  userId: string,
  deps: {
    repository: CareerCampaignRepository;
    now: () => Date;
    countDiscoveredJobs: (userId: string) => Promise<number>;
  },
): Promise<CampaignDashboard> {
  const [
    allRecs,
    applications,
    dueFollowUps,
    runs,
    signals,
    growthActions,
    jobsDiscovered,
    readyPacketCount,
  ] = await Promise.all([
    deps.repository.listRecommendations({ userId, limit: 200 }),
    deps.repository.listApplications({ userId, limit: 100 }),
    deps.repository.findDueFollowUps({
      userId,
      asOf: deps.now().toISOString(),
      limit: 50,
    }),
    deps.repository.listRecentRuns(userId, 10),
    deps.repository.listFeedbackSignals(userId),
    deps.repository.listGrowthActions(userId),
    deps.countDiscoveredJobs(userId),
    deps.repository.countReadyPackets(userId),
  ]);

  const pendingRecs = allRecs.filter(
    (item) => item.status === "pending_review" || item.status === "saved",
  );
  const acceptedRecs = allRecs.filter((item) => item.status === "accepted");
  const interviews = applications.filter((item) => item.status === "interview");

  let bottleneck: string | null = null;
  if (pendingRecs.length > 0) {
    bottleneck = `${pendingRecs.length} recommendation(s) awaiting your review.`;
  } else if (readyPacketCount > 0) {
    bottleneck =
      "Application packets are ready — mark jobs applied after you submit externally.";
  } else if (dueFollowUps.length > 0) {
    bottleneck = `${dueFollowUps.length} follow-up(s) are due.`;
  } else if (jobsDiscovered === 0) {
    bottleneck = "No jobs discovered yet — run a campaign check.";
  }

  const learnedMap = new Map<string, number>();
  for (const signal of signals) {
    const key = `${signal.signalType}:${signal.signalValue}`;
    learnedMap.set(key, (learnedMap.get(key) ?? 0) + signal.weight);
  }

  return {
    needsAttention: {
      pendingRecommendations: pendingRecs.length,
      readyPackets: readyPacketCount,
      dueFollowUps: dueFollowUps.length,
    },
    funnel: {
      jobsDiscovered,
      recommendationsMade: allRecs.length,
      accepted: acceptedRecs.length,
      applied: applications.filter((item) =>
        ["applied", "interview", "offer", "rejected"].includes(item.status),
      ).length,
      interviews: interviews.length,
    },
    bottleneck,
    learned: [...learnedMap.entries()].map(([key, count]) => {
      const [signalType, signalValue] = key.split(":");
      return { signalType: signalType!, signalValue: signalValue!, count };
    }),
    completedWork: {
      runs: runs.length,
      lastRunStatus: runs[0]?.status ?? null,
      packetsReady: readyPacketCount,
    },
    growthActions: growthActions.filter((item) => item.status === "active"),
  };
}
