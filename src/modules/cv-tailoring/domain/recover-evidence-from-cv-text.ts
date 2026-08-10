import { createHash } from "node:crypto";

import {
  careerEvidenceSchema,
  type CareerEvidence,
} from "@/modules/career-evidence/domain/evidence";
import {
  mergeReferences,
  recoverReferencesFromCvText,
} from "@/modules/career-evidence/domain/recover-references";

const SECTION_BREAK =
  /\n\s*(?:EXPERIENCE|EDUCATION|PROJECTS?|CERTIFICATES?|CERTIFICATIONS?|SKILLS|ABOUT ME|REFERENCES|ACHIEVEMENTS?|CONTACT|PROGRAMMING LANGUAGES|TECHNICAL SKILLS|SOFT SKILLS)\b/iu;

const CONTAMINATION =
  /\b(programming languages|technical skills|soft skills|linkedin learning|assistant lecturer|references|mark sheet|level cordinator|level coordinator|lecturer\s*\/|@\S+\.\S+)\b/iu;

const PAGE_MARKERS = /(?:^|\s)--?\s*\d+\s*of\s*\d+\s*--?(?:\s|$)/giu;

/**
 * Recover atomic evidence that extraction collapsed, using only the stored CV text.
 * Never invents facts — only promotes sentences/technologies already present in the CV.
 */
export function recoverEvidenceFromCvText(
  evidence: CareerEvidence,
  cvText: string | null | undefined,
): CareerEvidence {
  if (!cvText?.trim()) {
    return enrichFromSourceQuotesOnly(evidence);
  }

  const normalized = cvText.replace(/\r\n/g, "\n");
  const projectNames = evidence.projects.map((project) => project.name);

  let next: CareerEvidence = {
    ...structuredClone(evidence),
    profile: {
      ...evidence.profile,
      ...recoverProfileLinks(evidence.profile, normalized),
    },
    projects: evidence.projects.map((project) =>
      enrichProjectFromCvWindow(project, normalized, projectNames),
    ),
    work_experience: evidence.work_experience.map((work) =>
      enrichWorkFromCvWindow(work, normalized),
    ),
    certifications: evidence.certifications.map((cert) =>
      enrichCertification(cert),
    ),
    education: evidence.education.map((edu) =>
      enrichEducationFromCv(edu, normalized),
    ),
    achievements: mergeAchievements(
      evidence.achievements ?? [],
      recoverAchievementsFromCerts(evidence.certifications),
    ),
  };

  next = {
    ...next,
    skills: ensureSkillsFromEvidence(next, normalized),
    references: mergeReferences(
      next.references ?? [],
      recoverReferencesFromCvText(normalized),
    ),
  };

  return careerEvidenceSchema.parse(next);
}

function enrichFromSourceQuotesOnly(evidence: CareerEvidence): CareerEvidence {
  const next = {
    ...evidence,
    projects: evidence.projects.map((project) =>
      expandBulletsFromSourceQuote(project),
    ),
    certifications: evidence.certifications.map((cert) =>
      enrichCertification(cert),
    ),
    achievements: mergeAchievements(
      evidence.achievements ?? [],
      recoverAchievementsFromCerts(evidence.certifications),
    ),
  };
  return careerEvidenceSchema.parse(next);
}

function recoverProfileLinks(
  profile: CareerEvidence["profile"],
  cvText: string,
): Partial<CareerEvidence["profile"]> {
  return {
    linkedin_url:
      profile.linkedin_url ??
      matchUrl(cvText, /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[^\s)>\]]+/iu),
    github_url:
      profile.github_url ??
      matchUrl(cvText, /(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s)>\]]+/iu),
    portfolio_url: profile.portfolio_url ?? null,
  };
}

