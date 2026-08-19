import { generateText, Output } from "ai";
import { z } from "zod";

import type { GroqKeyPool } from "@/lib/ai/groq-key-pool";
import { dedupeNormalizedJobs } from "../domain/dedupe";
import {
  jobSearchCriteriaSchema,
  workModeSchema,
  employmentTypeSchema,
  experienceLevelSchema,
  type EmploymentType,
  type ExperienceLevel,
  type JobSearchCriteria,
  type JobSearchPreferences,
  type NormalizedExternalJob,
  type WorkMode,
} from "../domain/job";
import { searchHybridSources } from "./hybrid-search";
import type { JobDiscoveryRepository, JobSource } from "./ports";

const naturalSearchIntentSchema = z.object({
  isJobSearch: z.boolean(),
  roles: z.array(z.string().trim().min(1)).max(5).default([]),
  locations: z.array(z.string().trim().min(1)).max(3).default([]),
  workModes: z.array(workModeSchema).default([]),
  employmentTypes: z.array(employmentTypeSchema).default([]),
  experienceLevels: z.array(experienceLevelSchema).default([]),
  keywords: z.array(z.string().trim().min(1)).max(5).default([]),
  company: z.string().trim().nullable().default(null),
});

export type NaturalSearchIntent = z.infer<typeof naturalSearchIntentSchema>;

const JOB_SEARCH_REGEX =
  /(?:find|search|look\s+for|show|get|list|any|give\s+me)\b.*?\b(?:jobs?|roles?|positions?|openings?|vacanc(?:y|ies)|internships?|work|opportunities)\b/iu;

const JOBS_COMMAND_REGEX = /^(?:\/jobs?|jobs?)(?:\s+(.*))?$/iu;

const WHO_IS_HIRING_REGEX =
  /(?:who\s+is\s+hiring|what\s+jobs|job\s+search|hiring\s+for|openings?\s+(?:in|for|at)|jobs?\s+in\s+)/iu;

export function isJobSearchMessage(message: string): boolean {
  const trimmed = message.trim();
  if (JOBS_COMMAND_REGEX.test(trimmed)) return true;
  if (JOB_SEARCH_REGEX.test(trimmed)) return true;
  if (WHO_IS_HIRING_REGEX.test(trimmed)) return true;
  return false;
}

export function extractSearchHeuristics(message: string): NaturalSearchIntent {
  const lower = message.toLowerCase();
  const isJobSearch = isJobSearchMessage(message);

  const workModes: WorkMode[] = [];
  if (lower.includes("remote") || lower.includes("wfh") || lower.includes("work from home")) {
    workModes.push("remote");
  }
  if (lower.includes("hybrid")) {
    workModes.push("hybrid");
  }
  if (lower.includes("onsite") || lower.includes("on-site") || lower.includes("in office")) {
    workModes.push("onsite");
  }

  const experienceLevels: ExperienceLevel[] = [];
  if (lower.includes("junior") || lower.includes("entry") || lower.includes("fresh") || lower.includes("graduate") || lower.includes("associate")) {
    experienceLevels.push("entry");
  }
  if (lower.includes("senior") || lower.includes("sr") || lower.includes("principal")) {
    experienceLevels.push("senior");
  }
  if (lower.includes("lead") || lower.includes("manager") || lower.includes("director")) {
    experienceLevels.push("lead");
  }
  if (lower.includes("mid") || lower.includes("intermediate")) {
    experienceLevels.push("mid");
  }

  const employmentTypes: EmploymentType[] = [];
  if (lower.includes("intern") || lower.includes("internship")) {
    employmentTypes.push("internship");
  }
  if (lower.includes("part time") || lower.includes("part-time")) {
    employmentTypes.push("part_time");
  }
  if (lower.includes("contract") || lower.includes("freelance")) {
    employmentTypes.push("contract");
  }
  if (lower.includes("full time") || lower.includes("full-time")) {
    employmentTypes.push("full_time");
  }

  // Extract common tech roles / keywords
  const commonRoles = [
    "software engineer",
    "frontend developer",
    "frontend engineer",
    "backend developer",
    "backend engineer",
    "full stack developer",
    "full stack engineer",
    "mobile developer",
    "ios developer",
    "android developer",
    "flutter developer",
    "devops engineer",
    "cloud engineer",
    "data engineer",
    "data scientist",
    "machine learning engineer",
    "ai engineer",
    "qa engineer",
    "qa tester",
    "ui/ux designer",
    "product designer",
    "product manager",
    "project manager",
    "scrum master",
    "java developer",
    "python developer",
    "react developer",
    "node developer",
    "dotnet developer",
    ".net developer",
  ];

  const roles: string[] = [];
  for (const role of commonRoles) {
    if (lower.includes(role)) {
      roles.push(role);
    }
  }

  // Common locations
  const commonLocations = [
    "sri lanka",
    "colombo",
    "singapore",
    "united kingdom",
    "uk",
    "london",
    "germany",
    "berlin",
    "united states",
    "us",
    "usa",
    "canada",
    "australia",
    "india",
    "dubai",
    "uae",
    "netherlands",
    "amsterdam",
    "remote",
  ];

  const locations: string[] = [];
  for (const loc of commonLocations) {
    if (loc !== "remote" && lower.includes(loc)) {
      locations.push(loc);
    }
  }

  // Fallback role extraction if /jobs <query> was sent
  const cmdMatch = /^\/jobs?\s+(.+)$/iu.exec(message.trim());
  if (cmdMatch && cmdMatch[1] && roles.length === 0) {
    const rawQuery = cmdMatch[1]
      .replace(/remote|hybrid|onsite|junior|senior|internship|in\s+[a-z\s]+/gi, "")
      .trim();
    if (rawQuery.length >= 2) {
      roles.push(rawQuery);
    }
  }

  return {
    isJobSearch,
    roles: roles.slice(0, 3),
    locations: locations.slice(0, 2),
    workModes,
    employmentTypes,
    experienceLevels,
    keywords: [],
    company: null,
  };
}

