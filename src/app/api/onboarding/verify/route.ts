import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { careerEvidenceSchema } from "@/modules/career-evidence/domain/evidence";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerEvidenceApplication } from "@/server/composition-root";
import { requireProfile, updateProfileOnboarding } from "@/server/identity";

const bodySchema = z.object({
  evidence: careerEvidenceSchema.optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const profile = await requireProfile();
    const evidenceApp = getCareerEvidenceApplication(userId);
    let current = await evidenceApp.getCurrent();

    if (!current && body.evidence) {
      current = await evidenceApp.ensureConversationDraft(body.evidence);
    }

    if (!current) {
      return NextResponse.json(
        { error: "No career profile draft found to verify." },
        { status: 400 },
      );
    }

    const evidencePayload = body.evidence ?? current.evidence;
    const verified = await evidenceApp.verify({
      id: current.id,
      evidence: evidencePayload,
      acknowledged: true,
    });

    const updated = await updateProfileOnboarding(userId, {
      onboardingStatus: "completed",
      onboardingCurrentStep: "completed",
      onboardingProgress: 100,
      careerProfileVerifiedAt: new Date().toISOString(),
      careerProfileVersion: profile.careerProfileVersion + 1,
      displayName:
        verified.evidence.profile.full_name ?? profile.displayName,
    });

    return NextResponse.json({ profile: updated, evidenceSet: verified });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
