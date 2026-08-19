export type DeflectionReason = "jailbreak" | "out_of_scope" | "unlinked";

const JAILBREAK_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions|prompts|rules)/iu,
  /disregard\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions|prompts|rules)/iu,
  /bypass\s+(?:safety|system|guardrail|content)\s+(?:filters|rules|prompts)/iu,
  /(?:output|show|reveal|display|print)\s+(?:your\s+)?(?:system\s+prompt|initial\s+prompt|instructions)/iu,
  /\b(?:dan\s+mode|jailbreak|developer\s+mode\s+enabled|unrestricted\s+ai)\b/iu,
  /act\s+as\s+(?:an?\s+)?(?:unfiltered|unrestricted|unaligned)\s+(?:ai|model|assistant)/iu,
];

export function detectAdversarialJailbreak(text: string): boolean {
  if (!text) return false;
  return JAILBREAK_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeUserInput(text: string, maxLength = 1500): string {
  if (!text) return "";
  const cleaned = text.replace(/\r\n/gu, "\n").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}...`;
}

export function getDeflectionMessage(
  reason: DeflectionReason,
  publicBaseUrl?: string,
): string {
  const baseUrl = publicBaseUrl?.replace(/\/+$/u, "") ?? "";
  const url = (path: string) => (baseUrl ? `${baseUrl}${path}` : path);

  switch (reason) {
    case "jailbreak":
      return "I am Zeno, your AI career agent. I can only assist with career development, job searches, campaigns, CV tailoring, and skill growth. How can I help with your career goals today?";
    case "unlinked":
      return `This Telegram chat is not connected to a Zeno account. To get personalized career insights, job campaign alerts, and skill growth recommendations, connect your account in Zeno Settings: ${url("/app/settings")}`;
    case "out_of_scope":
      return "I'm Zeno, your dedicated career agent. I can help with your job search, skill gaps, application readiness, and career growth, but I don't handle requests outside professional development. Let me know if you want to explore new roles, tailor a CV, or build your skills!";
  }
}

const KNOWN_APP_ROUTES = [
  "/app/jobs",
  "/app/recommendations",
  "/app/applications",
  "/app/growth",
  "/app/career-profile",
  "/app/settings",
  "/app/cvs",
  "/app/home",
];

export function formatTelegramAppLinks(
  text: string,
  publicBaseUrl?: string,
): string {
  if (!publicBaseUrl || !text) return text;
  const baseUrl = publicBaseUrl.replace(/\/+$/u, "");
  let formatted = text;

  for (const route of KNOWN_APP_ROUTES) {
    const regex = new RegExp(`(?<!https?://[^\\s]+)(${route}(?:/[a-zA-Z0-9_-]+)*)`, "gu");
    formatted = formatted.replace(regex, `${baseUrl}$1`);
  }

  return formatted;
}
