import type { NormalizedExternalJob } from "./job";

export type ProvenanceObservation = {
  providerKey: string;
  providerName: string;
  externalId: string;
  sourceUrl: string | null;
  applicationUrl: string | null;
};

/**
 * Cross-provider dedupe for hybrid search.
 * Conservative: prefer canonical apply/source URLs, then company+title+location.
 */
export function dedupeNormalizedJobs(
  jobs: Array<{
    job: NormalizedExternalJob;
    providerKey: string;
    providerName: string;
  }>,
): {
  jobs: NormalizedExternalJob[];
  rawCount: number;
  dedupedCount: number;
} {
  const rawCount = jobs.length;
  const byKey = new Map<
    string,
    {
      job: NormalizedExternalJob;
      observations: ProvenanceObservation[];
    }
  >();

  for (const item of jobs) {
    const key = identityKey(item.job);
    const observation: ProvenanceObservation = {
      providerKey: item.providerKey,
      providerName: item.providerName,
      externalId: item.job.external_id,
      sourceUrl: item.job.source_url,
      applicationUrl: item.job.application_url,
    };
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        job: withProvenance(item.job, [observation]),
        observations: [observation],
      });
      continue;
    }
    existing.observations.push(observation);
    existing.job = withProvenance(
      preferRicherJob(
        existing.job,
        item.job,
        existing.observations[0]?.providerKey,
        item.providerKey,
      ),
      existing.observations,
    );
  }

  const deduped = [...byKey.values()].map((entry) => entry.job);
  return {
    jobs: deduped,
    rawCount,
    dedupedCount: deduped.length,
  };
}

export function canonicalizeJobUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    // Drop common tracking params while keeping identity path.
    for (const key of [...parsed.searchParams.keys()]) {
      if (
        /^(utm_|fbclid|gclid|mc_|ref$|source$|campaign|trackingId|refId|position|pageNum)/iu.test(
          key,
        ) ||
        key === "si"
      ) {
        parsed.searchParams.delete(key);
      }
    }
    const host = parsed.hostname.replace(/^www\./u, "").toLocaleLowerCase();
    const path = parsed.pathname.replace(/\/+$/u, "");

    // LinkedIn job URLs often differ by subdomain/slug but share a numeric posting id.
    const linkedInJobId = path.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)$/u)?.[1];
    if (host.endsWith("linkedin.com") && linkedInJobId) {
      return `https://linkedin.com/jobs/view/${linkedInJobId}`;
    }

    const query = parsed.searchParams.toString();
    return `${parsed.protocol}//${host}${path}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

export function identityKey(job: NormalizedExternalJob): string {
  const apply = canonicalizeJobUrl(job.application_url);
  if (apply) return `url:${apply}`;
  const source = canonicalizeJobUrl(job.source_url);
  if (source) return `url:${source}`;
  return [
    "ctl",
    normalizeText(job.organization?.name),
    normalizeText(job.title),
    normalizeText(job.city ?? job.location ?? job.country),
  ].join("|");
}

function preferRicherJob(
  current: NormalizedExternalJob,
  candidate: NormalizedExternalJob,
  _currentProvider?: string,
  _candidateProvider?: string,
): NormalizedExternalJob {
  // Providers are equal — choose by content richness only, not source brand.
  void _currentProvider;
  void _candidateProvider;
  const currentScore = richness(current);
  const candidateScore = richness(candidate);
  if (candidateScore > currentScore) {
    return {
      ...candidate,
      application_url: candidate.application_url ?? current.application_url,
      source_url: candidate.source_url ?? current.source_url,
      description: candidate.description ?? current.description,
      publisher: candidate.publisher ?? current.publisher,
    };
  }
  return {
    ...current,
    application_url: current.application_url ?? candidate.application_url,
    source_url: current.source_url ?? candidate.source_url,
    description: current.description ?? candidate.description,
    publisher: current.publisher ?? candidate.publisher,
  };
}

function richness(job: NormalizedExternalJob): number {
  return (
    (job.description?.length ?? 0) +
    (job.application_url ? 50 : 0) +
    (job.source_url ? 20 : 0) +
    (job.organization ? 10 : 0) +
    (job.location || job.city || job.country ? 10 : 0)
  );
}

function withProvenance(
  job: NormalizedExternalJob,
  observations: ProvenanceObservation[],
): NormalizedExternalJob {
  return {
    ...job,
    raw_payload: {
      ...job.raw_payload,
      zeno_provenance: observations,
    },
  };
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ");
}
