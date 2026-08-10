import { createHash } from "node:crypto";

import type { CareerEvidence } from "./evidence";
import { careerEvidenceSchema } from "./evidence";

/**
 * Parse a REFERENCES section from raw CV text into referee records.
 * Never invents contact details — only promotes lines already present.
 */
export function recoverReferencesFromCvText(
  cvText: string,
): CareerEvidence["references"] {
  const match = cvText.match(
    /\bREFERENCES?\b([\s\S]*?)(?=\n\s*(?:CERTIFICATES?|CERTIFICATIONS?|ACHIEVEMENTS?|EXPERIENCE|EDUCATION|PROJECTS?|SKILLS|ABOUT ME)\b|$)/iu,
  );
  const block = match?.[1]?.trim();
  if (!block) return [];

  const lines = block
    .split(/\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/(?:^|\s)--?\s*\d+\s*of\s*\d+\s*--?(?:\s|$)/iu.test(line))
    .filter(
      (line) =>
        !/^(programming languages|technical skills|soft skills|frameworks|design tools)\b/iu.test(
          line,
        ),
    );

  const referees: CareerEvidence["references"] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/@/.test(line) && !/,/.test(line)) continue;

    const parts = line
      .split(/\s*[,|]\s*/u)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) continue;

    const name = parts[0]!;
    if (name.split(/\s+/u).length < 2) continue;
    if (
      /^(java|kotlin|react|spring|flutter|developed|developing|online|reel|lucky|spello)\b/iu.test(
        name,
      )
    ) {
      continue;
    }

    const next = lines[index + 1];
    const hasContactNext = Boolean(
      next && (/@/.test(next) || /\+?\d[\d\s()-]{6,}/u.test(next)),
    );
    const hasRoleSignal =
      /\b(lecturer|professor|manager|director|coordinator|cordinator|engineer|supervisor|mentor|teacher|head|doctor|dr\.?)\b/iu.test(
        line,
      );
    if (!hasContactNext && !hasRoleSignal) continue;

    let title: string | null = parts[1] ?? null;
    let organization: string | null = parts[2] ?? null;
    if (
      parts.length === 2 &&
      /\b(institute|university|college|iit|ltd|inc)\b/iu.test(parts[1]!)
    ) {
      organization = parts[1]!;
      title = null;
    }

    let email: string | null = null;
    let phone: string | null = null;
    let contactLine: string | null = null;
    if (hasContactNext && next) {
      contactLine = next;
      for (const part of next.split(/\s*,\s*/u).map((entry) => entry.trim())) {
        if (/@/.test(part) && !email) email = part.replace(/\s+/gu, "");
        else if (/\d{6,}/u.test(part.replace(/\s+/gu, "")) && !phone) {
          phone = part.trim();
        }
      }
      index += 1;
    }

    referees.push({
      id: stableUuid(
        `reference:${normalize(name)}:${email ?? ""}:${phone ?? ""}`,
      ),
      origin: "extracted",
      source_quote: [line, contactLine].filter(Boolean).join(" "),
      name,
      title,
      organization,
      email,
      phone,
    });
  }

  return referees.slice(0, 3);
}

export function mergeReferences(
  existing: CareerEvidence["references"],
  recovered: CareerEvidence["references"],
): CareerEvidence["references"] {
  if (existing.length > 0) return existing;
  return recovered;
}

/** Fill missing references on evidence from stored CV text. */
export function enrichEvidenceWithReferences(
  evidence: CareerEvidence,
  cvText: string | null | undefined,
): CareerEvidence {
  if (!cvText?.trim()) return evidence;
  if ((evidence.references ?? []).length > 0) return evidence;

  const references = recoverReferencesFromCvText(cvText);
  if (references.length === 0) return evidence;

  return careerEvidenceSchema.parse({
    ...evidence,
    references,
  });
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

function stableUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
