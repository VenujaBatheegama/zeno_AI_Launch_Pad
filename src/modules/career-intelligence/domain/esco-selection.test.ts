import { describe, expect, it } from "vitest";

import {
  selectSearchTitlesFromEscoHits,
  sourceForExpandedTitle,
} from "./esco-selection";

describe("selectSearchTitlesFromEscoHits", () => {
  it("keeps exact role first and caps alternatives", () => {
    const resolution = selectSearchTitlesFromEscoHits({
      originalRole: "Junior Software Engineer",
      maxAlternatives: 2,
      hits: [
        {
          uri: "http://data.europa.eu/esco/occupation/se",
          title: "software developer",
          alternativeLabels: [
            "Junior Software Developer",
            "application programmer",
            "coder",
            "systems analyst",
          ],
        },
      ],
    });

    expect(resolution.status).toBe("resolved");
    expect(resolution.searchTitles[0]).toBe("Junior Software Engineer");
    expect(resolution.searchTitles.length).toBeLessThanOrEqual(4);
    expect(
      resolution.searchTitles.every((title) =>
        /junior|software|developer|programmer|application/i.test(title),
      ),
    ).toBe(true);
  });

  it("preserves seniority and falls back to exact on empty hits", () => {
    const unresolved = selectSearchTitlesFromEscoHits({
      originalRole: "Senior DevOps Engineer",
      hits: [],
    });
    expect(unresolved.status).toBe("unresolved");
    expect(unresolved.searchTitles).toEqual(["Senior DevOps Engineer"]);

    const mismatched = selectSearchTitlesFromEscoHits({
      originalRole: "Junior Cloud Engineer",
      hits: [
        {
          uri: "u1",
          title: "Senior Cloud Engineer",
          alternativeLabels: ["Principal Cloud Engineer"],
        },
      ],
    });
    expect(mismatched.searchTitles[0]).toBe("Junior Cloud Engineer");
    expect(
      mismatched.searchTitles.some((title) => /senior|principal/i.test(title)),
    ).toBe(false);
  });

  it("marks ambiguous top hits and returns exact role only", () => {
    const resolution = selectSearchTitlesFromEscoHits({
      originalRole: "Specialist",
      hits: [
        { uri: "a", title: "Database Administrator" },
        { uri: "b", title: "Network Architect" },
      ],
    });
    expect(resolution.status).toBe("ambiguous");
    expect(resolution.searchTitles).toEqual(["Specialist"]);
  });

  it("maps sources for expanded titles", () => {
    const resolution = selectSearchTitlesFromEscoHits({
      originalRole: "Software Engineer",
      hits: [
        {
          uri: "u",
          title: "software developer",
          alternativeLabels: ["application developer"],
        },
      ],
    });
    expect(sourceForExpandedTitle({ title: "Software Engineer", resolution })).toBe(
      "exact_role",
    );
    expect(
      sourceForExpandedTitle({
        title: resolution.preferredTitle ?? "software developer",
        resolution,
      }),
    ).toBe("esco_preferred");
  });
});
