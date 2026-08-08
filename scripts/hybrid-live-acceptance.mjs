/**
 * Bounded live Sri Lanka acceptance for hybrid job search.
 * Loads .env.local; never prints secrets.
 *
 * Usage: node scripts/hybrid-live-acceptance.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const JOB_SOURCES = (process.env.JOB_SOURCES ?? "jsearch,theirstack,itpro")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function searchJSearch(roleTitles) {
  const key = process.env.JSEARCH_API_KEY ?? process.env.RAPIDAPI_KEY;
  if (!key) return { status: "disabled", count: 0, jobs: [] };
  // Mirror server config: RapidAPI host wins when RAPIDAPI_KEY is used without JSEARCH_API_KEY.
  const host = process.env.JSEARCH_API_HOST;
  const base = process.env.JSEARCH_API_KEY
    ? (process.env.JSEARCH_BASE_URL ?? "https://api.openwebninja.com/jsearch")
    : host
      ? host.startsWith("http")
        ? host
        : `https://${host}`
      : "https://jsearch.p.rapidapi.com";
  // Match app adapter: /search-v2 + location in query; avoid country=colombo.
  const query = `${roleTitles[0]} in Sri Lanka`;
  const url = new URL(`${base.replace(/\/+$/u, "")}/search-v2`);
  url.searchParams.set("query", query);
  url.searchParams.set("num_pages", "1");
  url.searchParams.set("date_posted", "month");
  url.searchParams.set("country", "lk");
  url.searchParams.set("language", "en");
  const hostname = new URL(base.startsWith("http") ? base : `https://${base}`).hostname;
  const headers = hostname.includes("rapidapi.com")
    ? {
        "x-rapidapi-key": key,
        "x-rapidapi-host": hostname,
      }
    : { "x-api-key": key };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return { status: "error", count: 0, jobs: [], http: res.status };
    const body = await res.json();
    const data = Array.isArray(body?.data) ? body.data : [];
    const jobs = data.map((j) => ({
      provider: "jsearch",
      externalId: String(j.job_id ?? ""),
      title: j.job_title ?? "",
      company: j.employer_name ?? "",
      location: [j.job_city, j.job_country].filter(Boolean).join(", "),
      applyUrl: j.job_apply_link ?? j.job_google_link ?? null,
      description: (j.job_description ?? "").slice(0, 120),
    }));
    return { status: jobs.length ? "success" : "empty", count: jobs.length, jobs };
  } catch (error) {
    return { status: "error", count: 0, jobs: [], message: error?.name ?? "error" };
  } finally {
    clearTimeout(timer);
  }
}

async function searchTheirStack(roleTitles) {
  const key = process.env.THEIRSTACK_API_KEY;
  if (!key) return { status: "disabled", count: 0, jobs: [] };
  const base = (process.env.THEIRSTACK_BASE_URL ?? "https://api.theirstack.com").replace(
    /\/+$/u,
    "",
  );
  const pageSize = Number(process.env.THEIRSTACK_PAGE_SIZE ?? 5);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${base}/v1/jobs/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        page: 0,
        limit: pageSize,
        job_title_or: roleTitles,
        job_country_code_or: ["LK"],
        posted_at_max_age_days: Number(
          process.env.THEIRSTACK_POSTED_AT_MAX_AGE_DAYS ?? 30,
        ),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { status: "error", count: 0, jobs: [], http: res.status };
    const body = await res.json();
    const data = Array.isArray(body?.data) ? body.data : [];
    const jobs = data.map((j) => ({
      provider: "theirstack",
      externalId: String(j.id ?? ""),
      title: j.job_title ?? j.normalized_title ?? "",
      company: j.company_object?.name ?? j.company ?? "",
      location: j.long_location ?? j.location ?? j.country ?? "",
      applyUrl: j.final_url ?? j.url ?? j.source_url ?? null,
      description: (j.description ?? "").slice(0, 120),
    }));
    return { status: jobs.length ? "success" : "empty", count: jobs.length, jobs };
  } catch (error) {
    return { status: "error", count: 0, jobs: [], message: error?.name ?? "error" };
  } finally {
    clearTimeout(timer);
  }
}

async function searchITPro(roleTitles) {
  const base = (process.env.ITPRO_BASE_URL ?? "https://itpro.lk").replace(/\/+$/u, "");
  const limit = Number(process.env.ITPRO_PAGE_SIZE ?? 20);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${base}/api/v1/jobs`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return { status: "error", count: 0, jobs: [], http: res.status };
    const data = await res.json();
    const normalize = (value) =>
      String(value ?? "")
        .toLowerCase()
        .replace(/\bengineers\b/gu, "engineer")
        .replace(/\bdevelopers\b/gu, "developer")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/gu, " ")
        .trim();
    const needles = roleTitles.map((t) => normalize(t));
    const jobs = (Array.isArray(data) ? data : [])
      .filter((j) => {
        const title = normalize(j.title);
        return needles.some((needle) => title.includes(needle));
      })
      .slice(0, limit)
      .map((j) => ({
        provider: "itpro",
        externalId: String(j.id ?? ""),
        title: j.title ?? "",
        company: j.company ?? "",
        location: "Sri Lanka",
        applyUrl: `${base}/job/${j.id}`,
        description: String(j.summary ?? j.description ?? "").slice(0, 120),
      }));
    return { status: jobs.length ? "success" : "empty", count: jobs.length, jobs };
  } catch (error) {
    return { status: "error", count: 0, jobs: [], message: error?.name ?? "error" };
  } finally {
    clearTimeout(timer);
  }
}

function canonicalizeUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|source$|campaign)/iu.test(key) || key === "si") {
        parsed.searchParams.delete(key);
      }
    }
    const host = parsed.hostname.replace(/^www\./u, "").toLowerCase();
    const path = parsed.pathname.replace(/\/+$/u, "");
    const query = parsed.searchParams.toString();
    return `${parsed.protocol}//${host}${path}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ");
}

function identityKey(job) {
  const apply = canonicalizeUrl(job.applyUrl);
  if (apply) return `url:${apply}`;
  return `ctl|${normalizeText(job.company)}|${normalizeText(job.title)}|${normalizeText(job.location)}`;
}

function dedupe(jobs) {
  const map = new Map();
  for (const job of jobs) {
    const key = identityKey(job);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...job, sources: [job.provider] });
    } else {
      existing.sources = [...new Set([...existing.sources, job.provider])];
    }
  }
  return [...map.values()];
}

async function runCase(label, roleTitles) {
  const enabled = new Set(JOB_SOURCES);
  const providers = {};
  const settled = await Promise.allSettled([
    enabled.has("jsearch")
      ? searchJSearch(roleTitles)
      : Promise.resolve({ status: "disabled", count: 0, jobs: [] }),
    enabled.has("theirstack")
      ? searchTheirStack(roleTitles)
      : Promise.resolve({ status: "disabled", count: 0, jobs: [] }),
    enabled.has("itpro")
      ? searchITPro(roleTitles)
      : Promise.resolve({ status: "disabled", count: 0, jobs: [] }),
  ]);
  const keys = ["jsearch", "theirstack", "itpro"];
  const merged = [];
  settled.forEach((outcome, i) => {
    const key = keys[i];
    if (outcome.status === "rejected") {
      providers[key] = { status: "error", count: 0 };
      return;
    }
    providers[key] = {
      status: outcome.value.status,
      count: outcome.value.count,
      http: outcome.value.http,
    };
    merged.push(...outcome.value.jobs);
  });
  const deduped = dedupe(merged);
  const samples = deduped.slice(0, 5).map((j) => ({
    title: j.title,
    company: j.company,
    location: j.location,
    applyUrl: j.applyUrl ? "present" : "missing",
    description: j.description ? "present" : "missing",
    sources: j.sources,
  }));
  console.log(`\n=== ${label} ===`);
  console.log("roles:", roleTitles.join(" | "));
  console.log("providers:", JSON.stringify(providers));
  console.log("merged:", merged.length);
  console.log("deduped:", deduped.length);
  console.log("samples:", JSON.stringify(samples, null, 2));
  return { providers, merged: merged.length, deduped: deduped.length };
}

const se = await runCase("Software Engineering / Sri Lanka", [
  "Software Engineer",
  "Associate Software Engineer",
  "Junior Software Engineer",
  "Software Developer",
  "Backend Engineer",
]);
const devops = await runCase("DevOps / Cloud / Sri Lanka", [
  "DevOps Engineer",
  "Cloud Engineer",
  "Site Reliability Engineer",
  "Platform Engineer",
]);

console.log("\n=== Summary ===");
console.log(JSON.stringify({ JOB_SOURCES, se, devops }, null, 2));
