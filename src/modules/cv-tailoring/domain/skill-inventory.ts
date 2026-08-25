import { normalizeCapabilityLabel } from "@/modules/career-intelligence/domain/capability-taxonomy";

import type { EvidenceSnapshot } from "./facts";

/** Labels that must never appear as skill values. */
export const SKILL_CATEGORY_LABELS = new Set(
  [
    "programming languages",
    "languages",
    "backend",
    "frontend & mobile",
    "frontend and mobile",
    "databases & persistence",
    "databases and persistence",
    "databases",
    "cloud, devops & infrastructure",
    "cloud, devops and infrastructure",
    "cloud",
    "devops",
    "tools & technologies",
    "tools and technologies",
    "tools",
    "tools and platforms",
    "tools & platforms",
    "platforms",
    "frameworks",
    "libraries",
    "frameworks & libraries",
    "design tools",
    "design",
    "soft skills",
    "testing",
    "other",
    "skills",
    "technical skills",
    "technologies",
    "apis / web technologies",
    "apis",
    "web technologies",
  ].map((value) => value.toLocaleLowerCase()),
);

const DEFAULT_CATEGORIES = [
  "Languages",
  "Backend",
  "Frontend & Mobile",
  "Databases & Persistence",
  "Cloud, DevOps & Infrastructure",
  "Tools & Technologies",
  "Other",
] as const;

const CATEGORY_HINTS: Array<{ category: string; match: RegExp }> = [
  {
    category: "Languages",
    match:
      /^(java|javascript|typescript|python|kotlin|c#|csharp|c\+\+|go|rust|php|ruby|swift|dart|scala|sql|html|css)$/iu,
  },
  {
    category: "Backend",
    match:
      /^(\.?net(?:\s*core)?|asp\.?net|entity\s*framework|ef\s*core|spring(?:\s*boot)?|django|flask|fastapi|express(?:\.?js)?|node\.?js|nestjs|graphql|rest|restful|jwt|oauth|rbac|openapi|swagger|http|websocket)$/iu,
  },
  {
    category: "Frontend & Mobile",
    match:
      /^(react(?:\s*native)?|next\.?js|vue(?:\.?js)?|angular|svelte|flutter|jetpack\s*compose|compose|swiftui|android|ios)$/iu,
  },
  {
    category: "Databases & Persistence",
    match:
      /^(postgresql|postgres|mysql|mongodb|redis|sqlite|firestore|sql\s*server|mssql|dynamodb|prisma|hibernate)$/iu,
  },
  {
    category: "Cloud, DevOps & Infrastructure",
    match:
      /^(docker|kubernetes|k8s|linux|aws|azure|gcp|google\s*cloud|firebase|jenkins|github\s*actions|gitlab\s*ci|ci\/cd|ci|cd|terraform|nginx|vercel|netlify)$/iu,
  },
  {
    category: "Tools & Technologies",
    match:
      /^(git|vosk|figma|excel|postman|jira|confluence|vscode|visual\s*studio)$/iu,
  },
];

export type SkillInventory = {
  /** Approved display spellings of concrete skills/technologies. */
  displayNames: string[];
  /** Normalized keys for matching. */
  keys: Set<string>;
  /** Map key → preferred display spelling. */
  displayByKey: Map<string, string>;
};

export function buildSkillInventory(snapshot: EvidenceSnapshot): SkillInventory {
  const displayByKey = new Map<string, string>();

  const add = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.includes(":") || trimmed.includes(".")) return;
    const words = trimmed.split(/\s+/);
    if (words.length > 4) return;
    if (words.length > 2 && /^(with|and|for|in|on|at|by|to)$/i.test(words[1] || "")) return;
    if (/^(worked|developed|built|created|designed|managed|led|implemented|deployed|live)\s/i.test(trimmed)) return;
    if (isSkillCategoryLabel(trimmed)) return;
    if (isSoftSkillLabel(trimmed)) return;
    const { key, label } = normalizeCapabilityLabel(trimmed);
    if (!key || key.length < 2) return;
    if (!displayByKey.has(key)) displayByKey.set(key, label || trimmed);
  };

  for (const item of snapshot.items) {
    if (item.type === "skill") add(item.name);
    if (item.type === "project") {
      for (const tech of item.technologies) add(tech);
    }
    if (item.type === "work" || item.type === "project") {
      for (const bullet of item.bullets) {
        for (const token of extractLikelyTechTokens(bullet)) add(token);
      }
    }
  }

  for (const fact of snapshot.facts) {
    if (fact.kind === "skill" || fact.kind === "technology") add(fact.text);
  }

  const displayNames = [...displayByKey.values()].sort((a, b) =>
    a.localeCompare(b),
  );
  return {
    displayNames,
    keys: new Set(displayByKey.keys()),
    displayByKey,
  };
}

