import type { ContentPlan } from "./content-plan";
import type { EvidenceSnapshot } from "./facts";
import { isClaimableCapabilityKeyword } from "./keywords";
import type { TailoredCvContent } from "./schemas";
import { fallbackBulletsFromFacts } from "./validation";

/**
 * Last-resort CV content built only from verified source wording.
 * Used when the LLM output cannot be repaired into a grounded document.
 */
export function buildDeterministicTailoredContent(input: {
  plan: ContentPlan;
  snapshot: EvidenceSnapshot;
}): TailoredCvContent {
  const experience = input.plan.experienceItemIds.flatMap((id) => {
    const item = input.snapshot.items.find((entry) => entry.id === id);
    if (!item || item.type !== "work") return [];
    const bullets = fallbackBulletsFromFacts({
      careerItemId: id,
      snapshot: input.snapshot,
      maxBullets: input.plan.bulletsPerExperience,
      maxChars: input.plan.bulletMaxChars,
    });
    if (bullets.length === 0) return [];
    return [{ career_item_id: id, bullets }];
  });

  const projects = input.plan.projectItemIds.flatMap((id) => {
    const item = input.snapshot.items.find((entry) => entry.id === id);
    if (!item || item.type !== "project") return [];
    const bullets = projectBulletsOrTechFallback(id, item, input);
    if (bullets.length === 0) return [];
    return [
      {
        career_item_id: id,
        display_title: item.name,
        bullets,
      },
    ];
  });

  return {
    target_title: input.plan.targetTitle,
    summary: buildDeterministicSummary(input),
    experience,
    projects,
    ordered_skill_ids: input.plan.skillItemIds,
    change_notes: [
      {
        career_item_id: "profile",
        explanation:
          "Used verified source wording with target positioning because tailored phrasing could not be validated safely.",
      },
    ],
  };
}

/** Align LLM output to the deterministic selection plan before validation. */
export function normalizeTailoredContent(input: {
  content: TailoredCvContent;
  plan: ContentPlan;
  snapshot: EvidenceSnapshot;
}): TailoredCvContent {
  const itemById = new Map(
    input.snapshot.items.map((item) => [item.id, item]),
  );
  const banned = input.plan.keywordAudit
    .filter(
      (entry) =>
        (entry.support_state === "unsupported" ||
          entry.support_state === "transferable") &&
        entry.priority !== "role_language" &&
        isClaimableCapabilityKeyword(entry.keyword),
    )
    .map((entry) => entry.keyword);

  const experience = input.plan.experienceItemIds.flatMap((id) => {
    const existing = input.content.experience.find(
      (item) => item.career_item_id === id,
    );
    if (existing && existing.bullets.length > 0) {
      const cleaned = existing.bullets
        .slice(0, input.plan.bulletsPerExperience)
        .map((bullet) => ({
          ...bullet,
          text: stripFirstPerson(bullet.text),
        }))
        .filter((bullet) => !containsBanned(bullet.text, banned));
      if (cleaned.length > 0) {
        return [{ ...existing, bullets: cleaned }];
      }
    }
    const bullets = fallbackBulletsFromFacts({
      careerItemId: id,
      snapshot: input.snapshot,
      maxBullets: input.plan.bulletsPerExperience,
      maxChars: input.plan.bulletMaxChars,
    });
    return bullets.length > 0 ? [{ career_item_id: id, bullets }] : [];
  });

  const projects = input.plan.projectItemIds.flatMap((id) => {
    const item = itemById.get(id);
    if (!item || item.type !== "project") return [];
    const existing = input.content.projects.find(
      (entry) => entry.career_item_id === id,
    );
    let bullets =
      existing && existing.bullets.length > 0
        ? existing.bullets
            .slice(0, input.plan.bulletsPerProject)
            .map((bullet) => ({
              ...bullet,
              text: stripFirstPerson(bullet.text),
            }))
            .filter((bullet) => !containsBanned(bullet.text, banned))
        : [];
    if (bullets.length === 0) {
      bullets = projectBulletsOrTechFallback(id, item, input);
    }
    if (bullets.length === 0) return [];
    return [
      {
        career_item_id: id,
        display_title: item.name,
        bullets,
      },
    ];
  });

  const summaryCandidate =
    input.content.summary &&
    !containsBannedClaim(input.content.summary.text, banned)
      ? {
          text: stripFirstPerson(input.content.summary.text),
          evidence_refs: input.content.summary.evidence_refs,
        }
      : null;

  return {
    target_title:
      input.content.target_title?.trim() || input.plan.targetTitle,
    summary: summaryCandidate ?? buildDeterministicSummary(input),
    experience,
    projects,
    ordered_skill_ids: input.plan.skillItemIds.filter((id) =>
      input.content.ordered_skill_ids.includes(id),
    ).length > 0
      ? input.plan.skillItemIds.filter((id) =>
          input.content.ordered_skill_ids.includes(id),
        )
      : input.plan.skillItemIds,
    change_notes: input.content.change_notes.slice(0, 12),
  };
}

