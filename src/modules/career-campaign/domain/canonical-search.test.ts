import { describe, expect, it } from "vitest";

import {
  canonicalLinkedInSearchKey,
  jobIdentityFingerprint,
  normalizeSearchToken,
} from "./canonical-search";

describe("canonical LinkedIn search keys", () => {
  it("normalizes equivalent retrieval criteria to one key", () => {
    const a = canonicalLinkedInSearchKey({
      primaryRole: "Backend Developer",
      location: "Sri Lanka",
      workMode: "remote",
    });
    const b = canonicalLinkedInSearchKey({
      primaryRole: "  backend   developer ",
      location: "sri-lanka",
      workMode: "remote",
    });
    expect(a).toBe("backend-developer|sri-lanka|remote|any|linkedin-guest|fresh-1h");
    expect(b).toBe(a);
  });

  it("does not share keys across different roles", () => {
    const backend = canonicalLinkedInSearchKey({
      primaryRole: "Backend Developer",
      location: "Sri Lanka",
      workMode: "remote",
    });
    const frontend = canonicalLinkedInSearchKey({
      primaryRole: "Frontend Developer",
      location: "Sri Lanka",
      workMode: "remote",
    });
    expect(backend).not.toBe(frontend);
  });

  it("does not share keys across different retrieval locations", () => {
    const colombo = canonicalLinkedInSearchKey({
      primaryRole: "Backend Developer",
      location: "Colombo",
      workMode: "hybrid",
    });
    const kandy = canonicalLinkedInSearchKey({
      primaryRole: "Backend Developer",
      location: "Kandy",
      workMode: "hybrid",
    });
    expect(colombo).not.toBe(kandy);
  });

  it("ignores fields that only affect alerts, not retrieval", () => {
    const key = canonicalLinkedInSearchKey({
      primaryRole: "Software Engineer",
      location: "Sri Lanka",
      workMode: "any",
    });
    expect(key).not.toMatch(/55|score|evidence|cv/i);
    expect(normalizeSearchToken("Software Engineer")).toBe("software-engineer");
  });
});

describe("job identity fingerprints", () => {
  it("keeps similar but distinct jobs separate", () => {
    const a = jobIdentityFingerprint({
      company: "Acme",
      title: "Backend Engineer",
      location: "Colombo",
      publishedAt: "2026-08-13T00:00:00.000Z",
    });
    const b = jobIdentityFingerprint({
      company: "Acme",
      title: "Frontend Engineer",
      location: "Colombo",
      publishedAt: "2026-08-13T00:00:00.000Z",
    });
    expect(a).not.toBe(b);
  });

  it("buckets publication time by calendar day", () => {
    const morning = jobIdentityFingerprint({
      company: "Acme",
      title: "Backend Engineer",
      location: "Colombo",
      publishedAt: "2026-08-13T08:00:00.000Z",
    });
    const evening = jobIdentityFingerprint({
      company: "Acme",
      title: "Backend Engineer",
      location: "Colombo",
      publishedAt: "2026-08-13T20:00:00.000Z",
    });
    expect(morning).toBe(evening);
  });
});
