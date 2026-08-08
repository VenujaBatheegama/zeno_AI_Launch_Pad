/**
 * Credit-aware TheirStack live acceptance (manual).
 * Usage:
 *   THEIRSTACK_API_KEY=... node scripts/theirstack-live-acceptance.mjs
 *
 * Makes at most 2 live POST requests with limit=5.
 * Never prints the API key.
 */

const apiKey = process.env.THEIRSTACK_API_KEY;
const baseUrl = (process.env.THEIRSTACK_BASE_URL ?? "https://api.theirstack.com").replace(
  /\/+$/u,
  "",
);

if (!apiKey) {
  console.error("BLOCKED: THEIRSTACK_API_KEY is not set.");
  process.exit(2);
}

async function search(label, body) {
  const response = await fetch(`${baseUrl}/v1/jobs/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const json = await response.json();
  const jobs = Array.isArray(json.data) ? json.data : [];
  const domains = new Set();
  for (const job of jobs) {
    for (const raw of [job.source_url, job.final_url, job.url]) {
      if (typeof raw !== "string") continue;
      try {
        domains.add(new URL(raw).hostname.replace(/^www\./u, ""));
      } catch {
        /* ignore */
      }
    }
  }
  console.log(`\n=== ${label} ===`);
  console.log(`http=${response.status} jobs=${jobs.length}`);
  console.log(
    "sample:",
    jobs.slice(0, 5).map((job) => ({
      id: job.id,
      title: job.job_title,
      company: job.company,
      country: job.country,
      country_code: job.country_code,
      city: job.city ?? job.cities?.[0] ?? null,
      remote: job.remote,
      source_url: job.source_url ?? null,
      final_url: job.final_url ?? job.url ?? null,
      description_chars:
        typeof job.description === "string" ? job.description.length : 0,
    })),
  );
  console.log("domains:", [...domains].sort());
  return { jobs, domains, status: response.status };
}

const software = await search("Test A — Software engineering LK", {
  job_title_or: [
    "Software Engineer",
    "Associate Software Engineer",
    "Junior Software Engineer",
    "Graduate Software Engineer",
    "Software Developer",
  ],
  job_country_code_or: ["LK"],
  posted_at_max_age_days: 30,
  is_closed: false,
  limit: 5,
  page: 0,
});

const devops = await search("Test C — DevOps / Cloud LK", {
  job_title_or: [
    "DevOps Engineer",
    "Cloud Engineer",
    "Platform Engineer",
    "SRE",
  ],
  job_country_code_or: ["LK"],
  posted_at_max_age_days: 30,
  is_closed: false,
  limit: 5,
  page: 0,
});

const total = software.jobs.length + devops.jobs.length;
console.log("\n=== Summary ===");
console.log(`live_requests=2 approximate_jobs_returned=${total}`);
console.log(
  `software_lk_nonzero=${software.jobs.length > 0} devops_lk_nonzero=${devops.jobs.length > 0}`,
);

if (software.status >= 400 || devops.status >= 400) {
  process.exit(1);
}
if (software.jobs.length === 0) {
  process.exit(3);
}
