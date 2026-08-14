import type { ContentPlan } from "./content-plan";
import type { EvidenceSnapshot } from "./facts";
import { sentencesToParagraph } from "./project-paragraphs";
import { sanitizeCvProse } from "./sanitize-prose";
import {
  buildSkillInventory,
  clampSkillItem,
  groupSkillsDeterministically,
  resolveSkillDisplay,
  type SkillInventory,
} from "./skill-inventory";
import type { GenerationAssessment, KeywordAuditEntry } from "./schemas";
import {
  tailoredResumeSchema,
  type GroqResumeDraft,
  type ResumeAssessment,
  type TailoredResume,
} from "./tailored-resume";

const AWARD_LIKE =
  /\b(runners?-?up|winner|finalist|award|hackathon|placed|place|champion|prize)\b/iu;

export function assessmentFromGeneration(
  assessment: GenerationAssessment,
  keywordAudit: KeywordAuditEntry[],
): ResumeAssessment {
  return {
    factuallyValid: assessment.factually_valid,
    jobAlignment: assessment.job_alignment,
    supportedKeywords: assessment.supported_keywords,
    transferableKeywords: keywordAudit
      .filter((entry) => entry.support_state === "transferable")
      .map((entry) => entry.keyword),
    missingKeywords: assessment.missing_keywords,
    generationStatus: assessment.generation_status,
  };
}

