import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerEvidenceApplication } from "@/server/composition-root";
import { updateProfileOnboarding } from "@/server/identity";
import {
  onboardingMethodSchema,
  onboardingStatusSchema,
} from "@/modules/identity/domain/profile";
import { z } from "zod";

const bodySchema = z.object({
  onboardingStatus: onboardingStatusSchema.optional(),
  onboardingMethod: onboardingMethodSchema.nullable().optional(),
  onboardingCurrentStep: z.string().nullable().optional(),
  onboardingProgress: z.number().int().min(0).max(100).optional(),
  onboardingState: z.record(z.string(), z.unknown()).optional(),
  draftEvidence: z.unknown().optional(),
  displayName: z.string().nullable().optional(),
  careerProfileVerifiedAt: z.string().nullable().optional(),
  careerProfileVersion: z.number().int().min(0).optional(),
});

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await request.json());
    const profile = await updateProfileOnboarding(userId, {
      displayName: body.displayName,
      onboardingStatus: body.onboardingStatus,
      onboardingMethod: body.onboardingMethod,
      onboardingCurrentStep: body.onboardingCurrentStep,
      onboardingProgress: body.onboardingProgress,
      onboardingState: body.onboardingState,
      careerProfileVerifiedAt: body.careerProfileVerifiedAt,
      careerProfileVersion: body.careerProfileVersion,
    });

    if (body.draftEvidence && typeof body.draftEvidence === "object") {
      const evidenceApp = getCareerEvidenceApplication(userId);
      const current = await evidenceApp.getCurrent();
      if (current) {
        await evidenceApp.saveDraft({
          id: current.id,
          evidence: body.draftEvidence,
        });
      } else {
        await evidenceApp.ensureConversationDraft(body.draftEvidence as never);
      }
    }

    return NextResponse.json(profile);
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