export function isSkillCategoryLabel(value: string): boolean {
  return SKILL_CATEGORY_LABELS.has(value.trim().toLocaleLowerCase());
}

const SOFT_SKILL_LABELS =
  /^(adaptability|leadership(\s+capability)?|creative(\s+and\s+analytical)?\s+thinking|teamwork|communication|problem[\s-]?solving|time\s+management|critical\s+thinking|collaboration)$/iu;

export function isSoftSkillLabel(value: string): boolean {
  return SOFT_SKILL_LABELS.test(value.trim());
}

export function resolveSkillDisplay(
  raw: string,
  inventory: SkillInventory,
): string | null {
  if (isSkillCategoryLabel(raw)) return null;
  const { key } = normalizeCapabilityLabel(raw);
  return inventory.displayByKey.get(key) ?? null;
}

export function groupSkillsDeterministically(
  selectedNames: string[],
  inventory: SkillInventory,
): Array<{ category: string; items: string[] }> {
  const buckets = new Map<string, string[]>();
  for (const category of DEFAULT_CATEGORIES) buckets.set(category, []);

  for (const name of selectedNames) {
    const display = resolveSkillDisplay(name, inventory);
    if (!display) continue;
    const clamped = clampSkillItem(display);
    if (!clamped) continue;
    const category =
      CATEGORY_HINTS.find((hint) => hint.match.test(display))?.category ??
      "Other";
    const list = buckets.get(category) ?? [];
    if (
      !list.some(
        (item) => item.toLocaleLowerCase() === clamped.toLocaleLowerCase(),
      )
    ) {
      list.push(clamped);
      buckets.set(category, list);
    }
  }

  return [...buckets.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([category, items]) => ({ category, items }));
}

/** Resume schema caps each skill label at 60 chars. */
export const MAX_RESUME_SKILL_ITEM_CHARS = 60;

export function clampSkillItem(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (trimmed.length <= MAX_RESUME_SKILL_ITEM_CHARS) return trimmed;
  return trimmed.slice(0, MAX_RESUME_SKILL_ITEM_CHARS).trimEnd();
}

function extractLikelyTechTokens(text: string): string[] {
  const known = [
    "Java",
    "JavaScript",
    "TypeScript",
    "Python",
    "Kotlin",
    "C#",
    "React",
    "Next.js",
    "Node.js",
    "Spring",
    "Django",
    "Flask",
    "Flutter",
    "Docker",
    "Kubernetes",
    "AWS",
    "Azure",
    "GCP",
    "PostgreSQL",
    "MySQL",
    "MongoDB",
    "Redis",
    "SQL Server",
    "Git",
    "Linux",
    "Firebase",
    "Jetpack Compose",
    ".NET",
    ".NET Core",
    "Entity Framework",
    "JWT",
    "RBAC",
    "REST",
    "Excel",
    "Postman",
  ];
  return known.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(
      `(^|[^a-z0-9.+#])${escaped}([^a-z0-9.+#]|$)`,
      "iu",
    ).test(text);
  });
}
