/**
 * Groq often returns nearly-complete tool arguments in `failed_generation`
 * when max completion tokens cut the JSON mid-string. Recover what we can.
 */

export function readFailedGeneration(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;

  const direct = asFailedGeneration(record.failed_generation ?? record.failedGeneration);
  if (direct) return direct;

  const data = record.data;
  if (data && typeof data === "object") {
    const nested = (data as { error?: { failed_generation?: unknown } }).error
      ?.failed_generation;
    const fromData = asFailedGeneration(nested);
    if (fromData) return fromData;
  }

  const body = record.responseBody;
  if (typeof body === "string" && body.length > 0) {
    try {
      const parsed = JSON.parse(body) as {
        error?: { failed_generation?: unknown };
      };
      const fromBody = asFailedGeneration(parsed.error?.failed_generation);
      if (fromBody) return fromBody;
    } catch {
      const match = body.match(/"failed_generation"\s*:\s*"((?:\\.|[^"\\])*)"/);
      if (match?.[1]) {
        try {
          return JSON.parse(`"${match[1]}"`) as string;
        } catch {
          return match[1]
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
        }
      }
    }
  }

  const cause = record.cause;
  if (cause && cause !== error) return readFailedGeneration(cause);
  return null;
}

export function parseRecoveredToolArguments(
  failedGeneration: string,
): Record<string, unknown> | null {
  const trimmed = failedGeneration.trim();
  if (!trimmed) return null;

  const candidates = [trimmed, repairTruncatedJson(trimmed)].filter(
    (value): value is string => Boolean(value),
  );

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;

    const record = parsed as Record<string, unknown>;
    if (record.arguments && typeof record.arguments === "object") {
      return record.arguments as Record<string, unknown>;
    }
    if (record.profile || record.work_experience || record.education) {
      return record;
    }
  }

  // Arguments may be embedded without a full wrapper after truncation.
  const argsMatch = trimmed.match(/"arguments"\s*:\s*(\{[\s\S]*)$/);
  if (argsMatch?.[1]) {
    const repaired = repairTruncatedJson(argsMatch[1]);
    const parsed = repaired ? tryParseJson(repaired) : tryParseJson(argsMatch[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }

  return null;
}

/**
 * Drop trailing incomplete collection entries so Zod can accept a partial CV,
 * and ensure all fields conform to schema constraints.
 */
export function salvageEvidencePayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = sanitizeEvidenceInput(raw);
  const next: Record<string, unknown> = { ...sanitized };
  for (const key of [
    "work_experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "achievements",
    "references",
  ] as const) {
    const value = next[key];
    if (!Array.isArray(value)) continue;
    next[key] = value.filter((item) => item && typeof item === "object");
  }
  if (!Array.isArray(next.warnings)) next.warnings = [];
  const warnings = next.warnings as unknown[];
  warnings.push(
    "Some CV sections may be incomplete because the model output was truncated; review the draft carefully.",
  );
  next.warnings = warnings.filter((item) => typeof item === "string");
  return next;
}

export function sanitizeEvidenceInput(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    return {
      profile: {
        full_name: null,
        email: null,
        phone: null,
        location: null,
        summary: null,
      },
      work_experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      achievements: [],
      references: [],
      warnings: [],
    };
  }

  const record = raw as Record<string, unknown>;
  const profileRaw = (record.profile ?? {}) as Record<string, unknown>;
  const profile: Record<string, unknown> = {
    full_name: typeof profileRaw.full_name === "string" ? profileRaw.full_name.trim() || null : null,
    email: typeof profileRaw.email === "string" ? profileRaw.email.trim() || null : null,
    phone: typeof profileRaw.phone === "string" ? profileRaw.phone.trim() || null : null,
    location: typeof profileRaw.location === "string" ? profileRaw.location.trim() || null : null,
    summary: typeof profileRaw.summary === "string" ? profileRaw.summary.trim() || null : null,
  };
  if (typeof profileRaw.linkedin_url === "string") {
    profile.linkedin_url = profileRaw.linkedin_url.trim() || null;
  }
  if (typeof profileRaw.github_url === "string") {
    profile.github_url = profileRaw.github_url.trim() || null;
  }
  if (typeof profileRaw.portfolio_url === "string") {
    profile.portfolio_url = profileRaw.portfolio_url.trim() || null;
  }

  const cleanString = (val: unknown): string | null =>
    typeof val === "string" && val.trim() ? val.trim() : null;

  const cleanBullets = (val: unknown): string[] =>
    Array.isArray(val)
      ? val.map((b) => (typeof b === "string" ? b.trim() : "")).filter(Boolean)
      : [];

  const workExperience = Array.isArray(record.work_experience)
    ? record.work_experience
        .filter((w) => w && typeof w === "object")
        .map((w: Record<string, unknown>) => {
          const role = cleanString(w.role);
          const employer = cleanString(w.employer);
          const sourceQuote = cleanString(w.source_quote) || role || employer || "Work experience";
          return {
            employer,
            role,
            location: cleanString(w.location),
            start_date: cleanString(w.start_date),
            end_date: cleanString(w.end_date),
            is_current: typeof w.is_current === "boolean" ? w.is_current : !w.end_date,
            bullets: cleanBullets(w.bullets),
            source_quote: sourceQuote,
          };
        })
    : [];

  const education = Array.isArray(record.education)
    ? record.education
        .filter((e) => e && typeof e === "object")
        .map((e: Record<string, unknown>) => {
          const institution = cleanString(e.institution);
          const qualification = cleanString(e.qualification);
          const sourceQuote = cleanString(e.source_quote) || qualification || institution || "Education";
          return {
            institution,
            qualification,
            field_of_study: cleanString(e.field_of_study),
            start_date: cleanString(e.start_date),
            end_date: cleanString(e.end_date),
            source_quote: sourceQuote,
          };
        })
    : [];

  const skills = Array.isArray(record.skills)
    ? record.skills
        .filter((s) => s && typeof s === "object")
        .map((s: Record<string, unknown>) => {
          const name = cleanString(s.name);
          const sourceQuote = cleanString(s.source_quote) || name || "Skill";
          return {
            name,
            source_quote: sourceQuote,
          };
        })
    : [];

  const projects = Array.isArray(record.projects)
    ? record.projects
        .filter((p) => p && typeof p === "object")
        .map((p: Record<string, unknown>) => {
          const name = cleanString(p.name);
          const sourceQuote = cleanString(p.source_quote) || name || "Project";
          return {
            name,
            role: cleanString(p.role),
            start_date: cleanString(p.start_date),
            end_date: cleanString(p.end_date),
            bullets: cleanBullets(p.bullets),
            technologies: cleanBullets(p.technologies),
            source_quote: sourceQuote,
          };
        })
    : [];

  const certifications = Array.isArray(record.certifications)
    ? record.certifications
        .filter((c) => c && typeof c === "object")
        .map((c: Record<string, unknown>) => {
          const name = cleanString(c.name);
          const sourceQuote = cleanString(c.source_quote) || name || "Certification";
          return {
            name,
            issuer: cleanString(c.issuer),
            issued_date: cleanString(c.issued_date),
            source_quote: sourceQuote,
          };
        })
    : [];

  const achievements = Array.isArray(record.achievements)
    ? record.achievements
        .filter((a) => a && typeof a === "object")
        .map((a: Record<string, unknown>) => {
          const name = cleanString(a.name);
          const sourceQuote = cleanString(a.source_quote) || name || "Achievement";
          return {
            name,
            result: cleanString(a.result),
            issuer: cleanString(a.issuer),
            date: cleanString(a.date),
            source_quote: sourceQuote,
          };
        })
    : [];

  const references = Array.isArray(record.references)
    ? record.references
        .filter((r) => r && typeof r === "object")
        .map((r: Record<string, unknown>) => {
          const name = cleanString(r.name);
          const sourceQuote = cleanString(r.source_quote) || name || "Reference";
          return {
            name,
            title: cleanString(r.title),
            organization: cleanString(r.organization),
            email: cleanString(r.email),
            phone: cleanString(r.phone),
            source_quote: sourceQuote,
          };
        })
    : [];

  const warnings = Array.isArray(record.warnings)
    ? record.warnings.filter((w): w is string => typeof w === "string")
    : [];

  return {
    profile,
    work_experience: workExperience,
    education,
    skills,
    projects,
    certifications,
    achievements,
    references,
    warnings,
  };
}

function asFailedGeneration(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Close open strings / brackets so truncated tool JSON can parse. */
export function repairTruncatedJson(input: string): string | null {
  let text = input.trim();
  if (!text) return null;

  // If we were cut mid-string, close the quote.
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
  }
  if (inString) {
    // Drop a trailing incomplete escape.
    if (text.endsWith("\\") && !text.endsWith("\\\\")) {
      text = text.slice(0, -1);
    }
    text += '"';
  }

  const stack: string[] = [];
  inString = false;
  escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") stack.push(char);
    if (char === "}" || char === "]") stack.pop();
  }

  // Remove a dangling comma before we close containers.
  text = text.replace(/,\s*$/u, "");

  while (stack.length > 0) {
    const open = stack.pop();
    text += open === "{" ? "}" : "]";
  }

  return tryParseJson(text) ? text : null;
}
