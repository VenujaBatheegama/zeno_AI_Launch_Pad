import { z } from "zod";

import type {
  EscoOccupationResolver,
  EscoRoleResolutionCache,
  EscoRoleResolutionCacheStore,
} from "../application/ports";
import {
  normalizeRoleKey,
  normalizeRoleTitle,
  selectSearchTitlesFromEscoHits,
  type EscoOccupationHit,
  type EscoRoleResolution,
} from "../domain/esco-selection";
import {
  ESCO_RESOLVER_VERSION,
  ESCO_SELECTION_POLICY_VERSION,
} from "../domain/policy";

const searchResultSchema = z.object({
  _embedded: z
    .object({
      results: z
        .array(
          z
            .object({
              uri: z.string().min(1).optional(),
              title: z.string().optional(),
              preferredLabel: z
                .union([
                  z.string(),
                  z.record(z.string(), z.string()),
                ])
                .optional(),
              alternativeLabel: z
                .union([
                  z.array(z.string()),
                  z.record(z.string(), z.array(z.string()).optional()),
                ])
                .optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .optional(),
});

const occupationResourceSchema = z
  .object({
    uri: z.string().min(1).optional(),
    title: z.string().optional(),
    preferredLabel: z
      .union([z.string(), z.record(z.string(), z.string())])
      .optional(),
    alternativeLabel: z
      .union([
        z.array(z.string()),
        z.record(z.string(), z.array(z.string()).optional()),
      ])
      .optional(),
  })
  .passthrough();

export type EscoOccupationServiceOptions = {
  baseUrl: string;
  language: string;
  timeoutMs: number;
  maxAlternatives: number;
  cache?: EscoRoleResolutionCacheStore;
  fetchImpl?: typeof fetch;
};

export class EscoOccupationUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EscoOccupationUnavailableError";
  }
}

export class EscoOccupationService implements EscoOccupationResolver {
  private readonly memory = new Map<string, EscoRoleResolution>();

  constructor(private readonly options: EscoOccupationServiceOptions) {}

  async resolveRole(role: string): Promise<EscoRoleResolution> {
    const originalRole = normalizeRoleTitle(role);
    const cacheKey = this.cacheKey(originalRole);
    const cachedMemory = this.memory.get(cacheKey);
    if (cachedMemory) return cachedMemory;

    const fromDb = await this.options.cache?.getResolution({
      normalizedRole: normalizeRoleKey(originalRole),
      language: this.options.language,
      resolverVersion: ESCO_RESOLVER_VERSION,
      selectionPolicyVersion: ESCO_SELECTION_POLICY_VERSION,
    });
    if (fromDb) {
      const mapped = cacheRowToResolution(originalRole, fromDb);
      this.memory.set(cacheKey, mapped);
      return mapped;
    }

    let resolution: EscoRoleResolution;
    try {
      resolution = await this.resolveFromApi(originalRole);
    } catch (error) {
      resolution = {
        originalRole,
        searchTitles: [originalRole],
        status: "unresolved",
        notice:
          error instanceof EscoOccupationUnavailableError
            ? error.message
            : `ESCO was unavailable for “${originalRole}”; searching the exact title only.`,
      };
    }

    this.memory.set(cacheKey, resolution);
    await this.options.cache
      ?.saveResolution({
        normalizedRole: normalizeRoleKey(originalRole),
        language: this.options.language,
        occupationId: resolution.occupationId ?? null,
        preferredTitle: resolution.preferredTitle ?? null,
        selectedSearchTitles: resolution.searchTitles,
        status: resolution.status,
        resolverVersion: ESCO_RESOLVER_VERSION,
        selectionPolicyVersion: ESCO_SELECTION_POLICY_VERSION,
        resolvedAt: new Date().toISOString(),
      })
      .catch(() => {
        // Cache write failures must not block search.
      });

    return resolution;
  }

  private async resolveFromApi(originalRole: string): Promise<EscoRoleResolution> {
    const hits = await this.searchOccupations(originalRole);
    if (hits.length === 0) {
      return selectSearchTitlesFromEscoHits({
        originalRole,
        hits: [],
        maxAlternatives: this.options.maxAlternatives,
      });
    }

    const enriched = [...hits];
    const top = enriched[0]!;
    if (
      (!top.alternativeLabels || top.alternativeLabels.length === 0) &&
      top.uri
    ) {
      const detail = await this.fetchOccupation(top.uri).catch(() => null);
      if (detail) {
        enriched[0] = detail;
      }
    }

    return selectSearchTitlesFromEscoHits({
      originalRole,
      hits: enriched,
      maxAlternatives: this.options.maxAlternatives,
    });
  }

  private async searchOccupations(text: string): Promise<EscoOccupationHit[]> {
    const url = new URL("search", ensureTrailingSlash(this.options.baseUrl));
    url.searchParams.set("text", text);
    url.searchParams.set("type", "occupation");
    url.searchParams.set("language", this.options.language);
    url.searchParams.set("limit", "5");

    const payload = await this.fetchJson(url, searchResultSchema);
    const results = payload._embedded?.results ?? [];
    return results.flatMap((row) => {
      const title = pickLabel(row.preferredLabel, this.options.language) ?? row.title;
      const uri = row.uri;
      if (!title || !uri) return [];
      return [
        {
          uri,
          title: normalizeRoleTitle(title),
          alternativeLabels: pickAlternativeLabels(
            row.alternativeLabel,
            this.options.language,
          ),
        },
      ];
    });
  }

  private async fetchOccupation(uri: string): Promise<EscoOccupationHit | null> {
    const url = new URL(
      "resource/occupation",
      ensureTrailingSlash(this.options.baseUrl),
    );
    url.searchParams.set("uri", uri);
    url.searchParams.set("language", this.options.language);
    const payload = await this.fetchJson(url, occupationResourceSchema);
    const title =
      pickLabel(payload.preferredLabel, this.options.language) ?? payload.title;
    if (!title) return null;
    return {
      uri: payload.uri ?? uri,
      title: normalizeRoleTitle(title),
      alternativeLabels: pickAlternativeLabels(
        payload.alternativeLabel,
        this.options.language,
      ),
    };
  }

  private async fetchJson<T>(
    url: URL,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
        if (!response.ok) {
          throw new EscoOccupationUnavailableError(
            `ESCO request failed with status ${response.status}.`,
          );
        }
        const json: unknown = await response.json();
        return schema.parse(json);
      } catch (error) {
        lastError = error;
        const retryable =
          attempt === 0 &&
          (error instanceof TypeError ||
            (error instanceof Error &&
              /timeout|network|fetch|ECONNRESET|AbortError/i.test(error.message)));
        if (!retryable) break;
      }
    }
    throw new EscoOccupationUnavailableError(
      "ESCO occupation lookup failed; searching exact role titles only.",
      { cause: lastError },
    );
  }

  private cacheKey(role: string): string {
    return [
      normalizeRoleKey(role),
      this.options.language,
      ESCO_RESOLVER_VERSION,
      ESCO_SELECTION_POLICY_VERSION,
    ].join("|");
  }
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function pickLabel(
  value: string | Record<string, string> | undefined,
  language: string,
): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value[language] ?? value.en ?? Object.values(value)[0];
}

function pickAlternativeLabels(
  value:
    | string[]
    | Record<string, string[] | undefined>
    | undefined,
  language: string,
): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(normalizeRoleTitle).filter(Boolean);
  }
  const list = value[language] ?? value.en ?? [];
  return (list ?? []).map(normalizeRoleTitle).filter(Boolean);
}

function cacheRowToResolution(
  originalRole: string,
  row: EscoRoleResolutionCache,
): EscoRoleResolution {
  return {
    originalRole,
    occupationId: row.occupationId ?? undefined,
    preferredTitle: row.preferredTitle ?? undefined,
    searchTitles:
      row.selectedSearchTitles.length > 0
        ? row.selectedSearchTitles
        : [originalRole],
    status: row.status,
  };
}
