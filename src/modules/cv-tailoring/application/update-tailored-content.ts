import { z } from "zod";

import { CvTailoringError } from "../domain/errors";
import {
  isTailoredResume,
  tailoredResumeSchema,
  type TailoredResume,
} from "../domain/tailored-resume";
import type { Clock, CvTailoringRepository, CvTailoringVariant } from "./ports";

const updateSchema = z.object({
  userId: z.uuid(),
  variantId: z.uuid(),
  tailoredContent: tailoredResumeSchema,
  /** Optimistic concurrency — reject if the stored row moved on. */
  expectedUpdatedAt: z.string().datetime().optional(),
});

export type UpdateTailoredCvContentCommand = z.input<typeof updateSchema>;

/**
 * Persist user edits to structured ready_to_render content.
 * Does not modify verified evidence. Marks a ready PDF as stale.
 */
export async function updateTailoredCvContent(
  command: UpdateTailoredCvContentCommand,
  dependencies: {
    repository: CvTailoringRepository;
    now: Clock;
  },
): Promise<CvTailoringVariant> {
  const parsed = updateSchema.parse(command);
  const existing = await dependencies.repository.getVariant(
    parsed.userId,
    parsed.variantId,
  );
  if (!existing) {
    throw new CvTailoringError("NOT_FOUND", "CV variant was not found.");
  }
  if (
    existing.status !== "ready_to_render" &&
    existing.status !== "ready" &&
    existing.status !== "failed"
  ) {
    throw new CvTailoringError(
      "INVALID_STATE",
      "This CV cannot be edited while generation or rendering is in progress.",
    );
  }
  if (!existing.tailoredContent && existing.status === "failed") {
    throw new CvTailoringError(
      "INVALID_STATE",
      "Generate CV content before editing.",
    );
  }
  if (
    parsed.expectedUpdatedAt &&
    existing.updatedAt !== parsed.expectedUpdatedAt
  ) {
    throw new CvTailoringError(
      "STALE_INPUT",
      "This CV was updated elsewhere. Reload and try again.",
    );
  }

  const content = markUserEditedFragments(
    existing.tailoredContent,
    parsed.tailoredContent,
  );
  if (!isTailoredResume(content)) {
    throw new CvTailoringError(
      "INVALID_INPUT",
      "Edited CV content failed schema validation.",
    );
  }

  const now = dependencies.now().toISOString();
  const pdfWasReady = existing.status === "ready";
  const warnings = [
    ...new Set([
      ...existing.warnings.filter(
        (warning) => !/edited draft; regenerate the PDF/i.test(warning),
      ),
      ...(pdfWasReady
        ? ["Content was edited; regenerate the PDF to match this draft."]
        : []),
      ...collectUserAuthoredWarnings(content),
    ]),
  ];

  return dependencies.repository.saveVariant({
    ...existing,
    // Keep prior artifact for recovery until a new render succeeds, but
    // download is gated on status === "ready".
    status: "ready_to_render",
    tailoredContent: content,
    warnings,
    errorMessage: null,
    updatedAt: now,
  });
}

function markUserEditedFragments(
  previous: TailoredResume | null,
  next: TailoredResume,
): TailoredResume {
  if (!previous) {
    return {
      ...next,
      summary: { ...next.summary, source: "user_edited" as const },
      experience: next.experience.map((role) => ({
        ...role,
        bullets: role.bullets.map((bullet) => ({
          ...bullet,
          source: "user_edited" as const,
          factIds:
            bullet.factIds.length > 0 ? bullet.factIds : ["user_authored"],
        })),
      })),
      projects: next.projects.map((project) => ({
        ...project,
        paragraphs: project.paragraphs.map((paragraph) => ({
          ...paragraph,
          source: "user_edited" as const,
          factIds:
            paragraph.factIds.length > 0
              ? paragraph.factIds
              : ["user_authored"],
        })),
      })),
    };
  }

  return {
    ...next,
    summary: {
      ...next.summary,
      source:
        next.summary.text.trim() !== previous.summary.text.trim()
          ? ("user_edited" as const)
          : previous.summary.source,
      factIds: next.summary.factIds,
    },
    experience: next.experience.map((role) => {
      const priorRole = previous.experience.find((item) => item.id === role.id);
      return {
        ...role,
        bullets: role.bullets.map((bullet, index) => {
          const prior = priorRole?.bullets[index];
          const textChanged = !prior || prior.text.trim() !== bullet.text.trim();
          return {
            ...bullet,
            source: textChanged
              ? ("user_edited" as const)
              : (prior?.source ?? bullet.source),
            factIds:
              bullet.factIds.length > 0
                ? bullet.factIds
                : prior?.factIds?.length
                  ? prior.factIds
                  : ["user_authored"],
          };
        }),
      };
    }),
    projects: next.projects.map((project) => {
      const priorProject = previous.projects.find(
        (item) => item.id === project.id,
      );
      return {
        ...project,
        paragraphs: project.paragraphs.map((paragraph, index) => {
          const prior = priorProject?.paragraphs[index];
          const textChanged =
            !prior || prior.text.trim() !== paragraph.text.trim();
          return {
            ...paragraph,
            source: textChanged
              ? ("user_edited" as const)
              : (prior?.source ?? paragraph.source),
            factIds:
              paragraph.factIds.length > 0
                ? paragraph.factIds
                : prior?.factIds?.length
                  ? prior.factIds
                  : ["user_authored"],
          };
        }),
      };
    }),
  };
}

function collectUserAuthoredWarnings(content: TailoredResume): string[] {
  const hasUserAuthored =
    content.summary.source === "user_edited" ||
    content.experience.some((role) =>
      role.bullets.some(
        (bullet) =>
          bullet.source === "user_edited" ||
          bullet.factIds.includes("user_authored"),
      ),
    ) ||
    content.projects.some((project) =>
      project.paragraphs.some(
        (paragraph) =>
          paragraph.source === "user_edited" ||
          paragraph.factIds.includes("user_authored"),
      ),
    );
  return hasUserAuthored
    ? [
        "Some wording was edited by you and is not verified career evidence.",
      ]
    : [];
}
