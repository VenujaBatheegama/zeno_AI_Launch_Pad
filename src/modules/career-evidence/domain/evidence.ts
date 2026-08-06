import { z } from "zod";

const partialDateSchema = z
  .string()
  .regex(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/)
  .nullable();
const extractedDateSchema = z.string().min(1).nullable();

const extractedWorkExperienceSchema = z
  .object({
    employer: z.string().min(1).nullable(),
    role: z.string().min(1).nullable(),
    location: z.string().nullable(),
    start_date: extractedDateSchema,
    end_date: extractedDateSchema,
    is_current: z.boolean(),
    bullets: z.array(z.string().min(1)),
    source_quote: z.string().min(1),
  })
  .strip();

const extractedEducationSchema = z
  .object({
    institution: z.string().min(1).nullable(),
    qualification: z.string().nullable(),
    field_of_study: z.string().nullable(),
    start_date: extractedDateSchema,
    end_date: extractedDateSchema,
    source_quote: z.string().min(1),
  })
  .strip();

const extractedSkillSchema = z
  .object({
    name: z.string().min(1).nullable(),
    source_quote: z.string().min(1),
  })
  .strip();

const extractedProjectSchema = z
  .object({
    name: z.string().min(1).nullable(),
    role: z.string().nullable(),
    start_date: extractedDateSchema,
    end_date: extractedDateSchema,
    bullets: z.array(z.string().min(1)),
    technologies: z.array(z.string().min(1)),
    source_quote: z.string().min(1),
  })
  .strip();

const extractedCertificationSchema = z
  .object({
    name: z.string().min(1).nullable(),
    issuer: z.string().nullable(),
    issued_date: extractedDateSchema,
    source_quote: z.string().min(1),
  })
  .strip();

export const extractedCareerEvidenceSchema = z
  .object({
    profile: z
      .object({
        full_name: z.string().nullable(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        location: z.string().nullable(),
        summary: z.string().nullable(),
      })
      .strip(),
    work_experience: z.array(extractedWorkExperienceSchema),
    education: z.array(extractedEducationSchema),
    skills: z.array(extractedSkillSchema),
    projects: z.array(extractedProjectSchema),
    certifications: z.array(extractedCertificationSchema),
    warnings: z.array(z.string()),
  })
  .strip();

export const careerEvidenceToolInputSchema = z
  .object({
    profile: extractedCareerEvidenceSchema.shape.profile.passthrough(),
    work_experience: z.array(extractedWorkExperienceSchema.passthrough()),
    education: z.array(extractedEducationSchema.passthrough()),
    skills: z.array(extractedSkillSchema.passthrough()),
    projects: z.array(extractedProjectSchema.passthrough()),
    certifications: z.array(extractedCertificationSchema.passthrough()),
    warnings: z.array(z.string()),
  })
  .passthrough();

export type ExtractedCareerEvidence = z.infer<
  typeof extractedCareerEvidenceSchema
>;

const itemMetadataSchema = z.object({
  id: z.uuid(),
  origin: z.enum(["extracted", "user_edited"]),
  source_quote: z.string().nullable(),
});

const editableItem = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, ...itemMetadataSchema.shape }).strict();

export const careerEvidenceSchema = z
  .object({
    schema_version: z.literal(1),
    profile: extractedCareerEvidenceSchema.shape.profile,
    work_experience: z.array(
      editableItem({
        employer: z.string(),
        role: z.string(),
        location: z.string().nullable(),
        start_date: partialDateSchema,
        end_date: partialDateSchema,
        is_current: z.boolean(),
        bullets: z.array(z.string().min(1)),
      }),
    ),
    education: z.array(
      editableItem({
        institution: z.string(),
        qualification: z.string().nullable(),
        field_of_study: z.string().nullable(),
        start_date: partialDateSchema,
        end_date: partialDateSchema,
      }),
    ),
    skills: z.array(
      editableItem({
        name: z.string(),
      }),
    ),
    projects: z.array(
      editableItem({
        name: z.string(),
        role: z.string().nullable(),
        start_date: partialDateSchema,
        end_date: partialDateSchema,
        bullets: z.array(z.string().min(1)),
        technologies: z.array(z.string().min(1)),
      }),
    ),
    certifications: z.array(
      editableItem({
        name: z.string(),
        issuer: z.string().nullable(),
        issued_date: partialDateSchema,
      }),
    ),
    warnings: z.array(z.string()),
  })
  .strict();