export function assembleTailoredResume(input: {
  draft: GroqResumeDraft;
  snapshot: EvidenceSnapshot;
  plan: ContentPlan;
  assessment: ResumeAssessment;
}): TailoredResume {
  const inventory = buildSkillInventory(input.snapshot);
  const profile = input.snapshot.items.find((item) => item.type === "profile");
  const fullName =
    profile && profile.type === "profile" && profile.full_name?.trim()
      ? profile.full_name.trim()
      : "Candidate";

  const experience = input.plan.experienceItemIds.flatMap((id, index) => {
    const item = input.snapshot.items.find((entry) => entry.id === id);
    if (!item || item.type !== "work") return [];
    const draft = input.draft.experience.find((entry) => entry.id === id);
    const bullets =
      draft?.bullets.map((bullet) => ({
        text: bullet.text.trim(),
        factIds: bullet.factIds,
        priority: bullet.priority ?? index,
        source: "ai_generated" as const,
      })) ?? [];
    if (bullets.length === 0) return [];
    return [
      {
        id: item.id,
        employer: item.employer,
        title: item.role,
        location: item.location ?? undefined,
        startDate: item.start_date ?? "",
        endDate: item.end_date,
        isCurrent: item.is_current,
        bullets,
        priority: draft?.priority ?? index,
      },
    ];
  });

  const projects = input.plan.projectItemIds.flatMap((id, index) => {
    const item = input.snapshot.items.find((entry) => entry.id === id);
    if (!item || item.type !== "project") return [];
    const draft = input.draft.projects.find((entry) => entry.id === id);
    const paragraphs = projectParagraphsFromDraft(
      draft,
      item.id,
      index,
      input.plan.paragraphsPerProject,
    );
    if (paragraphs.length === 0) return [];
    const technologies = sanitizeTechnologies(
      draft?.technologies?.length ? draft.technologies : item.technologies,
      inventory,
      item.technologies,
    );
    return [
      {
        id: item.id,
        name: item.name,
        technologies,
        startDate: item.start_date ?? undefined,
        endDate: item.end_date,
        paragraphs,
        priority: draft?.priority ?? index,
      },
    ];
  });

  const education = input.plan.educationItemIds.flatMap((id) => {
    const item = input.snapshot.items.find((entry) => entry.id === id);
    if (!item || item.type !== "education") return [];
    const details: string[] = [];
    if (input.plan.earlyCareer) {
      for (const detail of item.details ?? []) {
        if (detail.trim()) details.push(detail.trim());
      }
      if (item.field_of_study) {
        const qual = item.qualification?.toLocaleLowerCase() ?? "";
        const field = item.field_of_study.toLocaleLowerCase();
        if (!qual.includes(field) && !details.some((d) => d.toLocaleLowerCase().includes(field))) {
          details.push(`Field of study: ${item.field_of_study}`);
        }
      }
    }
    return [
      {
        id: item.id,
        institution: item.institution,
        qualification: formatQualification(item.qualification, null),
        startDate: item.start_date ?? undefined,
        endDate: item.end_date ?? undefined,
        details: input.plan.mode === "one_page" ? [] : details.slice(0, 4),
      },
    ];
  });

  const { certifications, awardLike } = splitCertificationsAndAwards(
    input.plan.certificationItemIds,
    input.snapshot,
  );

  const skills = sanitizeSkillGroups(input.draft.skills, inventory);
  const fallbackSkills =
    skills.length > 0
      ? skills
      : groupSkillsDeterministically(
          inventory.displayNames.slice(0, input.plan.skillMax),
          inventory,
        );

  const draftAchievements = (input.draft.achievements ?? []).map((item) => ({
    text: item.text,
    factIds: item.factIds,
    priority: item.priority,
  }));
  const snapshotAchievements = input.plan.achievementItemIds.flatMap((id) => {
    const item = input.snapshot.items.find((entry) => entry.id === id);
    if (!item || item.type !== "achievement") return [];
    const text = [item.name, item.result].filter(Boolean).join(" - ");
    if (text.length < 8) return [];
    return [
      {
        text,
        factIds: item.factIds,
        priority: 0,
      },
    ];
  });
  const achievements = dedupeAchievements([
    ...draftAchievements,
    ...snapshotAchievements,
    ...awardLike,
  ]);
  const achievementNames = new Set(
    achievements.map((item) =>
      item.text.split(/\s+-\s+/u)[0]?.trim().toLocaleLowerCase(),
    ),
  );
  const certificationsFiltered = certifications.filter(
    (cert) => !achievementNames.has(cert.name.trim().toLocaleLowerCase()),
  );

  const resume = {
    targetTitle: input.plan.targetTitle,
    contact: {
      fullName,
      email: profile && profile.type === "profile" ? profile.email : null,
      phone: profile && profile.type === "profile" ? profile.phone : null,
      location: profile && profile.type === "profile" ? profile.location : null,
      linkedinUrl:
        profile && profile.type === "profile" ? profile.linkedin_url : null,
      githubUrl:
        profile && profile.type === "profile" ? profile.github_url : null,
      portfolioUrl:
        profile && profile.type === "profile" ? profile.portfolio_url : null,
    },
    summary: {
      text: sanitizeCvProse(input.draft.summary.text.trim()),
      factIds: input.draft.summary.factIds,
      source: "ai_generated" as const,
    },
    skills: fallbackSkills,
    experience: experience.map((role) => ({
      ...role,
      bullets: role.bullets.map((bullet) => ({
        ...bullet,
        text: sanitizeCvProse(bullet.text),
      })),
    })),
    projects: projects.map((project) => ({
      ...project,
      paragraphs: project.paragraphs.map((paragraph) => ({
        ...paragraph,
        text: sanitizeCvProse(paragraph.text),
      })),
    })),
    education,
    certifications: certificationsFiltered,
    achievements: achievements.map((item) => ({
      ...item,
      text: sanitizeCvProse(item.text),
    })),
    references: input.plan.referenceItemIds.flatMap((id) => {
      const item = input.snapshot.items.find((entry) => entry.id === id);
      if (!item || item.type !== "reference" || !item.name.trim()) return [];
      return [
        {
          id: item.id,
          name: item.name.trim(),
          title: item.title?.trim() || undefined,
          organization: item.organization?.trim() || undefined,
          email: item.email,
          phone: item.phone,
        },
      ];
    }),
    changeNotes: input.draft.changeNotes ?? [],
    assessment: input.assessment,
  };

  return tailoredResumeSchema.parse(resume);
}