function matchUrl(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  if (!match?.[0]) return null;
  const raw = match[0].replace(/[.,;:]+$/u, "");
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

function enrichProjectFromCvWindow(
  project: CareerEvidence["projects"][number],
  cvText: string,
  allProjectNames: string[],
): CareerEvidence["projects"][number] {
  const windowText =
    findItemWindow(cvText, project.name, allProjectNames) ??
    project.source_quote ??
    "";
  const sentences = splitSentences(windowText);
  const existing = new Set(project.bullets.map((bullet) => normalize(bullet)));
  const recovered = sentences.filter((sentence) =>
    isUsableRecoveredBullet(sentence, project.name, existing),
  );

  const bullets = dedupePreserveOrder([...project.bullets, ...recovered]);
  const technologies = dedupePreserveOrder([
    ...project.technologies,
    ...extractTechnologies(windowText),
  ]).filter((tech) => {
    // Keep only techs that appear in this project's window or original list.
    const inWindow = containsTerm(windowText, tech);
    const original = project.technologies.some(
      (item) => normalize(item) === normalize(tech),
    );
    return inWindow || original;
  });

  return {
    ...project,
    bullets,
    technologies,
  };
}

function enrichWorkFromCvWindow(
  work: CareerEvidence["work_experience"][number],
  cvText: string,
): CareerEvidence["work_experience"][number] {
  const windowText =
    findItemWindow(cvText, work.role, []) ??
    findItemWindow(cvText, work.employer, []) ??
    work.source_quote ??
    "";
  const sentences = splitSentences(windowText);
  const existing = new Set(work.bullets.map((bullet) => normalize(bullet)));
  const recovered = sentences.filter((sentence) =>
    isUsableRecoveredBullet(sentence, work.role, existing),
  );
  return {
    ...work,
    bullets: dedupePreserveOrder([...work.bullets, ...recovered]),
  };
}

function expandBulletsFromSourceQuote(
  project: CareerEvidence["projects"][number],
): CareerEvidence["projects"][number] {
  if (!project.source_quote) return project;
  const sentences = splitSentences(project.source_quote);
  const existing = new Set(project.bullets.map((bullet) => normalize(bullet)));
  const recovered = sentences.filter((sentence) =>
    isUsableRecoveredBullet(sentence, project.name, existing),
  );
  return {
    ...project,
    bullets: dedupePreserveOrder([...project.bullets, ...recovered]),
    technologies: dedupePreserveOrder([
      ...project.technologies,
      ...extractTechnologies(project.source_quote),
    ]),
  };
}

function isUsableRecoveredBullet(
  sentence: string,
  title: string,
  existing: Set<string>,
): boolean {
  const trimmed = sentence.trim();
  if (trimmed.length < 40) return false;
  if (looksIncomplete(trimmed)) return false;
  if (existing.has(normalize(trimmed))) return false;
  if (normalize(trimmed).startsWith(normalize(title))) return false;
  if (isMostlyTechnologies(trimmed)) return false;
  if (CONTAMINATION.test(trimmed)) return false;
  if (/@|https?:\/\//iu.test(trimmed)) return false;
  if (PAGE_MARKERS.test(trimmed) || /\b\d+\s+of\s+\d+\b/iu.test(trimmed)) {
    return false;
  }
  // Avoid near-duplicates that only prepend a tech token.
  for (const prior of existing) {
    if (normalize(trimmed).endsWith(prior) && normalize(trimmed).length - prior.length < 20) {
      return false;
    }
  }
  // Avoid title echoes appended to the end of a recovered sentence.
  if (new RegExp(`\\b${escapeRegExp(title)}\\s*$`, "iu").test(trimmed)) {
    return false;
  }
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function looksIncomplete(text: string): boolean {
  if (/[,:;]\s*$/u.test(text)) return true;
  if (/\b(the|a|an|to|for|of|and|or|with|including)\s*$/iu.test(text)) return true;
  return false;
}

function enrichCertification(
  cert: CareerEvidence["certifications"][number],
): CareerEvidence["certifications"][number] {
  const quote = cert.source_quote?.trim();
  if (!quote) return cert;
  if (
    /student expert|fundamentals|certified|certificate/iu.test(quote) &&
    quote.length > cert.name.length &&
    !/haxmas|runners?/iu.test(quote)
  ) {
    const cleaned = quote
      .replace(/\s*\([^)]*linkedin[^)]*\)\s*/iu, "")
      .trim();
    if (cleaned.length >= cert.name.length) {
      return { ...cert, name: cleaned };
    }
  }
  return cert;
}

function recoverAchievementsFromCerts(
  certs: CareerEvidence["certifications"],
): CareerEvidence["achievements"] {
  const out: CareerEvidence["achievements"] = [];
  for (const cert of certs) {
    const blob = `${cert.name} ${cert.issuer ?? ""} ${cert.source_quote ?? ""}`;
    if (!/runners?-?up|winner|finalist|award|hackathon|placed/iu.test(blob)) {
      continue;
    }
    const resultMatch = blob.match(
      /(\d+(?:\s*)?(?:st|nd|rd|th)?\s*runners?-?up|winner|finalist|champion)/iu,
    );
    out.push({
      id: stableUuid(`achievement:${cert.id}`),
      origin: cert.origin,
      source_quote: cert.source_quote,
      name: cert.name.replace(/\s*[:|-].*$/u, "").trim() || cert.name,
      result: cleanResult(resultMatch?.[1] ?? null),
      issuer: cert.issuer,
      date: cert.issued_date,
    });
  }
  return out;
}

function cleanResult(value: string | null): string | null {
  if (!value) return null;
  let cleaned = value.replace(/\s+/gu, " ").trim();
  cleaned = cleaned.replace(/\b2\s*runners?-?up(?:\s*nd)?\b/iu, "2nd Runners-up");
  cleaned = cleaned.replace(/\b2nd\s*runners?-?up\b/iu, "2nd Runners-up");
  return cleaned;
}

function mergeAchievements(
  existing: CareerEvidence["achievements"],
  recovered: CareerEvidence["achievements"],
): CareerEvidence["achievements"] {
  const seen = new Set(existing.map((item) => normalize(item.name)));
  const merged = [...existing];
  for (const item of recovered) {
    if (seen.has(normalize(item.name))) continue;
    seen.add(normalize(item.name));
    merged.push(item);
  }
  return merged;
}

function enrichEducationFromCv(
  education: CareerEvidence["education"][number],
  cvText: string,
): CareerEvidence["education"][number] {
  const windows = [
    education.qualification
      ? findItemWindow(cvText, education.qualification, [])
      : null,
    findItemWindow(cvText, education.institution, []),
    findAllWindows(cvText, education.institution),
  ].flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []));

  const windowText =
    windows.find((window) => /affiliated with/iu.test(window)) ??
    windows.find((window) => /primary modules|optional modules/iu.test(window)) ??
    windows[0] ??
    "";
  if (!windowText) return education;

  let qualification = education.qualification;
  const affiliation = windowText.match(/affiliated with ([^\n.]+)/iu);
  let field = education.field_of_study;
  if (!field && /computer science/iu.test(windowText)) {
    field = "Computer Science";
  }

  const details: string[] = [...(education.details ?? [])];
  if (
    affiliation?.[1] &&
    !details.some((item) => /affiliated with/iu.test(item))
  ) {
    details.unshift(`Affiliated with ${affiliation[1].trim()}`);
  }
  const modules = windowText.match(
    /(?:primary|optional)\s+modules?[^\n.]*(?:\n[^\n]+){0,2}/giu,
  );
  if (modules) {
    for (const module of modules) {
      const cleaned = module.replace(/\s+/gu, " ").trim();
      if (
        cleaned.length >= 20 &&
        !details.some((item) => normalize(item) === normalize(cleaned))
      ) {
        details.push(cleaned);
      }
    }
  }

  return {
    ...education,
    qualification,
    field_of_study: field,
    details,
  };
}