export type CareerEvidence = z.infer<typeof careerEvidenceSchema>;
export const verifiedCareerEvidenceSchema = careerEvidenceSchema.superRefine(
  (evidence, context) => {
    const requireValue = (value: string, path: Array<string | number>) => {
      if (!value.trim()) {
        context.addIssue({
          code: "custom",
          path,
          message: "Complete this required field before verification.",
        });
      }
    };

    evidence.work_experience.forEach((item, index) => {
      requireValue(item.employer, ["work_experience", index, "employer"]);
      requireValue(item.role, ["work_experience", index, "role"]);
    });
    evidence.education.forEach((item, index) =>
      requireValue(item.institution, ["education", index, "institution"]),
    );
    evidence.skills.forEach((item, index) =>
      requireValue(item.name, ["skills", index, "name"]),
    );
    evidence.projects.forEach((item, index) =>
      requireValue(item.name, ["projects", index, "name"]),
    );
    evidence.certifications.forEach((item, index) =>
      requireValue(item.name, ["certifications", index, "name"]),
    );
  },
);
export type EvidenceStatus = "draft" | "verified";

export type CareerEvidenceSet = {
  id: string;
  userId: string;
  sourceDocumentId: string;
  status: EvidenceStatus;
  evidence: CareerEvidence;
  extractionModel: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
};

export function addExtractionMetadata(
  extracted: ExtractedCareerEvidence,
  createId: () => string,
): CareerEvidence {
  const withMetadata = <T extends { source_quote: string }>(item: T) => ({
    ...item,
    source_quote: item.source_quote || null,
    id: createId(),
    origin: "extracted" as const,
  });
  const incompleteWarnings = [
    ...extracted.work_experience
      .filter((item) => item.employer === null || item.role === null)
      .map((item) => {
        const missing = [
          item.employer === null ? "employer" : null,
          item.role === null ? "role" : null,
        ].filter(Boolean);
        return `Work experience “${summarizeSource(item.source_quote)}” was kept for review because ${formatMissingFields(missing)} missing.`;
      }),
    ...extracted.education
      .filter((item) => item.institution === null)
      .map(
        (item) =>
          `Education “${summarizeSource(item.source_quote)}” was kept for review because the institution was missing.`,
      ),
    ...extracted.skills
      .filter((item) => item.name === null)
      .map(
        (item) =>
          `Skill “${summarizeSource(item.source_quote)}” was kept for review because the skill name was missing.`,
      ),
    ...extracted.projects
      .filter((item) => item.name === null)
      .map(
        (item) =>
          `Project “${summarizeSource(item.source_quote)}” was kept for review because the project name was missing.`,
      ),
    ...extracted.certifications
      .filter((item) => item.name === null)
      .map(
        (item) =>
          `Certification “${summarizeSource(item.source_quote)}” was kept for review because the certification name was missing.`,
      ),
  ];

  return careerEvidenceSchema.parse({
    schema_version: 1,
    profile: extracted.profile,
    work_experience: extracted.work_experience.map((item) =>
      withMetadata({
        ...item,
        employer: item.employer ?? "",
        role: item.role ?? "",
        start_date: normalizeExtractedDate(item.start_date),
        end_date: normalizeExtractedDate(item.end_date),
      }),
    ),
    education: extracted.education.map((item) =>
      withMetadata({
        ...item,
        institution: item.institution ?? "",
        start_date: normalizeExtractedDate(item.start_date),
        end_date: normalizeExtractedDate(item.end_date),
      }),
    ),
    skills: extracted.skills.map((item) =>
      withMetadata({
        ...item,
        name: item.name ?? "",
      }),
    ),
    projects: extracted.projects.map((item) =>
      withMetadata({
        ...item,
        name: item.name ?? "",
        start_date: normalizeExtractedDate(item.start_date),
        end_date: normalizeExtractedDate(item.end_date),
      }),
    ),
    certifications: extracted.certifications.map((item) =>
      withMetadata({
        ...item,
        name: item.name ?? "",
        issued_date: normalizeExtractedDate(item.issued_date),
      }),
    ),
    warnings: [...extracted.warnings, ...incompleteWarnings],
  });
}

