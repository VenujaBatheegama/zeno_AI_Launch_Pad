import { describe, expect, it, vi } from "vitest";

import type { NormalizedExternalJob } from "../domain/job";
import type { JobDiscoveryRepository, JobSource } from "./ports";
import {
  buildCriteriaFromIntent,
  extractSearchHeuristics,
  formatOpportunitiesForChat,
  isJobSearchMessage,
  executeNaturalLanguageJobSearch,
} from "./natural-language-job-search";

describe("Natural Language Job Search", () => {
  describe("isJobSearchMessage", () => {
    it("detects natural job search queries", () => {
      expect(isJobSearchMessage("find me remote python developer jobs")).toBe(true);
      expect(isJobSearchMessage("search for junior frontend roles in london")).toBe(true);
      expect(isJobSearchMessage("are there any devops openings?")).toBe(true);
      expect(isJobSearchMessage("/jobs flutter")).toBe(true);
      expect(isJobSearchMessage("jobs in sri lanka")).toBe(true);
      expect(isJobSearchMessage("who is hiring react engineers")).toBe(true);
      expect(isJobSearchMessage("give me some new opportunities")).toBe(true);
    });

    it("rejects non-job search queries", () => {
      expect(isJobSearchMessage("hello there")).toBe(false);
      expect(isJobSearchMessage("tailor my cv")).toBe(false);
      expect(isJobSearchMessage("write a cover letter")).toBe(false);
      expect(isJobSearchMessage("what skills should I learn")).toBe(false);
    });
  });

  describe("extractSearchHeuristics", () => {
    it("extracts roles, work modes, and locations from text", () => {
      const intent = extractSearchHeuristics(
        "find junior remote react developer jobs in germany",
      );
      expect(intent.isJobSearch).toBe(true);
      expect(intent.roles).toContain("react developer");
      expect(intent.workModes).toContain("remote");
      expect(intent.locations).toContain("germany");
      expect(intent.experienceLevels).toContain("entry");
    });

    it("handles /jobs command with role query", () => {
      const intent = extractSearchHeuristics("/jobs devops engineer remote");
      expect(intent.isJobSearch).toBe(true);
      expect(intent.roles).toContain("devops engineer");
      expect(intent.workModes).toContain("remote");
    });
  });

  describe("buildCriteriaFromIntent", () => {
    it("builds valid JobSearchCriteria merging fallback preferences", () => {
      const intent = {
        isJobSearch: true,
        roles: ["Frontend Developer"],
        locations: [],
        workModes: ["remote" as const],
        employmentTypes: [],
        experienceLevels: ["mid" as const],
        keywords: [],
        company: null,
      };

      const criteria = buildCriteriaFromIntent(intent, {
        roles: ["Software Engineer"],
        locations: ["Colombo"],
        work_modes: ["remote"],
        employment_types: ["full_time"],
        experience_levels: ["mid"],
        excluded_keywords: [],
        preferred_interests: [],
        excluded_interests: [],
      });

      expect(criteria.role_titles).toEqual(["Frontend Developer"]);
      expect(criteria.locations).toEqual(["Colombo"]);
      expect(criteria.work_modes).toEqual(["remote"]);
      expect(criteria.experience_levels).toEqual(["mid"]);
    });
  });

  describe("formatOpportunitiesForChat", () => {
    const mockJobs: NormalizedExternalJob[] = [
      {
        external_id: "job-1",
        title: "Frontend Engineer (React)",
        organization: {
          name: "TechCorp",
          logo_url: null,
          website_url: null,
        },
        description: "Looking for an engineer with React and TypeScript skills.",
        location: "Remote, Germany",
        city: null,
        region: null,
        country: "Germany",
        work_mode: "remote",
        employment_type: "full_time",
        experience_level: "mid",
        salary_min: null,
        salary_max: null,
        salary_currency: null,
        salary_period: null,
        published_at: new Date().toISOString(),
        closing_at: null,
        publisher: null,
        source_url: "https://example.com/apply/1",
        application_url: "https://example.com/apply/1",
        application_is_direct: true,
        raw_payload: {},
      },
      {
        external_id: "job-2",
        title: "React Developer",
        organization: {
          name: "Innovate AI",
          logo_url: null,
          website_url: null,
        },
        description: "Junior role working with React and Node.js.",
        location: "Berlin, Germany",
        city: "Berlin",
        region: null,
        country: "Germany",
        work_mode: "hybrid",
        employment_type: "full_time",
        experience_level: "entry",
        salary_min: null,
        salary_max: null,
        salary_currency: null,
        salary_period: null,
        published_at: new Date().toISOString(),
        closing_at: null,
        publisher: null,
        source_url: "https://example.com/apply/2",
        application_url: "https://example.com/apply/2",
        application_is_direct: true,
        raw_payload: {},
      },
    ];

    it("formats job opportunities with links, matching skills, and next steps", () => {
      const formatted = formatOpportunitiesForChat({
        jobs: mockJobs,
        querySummary: "Remote React Developer",
        userSkills: ["React", "TypeScript", "Node.js"],
      });

      expect(formatted).toContain("Found **2 opportunities** matching");
      expect(formatted).toContain("1. 🏢 **Frontend Engineer (React)** — TechCorp");
      expect(formatted).toContain("📍 Remote, Germany • Remote • Mid");
      expect(formatted).toContain("💡 *Matches:* React, TypeScript");
      expect(formatted).toContain("[View & Apply](https://example.com/apply/1)");
      expect(formatted).toContain("Want me to tailor your CV or write a cover letter");
    });

    it("returns helpful suggestions when no jobs found", () => {
      const formatted = formatOpportunitiesForChat({
        jobs: [],
        querySummary: "COBOL Developer in Antarctica",
      });

      expect(formatted).toContain("didn't find any direct openings right now");
      expect(formatted).toContain("Try broadening the role title");
    });
  });

  describe("executeNaturalLanguageJobSearch", () => {
    it("executes multi-source search and returns formatted opportunities", async () => {
      const mockJob: NormalizedExternalJob = {
        external_id: "ext-1",
        title: "Software Engineer",
        organization: {
          name: "Zeno Labs",
          logo_url: null,
          website_url: null,
        },
        description: "Hands-on software development with Java and Spring Boot.",
        location: "Colombo, Sri Lanka",
        city: "Colombo",
        region: null,
        country: "Sri Lanka",
        work_mode: "hybrid",
        employment_type: "full_time",
        experience_level: "entry",
        salary_min: null,
        salary_max: null,
        salary_currency: null,
        salary_period: null,
        published_at: new Date().toISOString(),
        closing_at: null,
        publisher: null,
        source_url: "https://zeno.example/jobs/1",
        application_url: "https://zeno.example/jobs/1",
        application_is_direct: true,
        raw_payload: {},
      };

      const mockSource: JobSource = {
        identity: { key: "mock", name: "Mock Source" },
        search: vi.fn().mockResolvedValue({
          jobs: [mockJob],
          nextCursor: null,
          partialFailure: false,
        }),
      };

      const mockRepo: Partial<JobDiscoveryRepository> = {
        getSearchProfile: vi.fn().mockResolvedValue({
          id: "pref-1",
          userId: "u1",
          preferences: {
            roles: ["Software Engineer"],
            locations: ["Colombo"],
            work_modes: ["hybrid"],
            employment_types: ["full_time"],
            experience_levels: ["entry"],
            excluded_keywords: [],
            preferred_interests: [],
            excluded_interests: [],
          },
          preferenceRevision: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        upsertDiscoveredJobs: vi.fn().mockResolvedValue([]),
      };

      const result = await executeNaturalLanguageJobSearch(
        {
          userId: "u1",
          message: "find software engineer jobs in colombo",
          userSkills: ["Java", "Spring Boot"],
        },
        {
          sources: [mockSource],
          repository: mockRepo as JobDiscoveryRepository,
        },
      );

      expect(result.jobs).toHaveLength(1);
      expect(result.formattedText).toContain("Zeno Labs");
      expect(result.formattedText).toContain("Software Engineer");
      expect(mockRepo.upsertDiscoveredJobs).toHaveBeenCalled();
    });
  });
});