export async function parseNaturalJobSearchIntent(
  message: string,
  options?: {
    keyPool?: GroqKeyPool;
    model?: string;
    fallbackPreferences?: Partial<JobSearchPreferences>;
  },
): Promise<NaturalSearchIntent> {
  const heuristics = extractSearchHeuristics(message);

  if (!options?.keyPool || !options.model) {
    return heuristics;
  }

  try {
    const result = await options.keyPool.withKey(
      async (apiKey) => {
        const { output } = await generateText({
          model: options.keyPool!.createModel(apiKey, options.model!),
          temperature: 0.1,
          maxRetries: 0,
          maxOutputTokens: 300,
          output: Output.object({ schema: naturalSearchIntentSchema }),
          system: `You are a job search intent parser. Extract search parameters from the user's natural language message.
If the message is not asking to find or search for jobs, set isJobSearch to false.
Extract:
- roles: Target job titles (e.g. ["React Developer", "Backend Engineer"])
- locations: Target cities/countries (e.g. ["Germany", "Colombo"]). Do NOT put "remote" in locations.
- workModes: ["remote", "hybrid", "onsite"]
- employmentTypes: ["full_time", "part_time", "contract", "internship", "other"]
- experienceLevels: ["entry", "mid", "senior", "lead", "executive"]
- keywords: Technologies, tools, or domain keywords mentioned (e.g. ["Python", "Docker"])
- company: Company name if looking for jobs at a specific organization, or null.`,
          prompt: message,
        });
        return output;
      },
      { rotateOnRateLimit: false, rotateOnToolFailure: false },
    );

    if (result && result.isJobSearch) {
      return {
        isJobSearch: true,
        roles: result.roles.length > 0 ? result.roles : heuristics.roles,
        locations: result.locations.length > 0 ? result.locations : heuristics.locations,
        workModes: result.workModes.length > 0 ? result.workModes : heuristics.workModes,
        employmentTypes: result.employmentTypes.length > 0 ? result.employmentTypes : heuristics.employmentTypes,
        experienceLevels: result.experienceLevels.length > 0 ? result.experienceLevels : heuristics.experienceLevels,
        keywords: result.keywords ?? [],
        company: result.company ?? null,
      };
    }
  } catch {
    // Fall back gracefully to heuristics
  }

  return heuristics;
}

export function buildCriteriaFromIntent(
  intent: NaturalSearchIntent,
  fallbackPreferences?: Partial<JobSearchPreferences>,
  userSkills?: string[],
): JobSearchCriteria {
  let roles = intent.roles.length > 0 ? intent.roles : fallbackPreferences?.roles ?? [];
  if (roles.length === 0 && userSkills && userSkills.length > 0) {
    roles = [`${userSkills[0]} Developer`];
  }
  if (roles.length === 0) {
    roles = ["Software Engineer"];
  }

  const locations =
    intent.locations.length > 0
      ? intent.locations
      : fallbackPreferences?.locations ?? [];

  const workModes =
    intent.workModes.length > 0
      ? intent.workModes
      : fallbackPreferences?.work_modes ?? (locations.length === 0 ? ["remote"] : []);

  const employmentTypes =
    intent.employmentTypes.length > 0
      ? intent.employmentTypes
      : fallbackPreferences?.employment_types ?? [];

  const experienceLevels =
    intent.experienceLevels.length > 0
      ? intent.experienceLevels
      : fallbackPreferences?.experience_levels ?? [];

  return jobSearchCriteriaSchema.parse({
    role_titles: roles.slice(0, 3),
    locations: locations.slice(0, 3),
    work_modes: workModes.slice(0, 3),
    employment_types: employmentTypes.slice(0, 5),
    experience_levels: experienceLevels.slice(0, 5),
    excluded_keywords: fallbackPreferences?.excluded_keywords ?? [],
    page_size: 10,
    cursor: null,
  });
}