function findAllWindows(cvText: string, needle: string): string[] {
  const trimmed = needle.trim();
  if (!trimmed || trimmed.length < 3) return [];
  const lower = cvText.toLocaleLowerCase();
  const key = trimmed.toLocaleLowerCase();
  const windows: string[] = [];
  let from = 0;
  while (from < cvText.length) {
    const index = lower.indexOf(key, from);
    if (index < 0) break;
    const window = findItemWindow(cvText.slice(index), trimmed, []);
    if (window) windows.push(window);
    from = index + key.length;
  }
  return windows;
}

function ensureSkillsFromEvidence(
  evidence: CareerEvidence,
  cvText?: string,
): CareerEvidence["skills"] {
  const names = new Set(
    evidence.skills.map((skill) => skill.name.toLocaleLowerCase()),
  );
  const extras: CareerEvidence["skills"] = [...evidence.skills];
  const candidates = [
    ...evidence.projects.flatMap((project) => project.technologies),
    ...evidence.work_experience.flatMap((work) =>
      extractTechnologies(work.bullets.join(" ")),
    ),
    ...evidence.projects.flatMap((project) =>
      extractTechnologies(project.bullets.join(" ")),
    ),
    ...(cvText ? extractListedLanguages(cvText) : []),
  ];
  for (const name of candidates) {
    if (names.has(name.toLocaleLowerCase())) continue;
    names.add(name.toLocaleLowerCase());
    extras.push({
      id: stableUuid(`skill:${name}`),
      origin: "extracted",
      source_quote: name,
      name,
    });
  }
  return extras;
}

