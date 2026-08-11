import type { CvTailoringVariant } from "@/modules/cv-tailoring/application/ports";
import { isTailoredResume } from "@/modules/cv-tailoring/domain/tailored-resume";

export function publicCvVariant(variant: CvTailoringVariant) {
  const resume = variant.tailoredContent;
  const isResume = resume && isTailoredResume(resume);

  return {
    id: variant.id,
    listingId: variant.listingId,
    mode: variant.mode,
    status: variant.status,
    recommendedMode: variant.recommendedMode,
    recommendationReason: variant.recommendationReason,
    warnings: variant.warnings,
    targetTitle: isResume
      ? resume.targetTitle
      : variant.contentPlan.targetTitle,
    jobAlignment: variant.contentPlan.jobAlignment,
    sectionOrder: variant.contentPlan.sectionOrder.filter(
      (section) => section !== "contact",
    ),
    earlyCareer: variant.contentPlan.earlyCareer,
    assessment: variant.assessment ?? variant.contentPlan.assessment ?? null,
    selectedProjects: variant.contentPlan.projectItemIds,
    selectedExperience: variant.contentPlan.experienceItemIds,
    includedFifthProject: variant.contentPlan.projectSelection.includedFifth,
    fifthProjectReasons: variant.contentPlan.projectSelection.fifthReasons,
    keywordAudit: variant.keywordAudit,
    tailoredContent: resume,
    changeNotes: isResume ? resume.changeNotes : [],
    pageCount: variant.artifactPageCount,
    repairCount: variant.repairCount,
    inputTokens: variant.inputTokens,
    outputTokens: variant.outputTokens,
    generationDurationMs: variant.generationDurationMs,
    errorMessage: variant.errorMessage,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  };
}

/** Compact card payload for the CVs library (no full resume body). */
export function publicCvVariantCard(variant: CvTailoringVariant) {
  const resume = variant.tailoredContent;
  const isResume = resume && isTailoredResume(resume);
  const targetTitle = isResume
    ? resume.targetTitle
    : variant.contentPlan.targetTitle;

  return {
    id: variant.id,
    listingId: variant.listingId,
    mode: variant.mode,
    status: variant.status,
    targetTitle,
    jobAlignment: variant.contentPlan.jobAlignment,
    pageCount: variant.artifactPageCount,
    projectCount: variant.contentPlan.projectItemIds.length,
    experienceCount: variant.contentPlan.experienceItemIds.length,
    canDownload: variant.status === "ready" && Boolean(variant.artifactStoragePath),
    canRender:
      variant.status === "ready_to_render" ||
      (variant.status === "failed" && Boolean(variant.tailoredContent)),
    errorMessage: variant.errorMessage,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  };
}