export function formatOpportunitiesForChat(input: {
  jobs: NormalizedExternalJob[];
  querySummary: string;
  userSkills?: string[];
}): string {
  if (input.jobs.length === 0) {
    return [
      `I searched for "${input.querySummary}", but didn't find any direct openings right now.`,
      "",
      "Suggestions:",
      "• Try broadening the role title (e.g. 'Software Engineer' or 'Developer')",
      "• Include 'remote' or expand the location",
      "• Send /jobs to review your saved preferences and active campaigns",
    ].join("\n");
  }

  const topJobs = input.jobs.slice(0, 4);
  const formattedItems = topJobs.map((job, index) => {
    const num = index + 1;
    const company = job.organization?.name ? ` — ${job.organization.name}` : "";
    const loc =
      job.location ??
      (job.work_mode === "remote" ? "Remote" : "Location unspecified");
    const mode = job.work_mode
      ? ` • ${job.work_mode.charAt(0).toUpperCase() + job.work_mode.slice(1)}`
      : "";
    const exp = job.experience_level
      ? ` • ${job.experience_level.charAt(0).toUpperCase() + job.experience_level.slice(1)}`
      : "";

    // Find matching skills
    const snippetLower = `${job.title} ${job.description ?? ""}`.toLowerCase();
    const matchedSkills = (input.userSkills ?? []).filter((skill) =>
      snippetLower.includes(skill.toLowerCase()),
    );
    const skillHint =
      matchedSkills.length > 0
        ? `\n   Matches: ${matchedSkills.slice(0, 3).join(", ")}`
        : "";

    const linkUrl = job.application_url ?? job.source_url;
    const link = linkUrl ? `\n   🔗 ${linkUrl}` : "";

    return `${num}. ${job.title}${company}\n   📍 ${loc}${mode}${exp}${skillHint}${link}`;
  });

  return [
    `Found ${topJobs.length} opportunities for ${input.querySummary}:`,
    "",
    formattedItems.join("\n\n"),
    "",
    "Let me know if you'd like me to analyze your fit for any of these, tailor your CV, or prepare a cover letter!",
  ].join("\n");
}

export async function executeNaturalLanguageJobSearch(
  input: {
    userId: string;
    message: string;
    userSkills?: string[];
    userHeadline?: string | null;
  },
  dependencies: {
    sources: JobSource[];
    repository: JobDiscoveryRepository;
    keyPool?: GroqKeyPool;
    model?: string;
  },
): Promise<{
  formattedText: string;
  jobs: NormalizedExternalJob[];
  criteria: JobSearchCriteria;
  querySummary: string;
}> {
  const profile = await dependencies.repository.getSearchProfile(input.userId);
  const fallbackPrefs = profile?.preferences;

  const intent = await parseNaturalJobSearchIntent(input.message, {
    keyPool: dependencies.keyPool,
    model: dependencies.model,
    fallbackPreferences: fallbackPrefs,
  });

  const criteria = buildCriteriaFromIntent(
    intent,
    fallbackPrefs,
    input.userSkills,
  );

  const querySummary = [
    intent.experienceLevels.length > 0 ? intent.experienceLevels.join("/") : null,
    intent.workModes.includes("remote") ? "Remote" : null,
    criteria.role_titles.join(", "),
    criteria.locations.length > 0 ? `in ${criteria.locations.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const outcome = await searchHybridSources(criteria, dependencies.sources);
  const jobs = outcome.jobs;

  // Save discovered jobs to user's discovery repository
  if (jobs.length > 0) {
    await dependencies.repository
      .upsertDiscoveredJobs({
        userId: input.userId,
        source: { key: "chat_search", name: "Chat Search" },
        jobs,
        seenAt: new Date().toISOString(),
      })
      .catch(() => undefined);
  }

  const formattedText = formatOpportunitiesForChat({
    jobs,
    querySummary: querySummary || criteria.role_titles[0] || "Software Engineer",
    userSkills: input.userSkills,
  });

  return {
    formattedText,
    jobs,
    criteria,
    querySummary,
  };
}