export function buildDeterministicSummary(input: {
  plan: ContentPlan;
  snapshot: EvidenceSnapshot;
}): NonNullable<TailoredCvContent["summary"]> {
  const profile = input.snapshot.items.find((item) => item.type === "profile");
  const education = input.snapshot.items.find((item) => item.type === "education");
  const skills = input.plan.skillItemIds
    .map((id) =>
      input.snapshot.items.find((item) => item.id === id && item.type === "skill"),
    )
    .filter(
      (
        item,
      ): item is Extract<EvidenceSnapshot["items"][number], { type: "skill" }> =>
        Boolean(item && item.type === "skill"),
    )
    .map((item) => item.name)
    .slice(0, 4);
  const projects = input.plan.projectItemIds
    .map((id) =>
      input.snapshot.items.find(
        (item) => item.id === id && item.type === "project",
      ),
    )
    .filter(
      (
        item,
      ): item is Extract<EvidenceSnapshot["items"][number], { type: "project" }> =>
        Boolean(item && item.type === "project"),
    )
    .slice(0, 2);

  const educationBit =
    education && education.type === "education"
      ? `${education.qualification ? `${education.qualification} ` : ""}${education.field_of_study ?? education.institution}`.trim()
      : null;

  const skillBit =
    skills.length > 0 ? `with skills in ${skills.join(", ")}` : null;
  const projectBit =
    projects.length > 0
      ? `including work on ${projects.map((item) => item.name).join(" and ")}`
      : null;

  const parts = [
    educationBit
      ? `${educationBit} candidate targeting ${input.plan.targetTitle} roles that value practical software delivery`
      : `Candidate targeting ${input.plan.targetTitle} roles that value practical software delivery`,
    skillBit
      ? skillBit.replace(/^with skills in /u, "Strongest verified technical direction spans ")
      : null,
    projectBit
      ? projectBit.replace(
          /^including work on /u,
          "Recent build focus includes ",
        )
      : null,
    input.plan.jobAlignment === "low" || input.plan.jobAlignment === "very_low"
      ? "focused on transferable software-engineering foundations while building domain-specific depth"
      : "Combines verified experience and project delivery into a clear, job-ready engineering foundation",
  ].filter(Boolean);

  let text = `${parts.join(", ")}.`;
  if (text.length > input.plan.summaryMaxChars) {
    // Drop optional trailing clauses rather than mid-sentence character cuts.
    text = `${parts.slice(0, Math.max(1, parts.length - 1)).join(", ")}.`;
  }

  const evidence_refs: NonNullable<TailoredCvContent["summary"]>["evidence_refs"] =
    [];
  if (profile) {
    const fact = input.snapshot.facts.find(
      (entry) => entry.careerItemId === "profile" && entry.kind === "identity",
    );
    if (fact) {
      evidence_refs.push({ career_item_id: "profile", fact_ids: [fact.id] });
    }
  }
  for (const skillId of input.plan.skillItemIds.slice(0, 2)) {
    const fact = input.snapshot.facts.find(
      (entry) => entry.careerItemId === skillId,
    );
    if (fact) {
      evidence_refs.push({ career_item_id: skillId, fact_ids: [fact.id] });
    }
  }
  for (const project of projects) {
    const fact = input.snapshot.facts.find(
      (entry) => entry.careerItemId === project.id,
    );
    if (fact) {
      evidence_refs.push({
        career_item_id: project.id,
        fact_ids: [fact.id],
      });
    }
  }
  if (education && evidence_refs.every((ref) => ref.career_item_id !== education.id)) {
    const fact = input.snapshot.facts.find(
      (entry) => entry.careerItemId === education.id,
    );
    if (fact) {
      evidence_refs.push({
        career_item_id: education.id,
        fact_ids: [fact.id],
      });
    }
  }

  if (evidence_refs.length === 0) {
    const anyFact = input.snapshot.facts[0];
    if (anyFact) {
      evidence_refs.push({
        career_item_id: anyFact.careerItemId,
        fact_ids: [anyFact.id],
      });
    }
  }

  return { text, evidence_refs };
}

function projectBulletsOrTechFallback(
  id: string,
  item: Extract<EvidenceSnapshot["items"][number], { type: "project" }>,
  input: { plan: ContentPlan; snapshot: EvidenceSnapshot },
): TailoredCvContent["projects"][number]["bullets"] {
  const bullets = fallbackBulletsFromFacts({
    careerItemId: id,
    snapshot: input.snapshot,
    maxBullets: input.plan.bulletsPerProject,
    maxChars: input.plan.bulletMaxChars,
  });
  if (bullets.length > 0) return bullets;
  const techFacts = input.snapshot.facts.filter(
    (fact) => fact.careerItemId === id && fact.kind === "technology",
  );
  if (techFacts.length === 0) return [];
  return [
    {
      text: `Worked with ${techFacts
        .map((fact) => fact.text)
        .slice(0, 8)
        .join(", ")}.`,
      fact_ids: techFacts.slice(0, 8).map((fact) => fact.id),
      supported_keyword_ids: [],
    },
  ];
}

function stripFirstPerson(text: string): string {
  return text
    .replaceAll(/\bI\b/gu, "")
    .replaceAll(/\b[Mm]y\b/gu, "")
    .replaceAll(/\b[Mm]e\b/gu, "")
    .replaceAll(/\s{2,}/gu, " ")
    .trim();
}

function containsBanned(text: string, banned: string[]): boolean {
  return banned.some((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(
      `(^|[^a-z0-9.+#])${escaped}([^a-z0-9.+#]|$)`,
      "iu",
    ).test(text);
  });
}

function containsBannedClaim(text: string, banned: string[]): boolean {
  if (
    !/\b(experience|experienced|proficient|expertise|speciali[sz]ing)\b/iu.test(
      text,
    )
  ) {
    return false;
  }
  return containsBanned(text, banned);
}