function summarizeSource(source: string): string {
  const normalized = source.replace(/\s+/g, " ").trim();
  return normalized.length > 90
    ? `${normalized.slice(0, 87).trimEnd()}…`
    : normalized;
}

function formatMissingFields(fields: Array<string | null>): string {
  const present = fields.filter((field): field is string => field !== null);
  if (present.length === 1) {
    return `the ${present[0]} was`;
  }
  return `the ${present.slice(0, -1).join(", ")} and ${present.at(-1)} were`;
}

export function normalizeExtractedDate(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["present", "current", "in progress", "ongoing"].includes(normalized)) {
    return null;
  }

  const yearOnly = normalized.match(/\b(\d{4})\b/);
  if (!yearOnly) {
    return null;
  }

  const monthNames = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const monthIndex = monthNames.findIndex((month) =>
    normalized.includes(month),
  );
  if (monthIndex >= 0) {
    return `${yearOnly[1]}-${String(monthIndex + 1).padStart(2, "0")}`;
  }

  const numericMonth = normalized.match(
    /\b\d{4}[-/.](0?[1-9]|1[0-2])\b/,
  );
  if (numericMonth) {
    return `${yearOnly[1]}-${numericMonth[1].padStart(2, "0")}`;
  }

  return yearOnly[1];
}

type EvidenceItem =
  | CareerEvidence["work_experience"][number]
  | CareerEvidence["education"][number]
  | CareerEvidence["skills"][number]
  | CareerEvidence["projects"][number]
  | CareerEvidence["certifications"][number];

export function reconcileUserEdits(
  current: CareerEvidence,
  submitted: CareerEvidence,
): CareerEvidence {
  return careerEvidenceSchema.parse({
    ...submitted,
    work_experience: reconcileItems(
      current.work_experience,
      submitted.work_experience,
    ),
    education: reconcileItems(current.education, submitted.education),
    skills: reconcileItems(current.skills, submitted.skills),
    projects: reconcileItems(current.projects, submitted.projects),
    certifications: reconcileItems(
      current.certifications,
      submitted.certifications,
    ),
  });
}

function reconcileItems<T extends EvidenceItem>(
  currentItems: T[],
  submittedItems: T[],
): T[] {
  const currentById = new Map(currentItems.map((item) => [item.id, item]));

  return submittedItems.map((submitted) => {
    const current = currentById.get(submitted.id);
    if (current && sameClaimData(current, submitted)) {
      return {
        ...submitted,
        origin: current.origin,
        source_quote: current.source_quote,
      };
    }

    return {
      ...submitted,
      origin: "user_edited",
      source_quote: null,
    };
  });
}

function sameClaimData(left: EvidenceItem, right: EvidenceItem): boolean {
  const metadataKeys = new Set(["id", "origin", "source_quote"]);
  const claimData = (item: EvidenceItem) =>
    Object.fromEntries(
      Object.entries(item).filter(([key]) => !metadataKeys.has(key)),
    );

  return JSON.stringify(claimData(left)) === JSON.stringify(claimData(right));
}
