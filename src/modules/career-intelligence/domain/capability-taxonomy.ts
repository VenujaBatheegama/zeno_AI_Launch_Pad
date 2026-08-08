export type CapabilityKind = "technology" | "domain" | "work_type";

const ALIASES: Record<string, { key: string; label: string; kind: CapabilityKind }> =
  {
    postgres: { key: "postgresql", label: "PostgreSQL", kind: "technology" },
    postgresql: { key: "postgresql", label: "PostgreSQL", kind: "technology" },
    psql: { key: "postgresql", label: "PostgreSQL", kind: "technology" },
    docker: { key: "docker", label: "Docker", kind: "technology" },
    k8s: { key: "kubernetes", label: "Kubernetes", kind: "technology" },
    kubernetes: { key: "kubernetes", label: "Kubernetes", kind: "technology" },
    aws: { key: "aws", label: "AWS", kind: "technology" },
    terraform: { key: "terraform", label: "Terraform", kind: "technology" },
    cicd: { key: "ci_cd", label: "CI/CD", kind: "work_type" },
    "ci/cd": { key: "ci_cd", label: "CI/CD", kind: "work_type" },
    "ci cd": { key: "ci_cd", label: "CI/CD", kind: "work_type" },
    backend: { key: "backend_apis", label: "Backend APIs", kind: "work_type" },
    "backend api": {
      key: "backend_apis",
      label: "Backend APIs",
      kind: "work_type",
    },
    "backend/api": {
      key: "backend_apis",
      label: "Backend APIs",
      kind: "work_type",
    },
    apis: { key: "backend_apis", label: "Backend APIs", kind: "work_type" },
    devops: {
      key: "devops_platform",
      label: "DevOps / platform engineering",
      kind: "domain",
    },
    "devops/platform": {
      key: "devops_platform",
      label: "DevOps / platform engineering",
      kind: "domain",
    },
    cloud: {
      key: "cloud_engineering",
      label: "Cloud engineering",
      kind: "domain",
    },
    frontend: {
      key: "frontend_engineering",
      label: "Frontend engineering",
      kind: "domain",
    },
    react: { key: "react", label: "React", kind: "technology" },
    java: { key: "java", label: "Java", kind: "technology" },
    node: { key: "nodejs", label: "Node.js", kind: "technology" },
    nodejs: { key: "nodejs", label: "Node.js", kind: "technology" },
    "node.js": { key: "nodejs", label: "Node.js", kind: "technology" },
  };

export function normalizeCapabilityLabel(
  raw: string,
  kindHint?: CapabilityKind,
): { key: string; label: string; kind: CapabilityKind } {
  const trimmed = raw.trim();
  const normalized = trimmed.toLocaleLowerCase().replace(/\s+/gu, " ");
  const alias = ALIASES[normalized];
  if (alias) return alias;
  const key = normalized
    .replace(/[^a-z0-9+./# -]/gu, "")
    .replace(/[ ./]+/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^_|_$/gu, "");
  return {
    key: key || "unknown_capability",
    label: trimmed,
    kind: kindHint ?? "technology",
  };
}
