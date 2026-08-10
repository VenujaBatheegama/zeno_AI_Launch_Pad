import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";

export type EvidenceFactKind =
  | "identity"
  | "bullet"
  | "technology"
  | "skill"
  | "meta"
  | "achievement"
  | "outcome"
  | "credential";

export type EvidenceFact = {
  id: string;
  careerItemId: string;
  kind: EvidenceFactKind;
  label: string;
  text: string;
};

export type EvidenceSnapshotItem =
  | {
      type: "work";
      id: string;
      employer: string;
      role: string;
      location: string | null;
      start_date: string | null;
      end_date: string | null;
      is_current: boolean;
      bullets: string[];
      factIds: string[];
    }
  | {
      type: "project";
      id: string;
      name: string;
      role: string | null;
      start_date: string | null;
      end_date: string | null;
      bullets: string[];
      technologies: string[];
      factIds: string[];
    }
  | {
      type: "education";
      id: string;
      institution: string;
      qualification: string | null;
      field_of_study: string | null;
      start_date: string | null;
      end_date: string | null;
      details: string[];
      factIds: string[];
    }
  | {
      type: "skill";
      id: string;
      name: string;
      factIds: string[];
    }
  | {
      type: "certification";
      id: string;
      name: string;
      issuer: string | null;
      issued_date: string | null;
      factIds: string[];
    }
  | {
      type: "achievement";
      id: string;
      name: string;
      result: string | null;
      issuer: string | null;
      date: string | null;
      factIds: string[];
    }
  | {
      type: "reference";
      id: string;
      name: string;
      title: string | null;
      organization: string | null;
      email: string | null;
      phone: string | null;
      factIds: string[];
    }
  | {
      type: "profile";
      id: "profile";
      full_name: string | null;
      email: string | null;
      phone: string | null;
      location: string | null;
      summary: string | null;
      linkedin_url: string | null;
      github_url: string | null;
      portfolio_url: string | null;
      factIds: string[];
    };

export type EvidenceSnapshot = {
  evidenceSetId: string;
  facts: EvidenceFact[];
  items: EvidenceSnapshotItem[];
};

