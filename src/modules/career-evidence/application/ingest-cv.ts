import {
  addExtractionMetadata,
  normalizeExtractedDate,
  type CareerEvidenceSet,
} from "../domain/evidence";
import { enrichEvidenceWithReferences } from "../domain/recover-references";
import { CareerEvidenceError } from "../domain/errors";
import type {
  CareerEvidenceRepository,
  CvFile,
  CvFormat,
  CvStorage,
  CvTextExtractor,
  EvidenceExtractor,
  IdGenerator,
} from "./ports";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 120_000;

type IngestCvDependencies = {
  repository: CareerEvidenceRepository;
  storage: CvStorage;
  textExtractor: CvTextExtractor;
  evidenceExtractor: EvidenceExtractor;
  extractionModel: string;
  createId: IdGenerator;
};

export type IngestCvCommand = {
  userId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export async function ingestCv(
  command: IngestCvCommand,
  dependencies: IngestCvDependencies,
): Promise<CareerEvidenceSet> {
  const file = validateCvFile(command);
  const documentId = dependencies.createId();
  const evidenceSetId = dependencies.createId();
  const extension = file.format === "pdf" ? "pdf" : "docx";
  const storagePath = `${command.userId}/${documentId}/original.${extension}`;

  await dependencies.repository.createDocument({
    id: documentId,
    userId: command.userId,
    storagePath,
    originalFilename: command.fileName,
    mimeType: command.mimeType,
    byteSize: command.bytes.byteLength,
    status: "processing",
    extractedText: null,
    errorMessage: null,
  });

  try {
    await dependencies.storage.save({
      path: storagePath,
      bytes: command.bytes,
      contentType: command.mimeType,
    });

    const extractedText = normalizeExtractedText(
      await dependencies.textExtractor.extract(file),
    );
    const extracted = await dependencies.evidenceExtractor.extract(extractedText);
    const grounded = removeUnsupportedEvidence(extracted, extractedText);
    const withMetadata = addExtractionMetadata(grounded, dependencies.createId);
    // PDF text often scrambles REFERENCES; recover referees deterministically.
    const evidence = enrichEvidenceWithReferences(withMetadata, extractedText);

    await dependencies.repository.markDocumentProcessed({
      id: documentId,
      userId: command.userId,
      extractedText,
    });

    return await dependencies.repository.createDraft({
      id: evidenceSetId,
      userId: command.userId,
      sourceDocumentId: documentId,
      evidence,
      extractionModel: dependencies.extractionModel,
    });
  } catch (error) {
    const failure = toIngestionError(error);
    await dependencies.repository.markDocumentFailed({
      id: documentId,
      userId: command.userId,
      errorMessage: failure.message,
    });
    throw failure;
  }
}

function validateCvFile(command: IngestCvCommand): CvFile {
  if (command.bytes.byteLength === 0 || command.bytes.byteLength > MAX_FILE_BYTES) {
    throw new CareerEvidenceError(
      "INVALID_FILE",
      "Upload a CV smaller than 10 MB.",
    );
  }

  const lowerName = command.fileName.toLowerCase();
  const isPdf =
    lowerName.endsWith(".pdf") &&
    command.mimeType === "application/pdf" &&
    startsWith(command.bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  const isDocx =
    lowerName.endsWith(".docx") &&
    command.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    startsWith(command.bytes, [0x50, 0x4b, 0x03, 0x04]);

  if (!isPdf && !isDocx) {
    throw new CareerEvidenceError(
      "INVALID_FILE",
      "Upload a valid text-based PDF or DOCX file.",
    );
  }

  return {
    fileName: command.fileName,
    mimeType: command.mimeType,
    size: command.bytes.byteLength,
    bytes: command.bytes,
    format: isPdf ? "pdf" : ("docx" as CvFormat),
  };
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function normalizeExtractedText(rawText: string): string {
  const normalized = rawText
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length < 20) {
    throw new CareerEvidenceError(
      "TEXT_EXTRACTION_FAILED",
      "No usable text was found. Upload a text-based PDF or DOCX.",
    );
  }

  if (normalized.length > MAX_EXTRACTED_CHARACTERS) {
    throw new CareerEvidenceError(
      "TEXT_EXTRACTION_FAILED",
      "The extracted CV text is too long to process.",
    );
  }

  return normalized;
}

function removeUnsupportedEvidence(
  extracted: Awaited<ReturnType<EvidenceExtractor["extract"]>>,
  sourceText: string,
): Awaited<ReturnType<EvidenceExtractor["extract"]>> {
  const normalizedSource = normalizeForComparison(sourceText);
  const omissionWarnings: string[] = [];
  const supported = (value: string | null): boolean =>
    value === null ||
    normalizedSource.includes(normalizeForComparison(value));
  const keepSupported = (
    values: string[],
    section: string,
    field: string,
  ): string[] =>
    values.filter((value) => {
      const keep = supported(value);
      if (!keep) {
        omissionWarnings.push(
          `${section}: left out ${field} “${summarizeValue(value)}” because that wording could not be matched to the CV text; the rest of the entry was kept.`,
        );
      }
      return keep;
    });
  const optionalSupported = (
    value: string | null,
    section: string,
    field: string,
  ): string | null => {
    if (supported(value)) {
      return value;
    }
    omissionWarnings.push(
      `${section}: left ${field} blank because “${summarizeValue(value!)}” could not be matched to the CV text; the rest of the entry was kept.`,
    );
    return null;
  };

  const profileLabels: Partial<Record<keyof typeof extracted.profile, string>> = {
    full_name: "full name",
    email: "email",
    phone: "phone number",
    location: "location",
    summary: "summary",
    linkedin_url: "LinkedIn URL",
    github_url: "GitHub URL",
    portfolio_url: "portfolio URL",
  };
  const profile = Object.fromEntries(
    Object.entries(extracted.profile).map(([key, value]) => [
      key,
      optionalSupported(
        value,
        "Profile",
        profileLabels[key as keyof typeof extracted.profile] ?? key,
      ),
    ]),
  ) as typeof extracted.profile;
  const supportedQuote = (
    sourceQuote: string,
    section: string,
  ): string => {
    const keep = supported(sourceQuote);
    if (!keep) {
      omissionWarnings.push(
        `${section}: the supporting passage “${summarizeValue(sourceQuote)}” could not be matched exactly, so each available field was checked separately.`,
      );
    }
    return keep ? sourceQuote : "";
  };
  const supportedDate = (
    value: string | null,
    sourceQuote: string,
    section: string,
    field: string,
  ): string | null => {
    if (value === null) {
      return null;
    }

    const normalizedDate = normalizeExtractedDate(value);
    if (
      normalizedDate !== null &&
      dateAppearsInSourceQuote(normalizedDate, sourceQuote)
    ) {
      return value;
    }

    omissionWarnings.push(
      `${section}: left ${field} blank because “${summarizeValue(value)}” does not appear in this entry's supporting CV text; the rest of the entry was kept.`,
    );
    return null;
  };
  const keepPartialEntry = (
    hasSupportedData: boolean,
    section: string,
  ): boolean => {
    if (!hasSupportedData) {
      omissionWarnings.push(
        `${section}: omitted the entry because none of its fields could be matched to the CV text.`,
      );
    }
    return hasSupportedData;
  };

  const workExperience = extracted.work_experience.map((item) => {
      const section = `Work experience “${entryLabel(item.role, item.employer)}”`;
      return {
        ...item,
        source_quote: supportedQuote(item.source_quote, section),
        employer: optionalSupported(item.employer, section, "employer"),
        role: optionalSupported(item.role, section, "role"),
        location: optionalSupported(item.location, section, "location"),
        start_date: supportedDate(
          item.start_date,
          item.source_quote,
          section,
          "start date",
        ),
        end_date: supportedDate(
          item.end_date,
          item.source_quote,
          section,
          "end date",
        ),
        bullets: keepSupported(item.bullets, section, "bullet"),
      };
    })
    .filter((item) =>
      keepPartialEntry(
        Boolean(
          item.employer ||
            item.role ||
            item.location ||
            item.bullets.length,
        ),
        `Work experience “${entryLabel(item.role, item.employer)}”`,
      ),
    );
  const education = extracted.education.map((item) => {
      const section = `Education “${entryLabel(item.qualification, item.institution)}”`;
      return {
        ...item,
        source_quote: supportedQuote(item.source_quote, section),
        institution: optionalSupported(
          item.institution,
          section,
          "institution",
        ),
        qualification: optionalSupported(
          item.qualification,
          section,
          "qualification",
        ),
        field_of_study: optionalSupported(
          item.field_of_study,
          section,
          "field of study",
        ),
        start_date: supportedDate(
          item.start_date,
          item.source_quote,
          section,
          "start date",
        ),
        end_date: supportedDate(
          item.end_date,
          item.source_quote,
          section,
          "end date",
        ),
      };
    })
    .filter((item) =>
      keepPartialEntry(
        Boolean(item.institution || item.qualification || item.field_of_study),
        `Education “${entryLabel(item.qualification, item.institution)}”`,
      ),
    );
  const skills = extracted.skills.map((item) => {
    const section = `Skill “${entryLabel(item.name)}”`;
    return {
      ...item,
      source_quote: supportedQuote(item.source_quote, section),
      name: optionalSupported(item.name, section, "skill name"),
    };
  }).filter((item) =>
    keepPartialEntry(Boolean(item.name), `Skill “${entryLabel(item.name)}”`),
  );
  const projects = extracted.projects.map((item) => {
      const section = `Project “${entryLabel(item.name)}”`;
      return {
        ...item,
        source_quote: supportedQuote(item.source_quote, section),
        name: optionalSupported(item.name, section, "project name"),
        role: optionalSupported(item.role, section, "role"),
        start_date: supportedDate(
          item.start_date,
          item.source_quote,
          section,
          "start date",
        ),
        end_date: supportedDate(
          item.end_date,
          item.source_quote,
          section,
          "end date",
        ),
        bullets: keepSupported(item.bullets, section, "bullet"),
        technologies: keepSupported(
          item.technologies,
          section,
          "technology",
        ),
      };
    })
    .filter((item) =>
      keepPartialEntry(
        Boolean(
          item.name ||
            item.role ||
            item.bullets.length ||
            item.technologies.length,
        ),
        `Project “${entryLabel(item.name)}”`,
      ),
    );
  const certifications = extracted.certifications.map((item) => {
    const section = `Certification “${entryLabel(item.name)}”`;
    return {
      ...item,
      source_quote: supportedQuote(item.source_quote, section),
      name: optionalSupported(item.name, section, "certification name"),
      issuer: optionalSupported(item.issuer, section, "issuer"),
      issued_date: supportedDate(
        item.issued_date,
        item.source_quote,
        section,
        "issued date",
      ),
    };
  }).filter((item) =>
    keepPartialEntry(
      Boolean(item.name || item.issuer),
      `Certification “${entryLabel(item.name)}”`,
    ),
  );

  return {
    profile,
    work_experience: workExperience,
    education,
    skills,
    projects,
    certifications,
    achievements: (extracted.achievements ?? [])
      .map((item) => {
        const section = `Achievement “${entryLabel(item.name)}”`;
        return {
          ...item,
          name: optionalSupported(item.name, section, "name"),
          result: optionalSupported(item.result, section, "result"),
          issuer: optionalSupported(item.issuer, section, "issuer"),
          date: supportedDate(
            item.date,
            item.source_quote,
            section,
            "date",
          ),
          source_quote: supportedQuote(item.source_quote, section),
        };
      })
      .filter((item) =>
        keepPartialEntry(
          Boolean(item.name || item.result),
          `Achievement “${entryLabel(item.name)}”`,
        ),
      ),
    references: (extracted.references ?? [])
      .map((item) => {
        const section = `Reference “${entryLabel(item.name)}”`;
        return {
          ...item,
          name: optionalSupported(item.name, section, "name"),
          title: optionalSupported(item.title, section, "title"),
          organization: optionalSupported(
            item.organization,
            section,
            "organization",
          ),
          email: optionalSupported(item.email, section, "email"),
          phone: optionalSupported(item.phone, section, "phone"),
          source_quote: supportedQuote(item.source_quote, section),
        };
      })
      .filter((item) =>
        keepPartialEntry(
          Boolean(item.name),
          `Reference “${entryLabel(item.name)}”`,
        ),
      ),
    warnings: [...extracted.warnings, ...omissionWarnings],
  };
}

function entryLabel(...values: Array<string | null>): string {
  const value = values.find((candidate) => candidate?.trim()) ?? "unnamed entry";
  return summarizeValue(value);
}

function summarizeValue(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 90
    ? `${normalized.slice(0, 87).trimEnd()}…`
    : normalized;
}

function normalizeForComparison(value: string): string {
  return value
    .replace(/-\s+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function dateAppearsInSourceQuote(
  normalizedDate: string,
  sourceQuote: string,
): boolean {
  const [year, month] = normalizedDate.split("-");
  if (!month) {
    return new RegExp(`\\b${year}\\b`, "u").test(sourceQuote);
  }

  const monthPatterns = [
    "jan(?:uary)?",
    "feb(?:ruary)?",
    "mar(?:ch)?",
    "apr(?:il)?",
    "may",
    "jun(?:e)?",
    "jul(?:y)?",
    "aug(?:ust)?",
    "sep(?:t(?:ember)?)?",
    "oct(?:ober)?",
    "nov(?:ember)?",
    "dec(?:ember)?",
  ];
  const monthNumber = String(Number(month));
  const namedMonth = monthPatterns[Number(month) - 1];
  const datePattern = new RegExp(
    `(?:\\b${namedMonth}\\s+${year}\\b|\\b${year}\\s+${namedMonth}\\b|\\b${year}[-/.]0?${monthNumber}\\b|\\b0?${monthNumber}[-/.]${year}\\b)`,
    "iu",
  );

  return datePattern.test(sourceQuote);
}

function toIngestionError(error: unknown): CareerEvidenceError {
  if (error instanceof CareerEvidenceError) {
    return error;
  }

  return new CareerEvidenceError(
    "AI_EXTRACTION_FAILED",
    "We could not extract career evidence. Please try again.",
    { cause: error },
  );
}
