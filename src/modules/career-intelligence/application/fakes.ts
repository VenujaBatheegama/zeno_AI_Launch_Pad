import type { CareerEvidenceSet } from "@/modules/career-evidence/domain/evidence";
import type { CareerEvidenceRepository } from "@/modules/career-evidence/application/ports";
import type {
  JobDiscoveryRepository,
  JobSource,
} from "@/modules/job-discovery/application/ports";
import type {
  DiscoveredJob,
  JobSearchProfile,
  NormalizedExternalJob,
} from "@/modules/job-discovery/domain/job";

import type {
  CachedRequirementExtraction,
  CareerIntelligenceRepository,
  EscoOccupationResolver,
  EscoRoleResolutionCache,
  JobAnalysis,
  JobMatchAnalysis,
  JobRequirementExtractor,
  JobSearchPlan,
  PersistedCareerStageAssessment,
  PlannedJobQuery,
  RequirementMatcher,
} from "./ports";
import type { EscoRoleResolution } from "../domain/esco-selection";
import type { CareerStageAssessment } from "../domain/career-stage";
import type { ExtractedJobAnalysis, RequirementMatch } from "../domain/schemas";

export class InMemoryCareerIntelligenceRepository
  implements CareerIntelligenceRepository
{
  assessments: PersistedCareerStageAssessment[] = [];
  plans: JobSearchPlan[] = [];
  links = new Map<string, Set<string>>();
  analyses = new Map<string, JobAnalysis>();
  matches = new Map<string, JobMatchAnalysis>();
  escoResolutions: EscoRoleResolutionCache[] = [];
  extractions = new Map<string, CachedRequirementExtraction>();

  async saveCareerStageAssessment(input: {
    id: string;
    userId: string;
    evidenceSetId: string;
    assessment: CareerStageAssessment;
    createdAt: string;
  }): Promise<PersistedCareerStageAssessment> {
    const row: PersistedCareerStageAssessment = {
      id: input.id,
      userId: input.userId,
      evidenceSetId: input.evidenceSetId,
      ...input.assessment,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.assessments.unshift(row);
    return row;
  }

  async getLatestCareerStageAssessment(userId: string) {
    return this.assessments.find((item) => item.userId === userId) ?? null;
  }

  async getCareerStageAssessmentById(id: string, userId: string) {
    return (
      this.assessments.find(
        (item) => item.id === id && item.userId === userId,
      ) ?? null
    );
  }

  async saveSearchPlan(input: {
    plan: Omit<JobSearchPlan, "queries">;
    queries: Array<
      Omit<PlannedJobQuery, "searchPlanId" | "createdAt"> & {
        createdAt?: string;
      }
    >;
  }): Promise<JobSearchPlan> {
    const latest = await this.getLatestSearchPlan(input.plan.userId);
    if (
      latest &&
      (latest.preferenceRevision > input.plan.preferenceRevision ||
        latest.planRevision > input.plan.planRevision ||
        (latest.preferenceRevision === input.plan.preferenceRevision &&
          latest.profileRevision > input.plan.profileRevision))
    ) {
      return latest;
    }
    const plan: JobSearchPlan = {
      ...input.plan,
      queries: input.queries.map((query) => ({
        ...query,
        searchPlanId: input.plan.id,
        createdAt: query.createdAt ?? input.plan.createdAt,
      })),
    };
    this.plans.unshift(plan);
    return plan;
  }

  async getLatestSearchPlan(userId: string) {
    return this.plans.find((item) => item.userId === userId) ?? null;
  }

  async getSearchPlanById(id: string, userId: string) {
    return (
      this.plans.find((item) => item.id === id && item.userId === userId) ?? null
    );
  }

  async updateSearchPlanStatus(input: {
    id: string;
    userId: string;
    status: JobSearchPlan["status"];
    updatedAt: string;
  }) {
    const plan = await this.getSearchPlanById(input.id, input.userId);
    if (plan) {
      plan.status = input.status;
      plan.updatedAt = input.updatedAt;
    }
  }

  async updatePlannedQueryStatus(input: {
    id: string;
    searchPlanId: string;
    status: PlannedJobQuery["executionStatus"];
  }) {
    for (const plan of this.plans) {
      if (plan.id !== input.searchPlanId) continue;
      const query = plan.queries.find((item) => item.id === input.id);
      if (query) query.executionStatus = input.status;
    }
  }

  async linkJobToQuery(input: {
    listingId: string;
    plannedQueryId: string;
    discoveredAt: string;
  }) {
    const plan = this.plans.find((item) =>
      item.queries.some((query) => query.id === input.plannedQueryId),
    );
    const query = plan?.queries.find((item) => item.id === input.plannedQueryId);
    if (!query) return;
    const current = this.links.get(input.listingId) ?? new Set();
    current.add(query.queryText);
    this.links.set(input.listingId, current);
  }

  async listQueryProvenance(input: {
    userId: string;
    listingIds: string[];
  }) {
    const map = new Map<string, string[]>();
    for (const listingId of input.listingIds) {
      map.set(listingId, [...(this.links.get(listingId) ?? [])]);
    }
    return map;
  }

  async getJobAnalysisByListing(userId: string, listingId: string) {
    const analysis = this.analyses.get(`${userId}:${listingId}`);
    return analysis ?? null;
  }

  async getRequirementExtraction(input: {
    descriptionHash: string;
    schemaVersion: string;
    extractionPolicyVersion: string;
  }) {
    return (
      this.extractions.get(
        `${input.descriptionHash}:${input.schemaVersion}:${input.extractionPolicyVersion}`,
      ) ?? null
    );
  }

  async saveRequirementExtraction(row: CachedRequirementExtraction) {
    const key = `${row.descriptionHash}:${row.schemaVersion}:${row.extractionPolicyVersion}`;
    this.extractions.set(key, row);
    return row;
  }

  async listJobAnalysesByListingIds(userId: string, listingIds: string[]) {
    const wanted = new Set(listingIds);
    return [...this.analyses.values()].filter(
      (item) => item.userId === userId && wanted.has(item.listingId),
    );
  }

  async saveJobAnalysis(analysis: JobAnalysis) {
    this.analyses.set(`${analysis.userId}:${analysis.listingId}`, analysis);
    return analysis;
  }

  async getMatchAnalysisByListing(userId: string, listingId: string) {
    return this.matches.get(`${userId}:${listingId}`) ?? null;
  }

  async saveMatchAnalysis(analysis: JobMatchAnalysis) {
    this.matches.set(`${analysis.userId}:${analysis.listingId}`, analysis);
    return analysis;
  }

  async listCurrentMatchAnalyses(userId: string) {
    return [...this.matches.values()].filter((item) => item.userId === userId);
  }

  async markMatchAnalysesStale(input: {
    userId: string;
    exceptIds?: string[];
    updatedAt: string;
  }) {
    for (const match of this.matches.values()) {
      if (match.userId !== input.userId) continue;
      if (input.exceptIds?.includes(match.id)) continue;
      match.status = "stale";
      match.updatedAt = input.updatedAt;
    }
  }

  async clearMatchAnalyses(userId: string) {
    let removed = 0;
    for (const [key, match] of this.matches.entries()) {
      if (match.userId !== userId) continue;
      this.matches.delete(key);
      removed += 1;
    }
    return removed;
  }

  async getResolution(input: {
    normalizedRole: string;
    language: string;
    resolverVersion: string;
    selectionPolicyVersion: string;
  }) {
    return (
      this.escoResolutions.find(
        (row) =>
          row.normalizedRole === input.normalizedRole &&
          row.language === input.language &&
          row.resolverVersion === input.resolverVersion &&
          row.selectionPolicyVersion === input.selectionPolicyVersion,
      ) ?? null
    );
  }

  async saveResolution(row: EscoRoleResolutionCache) {
    const index = this.escoResolutions.findIndex(
      (item) =>
        item.normalizedRole === row.normalizedRole &&
        item.language === row.language &&
        item.resolverVersion === row.resolverVersion &&
        item.selectionPolicyVersion === row.selectionPolicyVersion,
    );
    if (index >= 0) this.escoResolutions[index] = row;
    else this.escoResolutions.push(row);
  }
}

/** Exact-role-only ESCO stub for tests (no network). */
export class FakeEscoOccupationResolver implements EscoOccupationResolver {
  constructor(
    private readonly resolveImpl?: (
      role: string,
    ) => Promise<EscoRoleResolution> | EscoRoleResolution,
    private readonly skillImpl?: (
      term: string,
    ) => Promise<{ originalTerm: string; conceptUri?: string; labels: string[] }> | {
      originalTerm: string;
      conceptUri?: string;
      labels: string[];
    },
  ) {}

  async resolveRole(role: string): Promise<EscoRoleResolution> {
    if (this.resolveImpl) return this.resolveImpl(role);
    return {
      originalRole: role,
      searchTitles: [role],
      status: "unresolved",
      notice: `ESCO stub: exact title only for “${role}”.`,
    };
  }

  async resolveSkillLabels(term: string) {
    if (this.skillImpl) return this.skillImpl(term);
    return { originalTerm: term, labels: [term] };
  }
}

export class FakeEvidenceRepository implements CareerEvidenceRepository {
  constructor(public current: CareerEvidenceSet | null) {}
  async createDocument(): Promise<void> {}
  async markDocumentProcessed(): Promise<void> {}
  async markDocumentFailed(): Promise<void> {}
  async createDraft(input: {
    id: string;
    userId: string;
    sourceDocumentId: string;
    evidence: CareerEvidenceSet["evidence"];
    extractionModel: string;
  }): Promise<CareerEvidenceSet> {
    this.current = {
      id: input.id,
      userId: input.userId,
      sourceDocumentId: input.sourceDocumentId,
      status: "draft",
      evidence: input.evidence,
      extractionModel: input.extractionModel,
      createdAt: "2026-08-09T12:00:00.000Z",
      updatedAt: "2026-08-09T12:00:00.000Z",
      verifiedAt: null,
    };
    return this.current;
  }
  async saveDraft(input: {
    id: string;
    userId: string;
    evidence: CareerEvidenceSet["evidence"];
  }): Promise<CareerEvidenceSet> {
    if (!this.current || this.current.id !== input.id) {
      throw new Error("draft not found");
    }
    this.current = {
      ...this.current,
      evidence: input.evidence,
      updatedAt: "2026-08-09T12:00:00.000Z",
    };
    return this.current;
  }
  async verify(): Promise<CareerEvidenceSet> {
    throw new Error("not implemented");
  }
  async getById(): Promise<CareerEvidenceSet | null> {
    return this.current;
  }
  async getCurrent(): Promise<CareerEvidenceSet | null> {
    return this.current;
  }
  async getVerified(): Promise<CareerEvidenceSet | null> {
    return this.current?.status === "verified" ? this.current : null;
  }
  async getDocumentExtractedText(): Promise<string | null> {
    return null;
  }
}

export class FakeJobDiscoveryRepository implements JobDiscoveryRepository {
  constructor(
    public profile: JobSearchProfile | null,
    public jobs: DiscoveredJob[] = [],
  ) {}

  async getSearchProfile() {
    return this.profile;
  }
  async saveSearchProfile(input: {
    id: string;
    userId: string;
    preferences: JobSearchProfile["preferences"];
    preferenceRevision: number;
    updatedAt: string;
  }) {
    this.profile = {
      id: input.id,
      userId: input.userId,
      preferences: input.preferences,
      preferenceRevision: input.preferenceRevision,
      createdAt: this.profile?.createdAt ?? input.updatedAt,
      updatedAt: input.updatedAt,
    };
    return this.profile;
  }
  async upsertDiscoveredJobs(input: {
    userId: string;
    source: { key: string; name: string };
    jobs: NormalizedExternalJob[];
    seenAt: string;
  }) {
    const mapped = input.jobs.map((job, index) => {
      const listingId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      const discovered: DiscoveredJob = {
        job_id: `00000000-0000-4000-8000-${String(index + 101).padStart(12, "0")}`,
        listing_id: listingId,
        title: job.title,
        organization_name: job.organization?.name ?? null,
        organization_logo_url: job.organization?.logo_url ?? null,
        description: job.description,
        location: job.location,
        city: job.city,
        region: job.region,
        country: job.country,
        employment_type: job.employment_type,
        work_mode: job.work_mode,
        experience_level: job.experience_level,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        salary_currency: job.salary_currency,
        salary_period: job.salary_period,
        published_at: job.published_at,
        closing_at: job.closing_at,
        publisher: job.publisher,
        source_name: input.source.name,
        source_url: job.source_url,
        application_url: job.application_url,
        application_is_direct: job.application_is_direct,
        first_seen_at: input.seenAt,
        last_seen_at: input.seenAt,
        user_state: "discovered",
      };
      return discovered;
    });
    this.jobs = [...mapped, ...this.jobs];
    return mapped;
  }
  async listJobs() {
    return this.jobs;
  }
  async countJobs(input: { userId: string; includeDismissed?: boolean }) {
    if (input.includeDismissed) return this.jobs.length;
    return this.jobs.filter((j) => j.user_state !== "dismissed").length;
  }
  async setUserJobState(input: {
    userId: string;
    listingId: string;
    state: DiscoveredJob["user_state"];
    updatedAt: string;
  }) {
    const job = this.jobs.find((item) => item.listing_id === input.listingId);
    if (!job) throw new Error("job not found");
    job.user_state = input.state;
    job.last_seen_at = input.updatedAt;
    return job;
  }
  async clearDiscoveredJobs(input: {
    userId: string;
    includeSaved: boolean;
  }) {
    void input.userId;
    const before = this.jobs.length;
    this.jobs = input.includeSaved
      ? []
      : this.jobs.filter((job) => job.user_state === "saved");
    return before - this.jobs.length;
  }
}

export class FakeJobSource implements JobSource {
  identity = { key: "fake", name: "Fake Source" };
  constructor(
    private readonly responses: Array<{
      jobs: NormalizedExternalJob[];
      fail?: boolean;
    }>,
  ) {}
  private index = 0;
  async search() {
    const response = this.responses[this.index] ?? { jobs: [] };
    this.index += 1;
    if (response.fail) {
      throw new Error("provider failed");
    }
    return {
      jobs: response.jobs,
      nextCursor: null,
      partialFailure: false,
    };
  }
}

export class FakeExtractor implements JobRequirementExtractor {
  constructor(private readonly result: ExtractedJobAnalysis) {}
  async extract() {
    return this.result;
  }
}

export class FakeMatcher implements RequirementMatcher {
  constructor(private readonly matches: RequirementMatch[] = []) {}
  async classify() {
    return this.matches;
  }
}