export function buildEvidenceSnapshot(
  evidenceSetId: string,
  evidence: CareerEvidence,
): EvidenceSnapshot {
  const facts: EvidenceFact[] = [];
  const items: EvidenceSnapshotItem[] = [];

  const profileFacts: string[] = [];
  if (evidence.profile.full_name) {
    const id = factId("profile", "identity", "full_name");
    facts.push({
      id,
      careerItemId: "profile",
      kind: "identity",
      label: "full_name",
      text: evidence.profile.full_name,
    });
    profileFacts.push(id);
  }
  for (const field of ["email", "phone", "location", "summary"] as const) {
    const value = evidence.profile[field];
    if (!value) continue;
    const id = factId("profile", "meta", field);
    facts.push({
      id,
      careerItemId: "profile",
      kind: "meta",
      label: field,
      text: value,
    });
    profileFacts.push(id);
  }
  for (const field of ["linkedin_url", "github_url", "portfolio_url"] as const) {
    const value = evidence.profile[field];
    if (!value) continue;
    const id = factId("profile", "meta", field);
    facts.push({
      id,
      careerItemId: "profile",
      kind: "meta",
      label: field,
      text: value,
    });
    profileFacts.push(id);
  }
  items.push({
    type: "profile",
    id: "profile",
    full_name: evidence.profile.full_name,
    email: evidence.profile.email,
    phone: evidence.profile.phone,
    location: evidence.profile.location,
    summary: evidence.profile.summary,
    linkedin_url: evidence.profile.linkedin_url ?? null,
    github_url: evidence.profile.github_url ?? null,
    portfolio_url: evidence.profile.portfolio_url ?? null,
    factIds: profileFacts,
  });

  for (const work of evidence.work_experience) {
    const factIds: string[] = [];
    for (const field of ["employer", "role"] as const) {
      const id = factId(work.id, "identity", field);
      facts.push({
        id,
        careerItemId: work.id,
        kind: "identity",
        label: field,
        text: work[field],
      });
      factIds.push(id);
    }
    if (work.location) {
      const id = factId(work.id, "meta", "location");
      facts.push({
        id,
        careerItemId: work.id,
        kind: "meta",
        label: "location",
        text: work.location,
      });
      factIds.push(id);
    }
    for (const [index, bullet] of work.bullets.entries()) {
      const id = factId(work.id, "bullet", String(index));
      facts.push({
        id,
        careerItemId: work.id,
        kind: "bullet",
        label: `bullet_${index}`,
        text: bullet,
      });
      factIds.push(id);
    }
    items.push({
      type: "work",
      id: work.id,
      employer: work.employer,
      role: work.role,
      location: work.location,
      start_date: work.start_date,
      end_date: work.end_date,
      is_current: work.is_current,
      bullets: [...work.bullets],
      factIds,
    });
  }

  for (const project of evidence.projects) {
    const factIds: string[] = [];
    const nameId = factId(project.id, "identity", "name");
    facts.push({
      id: nameId,
      careerItemId: project.id,
      kind: "identity",
      label: "name",
      text: project.name,
    });
    factIds.push(nameId);
    for (const [index, bullet] of project.bullets.entries()) {
      const id = factId(project.id, "bullet", String(index));
      facts.push({
        id,
        careerItemId: project.id,
        kind: "bullet",
        label: `bullet_${index}`,
        text: bullet,
      });
      factIds.push(id);
    }
    for (const tech of project.technologies) {
      const id = factId(project.id, "technology", normalizeKey(tech));
      facts.push({
        id,
        careerItemId: project.id,
        kind: "technology",
        label: tech,
        text: tech,
      });
      factIds.push(id);
    }
    items.push({
      type: "project",
      id: project.id,
      name: project.name,
      role: project.role,
      start_date: project.start_date,
      end_date: project.end_date,
      bullets: [...project.bullets],
      technologies: [...project.technologies],
      factIds,
    });
  }

  for (const education of evidence.education) {
    const factIds: string[] = [];
    const id = factId(education.id, "identity", "institution");
    facts.push({
      id,
      careerItemId: education.id,
      kind: "identity",
      label: "institution",
      text: education.institution,
    });
    factIds.push(id);
    if (education.qualification) {
      const qid = factId(education.id, "identity", "qualification");
      facts.push({
        id: qid,
        careerItemId: education.id,
        kind: "identity",
        label: "qualification",
        text: education.qualification,
      });
      factIds.push(qid);
    }
    if (education.field_of_study) {
      const fid = factId(education.id, "identity", "field_of_study");
      facts.push({
        id: fid,
        careerItemId: education.id,
        kind: "identity",
        label: "field_of_study",
        text: education.field_of_study,
      });
      factIds.push(fid);
    }
    items.push({
      type: "education",
      id: education.id,
      institution: education.institution,
      qualification: education.qualification,
      field_of_study: education.field_of_study,
      start_date: education.start_date,
      end_date: education.end_date,
      details: [...(education.details ?? [])],
      factIds,
    });
  }

  for (const skill of evidence.skills) {
    const id = factId(skill.id, "skill", normalizeKey(skill.name));
    facts.push({
      id,
      careerItemId: skill.id,
      kind: "skill",
      label: skill.name,
      text: skill.name,
    });
    items.push({
      type: "skill",
      id: skill.id,
      name: skill.name,
      factIds: [id],
    });
  }

  for (const cert of evidence.certifications) {
    const id = factId(cert.id, "credential", "name");
    facts.push({
      id,
      careerItemId: cert.id,
      kind: "credential",
      label: "name",
      text: cert.name,
    });
    const factIds = [id];
    if (cert.issuer) {
      const issuerId = factId(cert.id, "meta", "issuer");
      facts.push({
        id: issuerId,
        careerItemId: cert.id,
        kind: "meta",
        label: "issuer",
        text: cert.issuer,
      });
      factIds.push(issuerId);
    }
    items.push({
      type: "certification",
      id: cert.id,
      name: cert.name,
      issuer: cert.issuer,
      issued_date: cert.issued_date,
      factIds,
    });
  }

  for (const achievement of evidence.achievements ?? []) {
    const id = factId(achievement.id, "achievement", "name");
    facts.push({
      id,
      careerItemId: achievement.id,
      kind: "achievement",
      label: "name",
      text: achievement.name,
    });
    const factIds = [id];
    if (achievement.result) {
      const resultId = factId(achievement.id, "outcome", "result");
      facts.push({
        id: resultId,
        careerItemId: achievement.id,
        kind: "outcome",
        label: "result",
        text: achievement.result,
      });
      factIds.push(resultId);
    }
    if (achievement.issuer) {
      const issuerId = factId(achievement.id, "meta", "issuer");
      facts.push({
        id: issuerId,
        careerItemId: achievement.id,
        kind: "meta",
        label: "issuer",
        text: achievement.issuer,
      });
      factIds.push(issuerId);
    }
    items.push({
      type: "achievement",
      id: achievement.id,
      name: achievement.name,
      result: achievement.result,
      issuer: achievement.issuer,
      date: achievement.date,
      factIds,
    });
  }

  for (const reference of evidence.references ?? []) {
    const id = factId(reference.id, "identity", "name");
    facts.push({
      id,
      careerItemId: reference.id,
      kind: "identity",
      label: "name",
      text: reference.name,
    });
    const factIds = [id];
    if (reference.title) {
      const titleId = factId(reference.id, "meta", "title");
      facts.push({
        id: titleId,
        careerItemId: reference.id,
        kind: "meta",
        label: "title",
        text: reference.title,
      });
      factIds.push(titleId);
    }
    if (reference.organization) {
      const orgId = factId(reference.id, "meta", "organization");
      facts.push({
        id: orgId,
        careerItemId: reference.id,
        kind: "meta",
        label: "organization",
        text: reference.organization,
      });
      factIds.push(orgId);
    }
    if (reference.email) {
      const emailId = factId(reference.id, "meta", "email");
      facts.push({
        id: emailId,
        careerItemId: reference.id,
        kind: "meta",
        label: "email",
        text: reference.email,
      });
      factIds.push(emailId);
    }
    if (reference.phone) {
      const phoneId = factId(reference.id, "meta", "phone");
      facts.push({
        id: phoneId,
        careerItemId: reference.id,
        kind: "meta",
        label: "phone",
        text: reference.phone,
      });
      factIds.push(phoneId);
    }
    items.push({
      type: "reference",
      id: reference.id,
      name: reference.name,
      title: reference.title,
      organization: reference.organization,
      email: reference.email,
      phone: reference.phone,
      factIds,
    });
  }

  return { evidenceSetId, facts, items };
}

export function factId(
  careerItemId: string,
  kind: EvidenceFactKind,
  key: string,
): string {
  return `${careerItemId}:${kind}:${normalizeKey(key)}`;
}

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll(/\s+/gu, "_");
}
