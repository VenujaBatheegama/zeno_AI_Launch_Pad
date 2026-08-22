import Link from "next/link";

import { CareerEvidenceWorkspace } from "@/modules/career-evidence/presentation/career-evidence-workspace";
import { requireUserId } from "@/server/auth";
import { getCareerEvidenceApplication } from "@/server/composition-root";
import { requireProfile, updateProfileOnboarding } from "@/server/identity";

export const dynamic = "force-dynamic";

export default async function OnboardingReviewPage() {
  const userId = await requireUserId();
  const profile = await requireProfile();
  await updateProfileOnboarding(profile.userId, {
    onboardingStatus: "awaiting_verification",
    onboardingCurrentStep: "review",
    onboardingProgress: Math.max(profile.onboardingProgress, 85),
  });
  const evidenceSet = await getCareerEvidenceApplication(userId).getCurrent();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Review your career profile
          </h1>
          <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
            Confirm the details Zeno extracted or collected. Nothing is final
            until you verify.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/app/home"
            className="rounded-full border border-[var(--zeno-border)] px-3.5 py-1.5 text-xs font-semibold text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-ink)] transition"
          >
            Finish later
          </Link>
        </div>
      </div>
      {evidenceSet ? (
        <CareerEvidenceWorkspace
          initialEvidenceSet={evidenceSet}
          onboardingMode={true}
        />
      ) : (
        <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-6 text-sm text-[var(--zeno-ink-muted)]">
          No draft found yet.{" "}
          <Link href="/onboarding/import" className="text-[var(--zeno-primary)]">
            Import a CV
          </Link>{" "}
          or{" "}
          <Link href="/onboarding/chat" className="text-[var(--zeno-primary)]">
            continue the conversation
          </Link>
          .
        </div>
      )}
    </div>
  );
}
