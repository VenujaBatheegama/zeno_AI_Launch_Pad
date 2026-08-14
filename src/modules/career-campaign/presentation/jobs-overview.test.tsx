import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
}));

import { JobsOverview } from "./jobs-overview";
import { JobsBreadcrumb } from "./jobs-breadcrumb";
import type { JobCampaignOverview } from "../domain/job-campaign";

const emptyOverview: JobCampaignOverview = {
  instantSearch: {
    lastRanAt: null,
    jobsFound: 0,
    analysedCount: 0,
    hasResults: false,
  },
  campaigns: { active: 0, paused: 0, newResults: 0 },
  tiles: [],
  recentOpportunities: [],
};

describe("Jobs overview", () => {
  it("renders Instant Search and Job Campaigns entry cards", () => {
    const html = renderToStaticMarkup(
      <JobsOverview
        overview={emptyOverview}
        campaigns={[]}
        instantSearch={null}
        recentOpportunities={[]}
      />,
    );
    expect(html).toContain("Instant Job Search");
    expect(html).toContain("Job Campaigns");
    expect(html).toContain("Search jobs now");
    expect(html).toContain("New campaign");
  });

  it("shows the campaign empty state", () => {
    const html = renderToStaticMarkup(
      <JobsOverview
        overview={emptyOverview}
        campaigns={[]}
        instantSearch={null}
        recentOpportunities={[]}
      />,
    );
    expect(html).toContain("No job campaigns yet. Create one and Zeno will keep watching for matching roles.");
    expect(html).toContain("Create your first campaign");
  });

  it("shows campaign tile status and counts", () => {
    const html = renderToStaticMarkup(
      <JobsOverview
        overview={{
          ...emptyOverview,
          campaigns: { active: 1, paused: 0, newResults: 2 },
          tiles: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              name: "Backend Developer — Remote",
              primaryRole: "Backend Developer",
              location: "Remote",
              workMode: "remote",
              status: "active",
              newlyDiscovered: 2,
              qualifyingMatches: 1,
              lastLinkedInSearchAt: "2026-08-13T10:00:00.000Z",
              lastBroadSearchAt: null,
              providerWarning: null,
            },
          ],
        }}
        campaigns={[
          {
            id: "00000000-0000-4000-8000-000000000001",
            userId: "11111111-1111-4111-8111-111111111111",
            name: "Backend Developer — Remote",
            status: "active",
            primaryRole: "Backend Developer",
            location: "Remote",
            workMode: "remote",
            employmentTypes: [],
            experienceLevels: [],
            minimumScore: 55,
            preferredTechnologies: [],
            targetReadyDate: null,
            weeklyHoursAvailable: null,
            criteriaVersion: 1,
            canonicalSearchId: "00000000-0000-4000-8000-000000000002",
            lastLinkedInSearchAt: "2026-08-13T10:00:00.000Z",
            nextLinkedInSearchAt: null,
            lastBroadSearchAt: null,
            nextBroadSearchAt: null,
            lastDiscoveryAt: null,
            lastError: null,
            initialAlertsRemaining: 3,
            createdAt: "2026-08-13T10:00:00.000Z",
            updatedAt: "2026-08-13T10:00:00.000Z",
            archivedAt: null,
          },
        ]}
        instantSearch={null}
        recentOpportunities={[]}
      />,
    );
    expect(html).toContain("Backend Developer — Remote");
    expect(html).toContain("Active");
    expect(html).toContain("Campaign actions");
  });
});

describe("Jobs breadcrumbs", () => {
  it("keeps Instant Search and campaign pages nested under Jobs", () => {
    const search = renderToStaticMarkup(
      <JobsBreadcrumb
        items={[
          { href: "/app/jobs", label: "Jobs" },
          { label: "Instant Search" },
        ]}
      />,
    );
    expect(search).toContain("Jobs");
    expect(search).toContain("Instant Search");
    expect(search).toContain("/app/jobs");

    const campaign = renderToStaticMarkup(
      <JobsBreadcrumb
        items={[
          { href: "/app/jobs", label: "Jobs" },
          { label: "Backend Developer — Remote" },
        ]}
      />,
    );
    expect(campaign).toContain("Backend Developer — Remote");
  });
});