function extractListedLanguages(cvText: string): string[] {
  const match = cvText.match(/Programming Languages\s*:\s*([^\n]+)/iu);
  if (!match?.[1]) return [];
  return match[1]
    .split(/[,|/]/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 1 && part.length < 24);
}

function findItemWindow(
  cvText: string,
  needle: string,
  otherNames: string[],
): string | null {
  const trimmed = needle.trim();
  if (!trimmed || trimmed.length < 3) return null;
  const index = cvText.toLocaleLowerCase().indexOf(trimmed.toLocaleLowerCase());
  if (index < 0) return null;

  let end = Math.min(cvText.length, index + 900);
  const slice = cvText.slice(index, end);
  const sectionBreak = slice.search(SECTION_BREAK);
  if (sectionBreak > 60) end = index + sectionBreak;

  for (const other of otherNames) {
    if (!other || normalize(other) === normalize(trimmed)) continue;
    const relative = cvText
      .toLocaleLowerCase()
      .indexOf(other.toLocaleLowerCase(), index + trimmed.length);
    if (relative > index && relative < end) end = relative;
  }

  return cvText.slice(index, end);
}

function splitSentences(text: string): string[] {
  return text
    .replace(PAGE_MARKERS, " ")
    .replace(/\s+/gu, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z(])|(?<=\.)\s+(?=It\b|The\b|This\b)/u)
    .map((part) => part.trim().replace(PAGE_MARKERS, "").trim())
    .filter(Boolean);
}

function extractTechnologies(text: string): string[] {
  const known = [
    ".NET Core",
    ".NET Framework",
    ".NET",
    "Entity Framework",
    "SQL Server",
    "MS SQL Server",
    "React",
    "JWT",
    "Excel",
    "Kotlin",
    "Jetpack Compose",
    "Java",
    "Spring Boot",
    "Flutter",
    "Vosk",
    "MongoDB",
    "Flask",
    "Firebase",
    "Room Database",
    "OMDb API",
    "FastReport",
    "Crystal Reports",
    "C#",
    "Python",
    "Dart",
    "REST",
    "RESTful",
  ];
  return known.filter((term) => containsTerm(text, term));
}

function containsTerm(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(^|[^a-z0-9.+#])${escaped}([^a-z0-9.+#]|$)`,
    "iu",
  ).test(haystack);
}

function isMostlyTechnologies(sentence: string): boolean {
  const tokens = sentence.split(/[,|/]/u).map((part) => part.trim());
  return tokens.length >= 2 && tokens.every((token) => token.length < 24);
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

function stableUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
