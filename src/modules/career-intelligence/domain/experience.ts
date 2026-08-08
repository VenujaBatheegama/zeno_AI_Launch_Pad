import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";

export type ExperienceInterval = {
  evidenceId: string;
  type: "employment" | "internship" | "project" | "education" | "certification";
  start: Date | null;
  end: Date | null;
  isCurrent: boolean;
  label: string;
};

export type ExperienceSummary = {
  totalRelevantMonths: number;
  internshipMonths: number;
  employmentMonths: number;
  projectCount: number;
  educationCount: number;
  certificationCount: number;
  skillCount: number;
  intervals: ExperienceInterval[];
  evidenceIds: string[];
};

export function summarizeExperience(evidence: CareerEvidence): ExperienceSummary {
  const intervals: ExperienceInterval[] = [];

  for (const item of evidence.work_experience) {
    const type = /intern/iu.test(item.role) ? "internship" : "employment";
    intervals.push({
      evidenceId: item.id,
      type,
      start: parsePartialDate(item.start_date),
      end: item.is_current ? null : parsePartialDate(item.end_date),
      isCurrent: item.is_current,
      label: `${item.role} at ${item.employer}`,
    });
  }

  for (const item of evidence.projects) {
    intervals.push({
      evidenceId: item.id,
      type: "project",
      start: parsePartialDate(item.start_date),
      end: parsePartialDate(item.end_date),
      isCurrent: false,
      label: item.name,
    });
  }

  for (const item of evidence.education) {
    intervals.push({
      evidenceId: item.id,
      type: "education",
      start: parsePartialDate(item.start_date),
      end: parsePartialDate(item.end_date),
      isCurrent: false,
      label: item.institution,
    });
  }

  for (const item of evidence.certifications) {
    intervals.push({
      evidenceId: item.id,
      type: "certification",
      start: parsePartialDate(item.issued_date),
      end: parsePartialDate(item.issued_date),
      isCurrent: false,
      label: item.name,
    });
  }

  const internshipMonths = monthsWithoutOverlap(
    intervals.filter((item) => item.type === "internship"),
  );
  const employmentMonths = monthsWithoutOverlap(
    intervals.filter((item) => item.type === "employment"),
  );

  return {
    totalRelevantMonths: internshipMonths + employmentMonths,
    internshipMonths,
    employmentMonths,
    projectCount: evidence.projects.length,
    educationCount: evidence.education.length,
    certificationCount: evidence.certifications.length,
    skillCount: evidence.skills.length,
    intervals,
    evidenceIds: [
      ...evidence.work_experience.map((item) => item.id),
      ...evidence.projects.map((item) => item.id),
      ...evidence.education.map((item) => item.id),
      ...evidence.skills.map((item) => item.id),
      ...evidence.certifications.map((item) => item.id),
    ],
  };
}

export function parsePartialDate(value: string | null): Date | null {
  if (!value) return null;
  if (/^\d{4}$/u.test(value)) {
    return new Date(`${value}-01-01T00:00:00.000Z`);
  }
  if (/^\d{4}-(0[1-9]|1[0-2])$/u.test(value)) {
    return new Date(`${value}-01T00:00:00.000Z`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

export function monthsWithoutOverlap(
  intervals: ExperienceInterval[],
  now = new Date(),
): number {
  const ranges = intervals
    .map((interval) => {
      const start = interval.start;
      if (!start) return null;
      const end = interval.isCurrent || !interval.end ? now : interval.end;
      if (end < start) return null;
      return { start: start.getTime(), end: end.getTime() };
    })
    .filter((range): range is { start: number; end: number } => Boolean(range))
    .sort((a, b) => a.start - b.start);

  if (ranges.length === 0) return 0;

  const merged: Array<{ start: number; end: number }> = [ranges[0]];
  for (const range of ranges.slice(1)) {
    const current = merged.at(-1)!;
    if (range.start <= current.end) {
      current.end = Math.max(current.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const totalMs = merged.reduce(
    (sum, range) => sum + (range.end - range.start),
    0,
  );
  return Math.round(totalMs / (1000 * 60 * 60 * 24 * 30.4375));
}