function splitCertificationsAndAwards(
  certificationItemIds: string[],
  snapshot: EvidenceSnapshot,
): {
  certifications: TailoredResume["certifications"];
  awardLike: TailoredResume["achievements"];
} {
  const certifications: TailoredResume["certifications"] = [];
  const awardLike: TailoredResume["achievements"] = [];

  for (const id of certificationItemIds) {
    const item = snapshot.items.find((entry) => entry.id === id);
    if (!item || item.type !== "certification") continue;
    const blob = `${item.name} ${item.issuer ?? ""}`;
    if (AWARD_LIKE.test(blob)) {
      awardLike.push({
        text: item.issuer ? `${item.name} - ${item.issuer}` : item.name,
        factIds: item.factIds,
        priority: 0,
      });
      continue;
    }
    certifications.push({
      id: item.id,
      name: item.name,
      issuer: item.issuer ?? undefined,
      date: item.issued_date ?? undefined,
    });
  }

  return { certifications, awardLike };
}

function dedupeAchievements(
  items: TailoredResume["achievements"],
): TailoredResume["achievements"] {
  const seen = new Set<string>();
  const out: TailoredResume["achievements"] = [];
  for (const item of items) {
    const key = item.text.trim().toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sanitizeSkillGroups(
  groups: GroqResumeDraft["skills"],
  inventory: SkillInventory,
): TailoredResume["skills"] {
  const cleaned: TailoredResume["skills"] = [];
  for (const group of groups) {
    if (!group.category.trim()) continue;
    const items = group.items
      .map((item) => resolveSkillDisplay(item, inventory))
      .filter((item): item is string => Boolean(item))
      .map((item) => clampSkillItem(item))
      .filter(Boolean);
    const unique = [...new Set(items)];
    if (unique.length === 0) continue;
    cleaned.push({ category: group.category.trim(), items: unique });
  }
  return cleaned;
}

function sanitizeTechnologies(
  requested: string[],
  inventory: SkillInventory,
  verified: string[],
): string[] {
  const verifiedKeys = new Set(
    verified.map((item) => item.trim().toLocaleLowerCase()),
  );
  const out: string[] = [];
  for (const tech of requested) {
    const display = resolveSkillDisplay(tech, inventory);
    if (!display) continue;
    if (
      !verifiedKeys.has(display.toLocaleLowerCase()) &&
      !verified.some(
        (item) => item.toLocaleLowerCase() === tech.toLocaleLowerCase(),
      )
    ) {
      const onProject = verified.some((item) =>
        item.toLocaleLowerCase().includes(tech.toLocaleLowerCase()),
      );
      if (!onProject && !inventory.keys.has(display.toLocaleLowerCase())) {
        continue;
      }
    }
    if (!out.some((item) => item.toLocaleLowerCase() === display.toLocaleLowerCase())) {
      out.push(display);
    }
  }
  return out.length > 0 ? out : verified.slice(0, 10);
}

function formatQualification(
  qualification: string | null,
  fieldOfStudy: string | null,
): string {
  const qual = qualification?.trim() || "";
  const field = fieldOfStudy?.trim() || "";
  if (qual && field) {
    if (qual.toLocaleLowerCase().includes(field.toLocaleLowerCase())) return qual;
    return `${qual}, ${field}`;
  }
  return qual || field || "";
}

function projectParagraphsFromDraft(
  draft: GroqResumeDraft["projects"][number] | undefined,
  projectId: string,
  index: number,
  maxParagraphs: number,
): TailoredResume["projects"][number]["paragraphs"] {
  if (draft?.paragraphs && draft.paragraphs.length > 0) {
    return draft.paragraphs.slice(0, maxParagraphs).map((paragraph, paragraphIndex) => ({
      text: sanitizeCvProse(paragraph.text.trim()),
      factIds: paragraph.factIds,
      priority: paragraph.priority ?? paragraphIndex,
      source: "ai_generated" as const,
    }));
  }
  if (draft?.bullets && draft.bullets.length > 0) {
    return [
      {
        text: sanitizeCvProse(
          sentencesToParagraph(draft.bullets.map((bullet) => bullet.text)),
        ),
        factIds: draft.bullets.flatMap((bullet) => bullet.factIds),
        priority: index,
        source: "ai_generated" as const,
      },
    ];
  }
  return [];
}

