import { describe, expect, it } from "vitest";

import { normalizeJobDescription } from "./description-normalize";

describe("normalizeJobDescription", () => {
  it("strips html and collapses whitespace deterministically", () => {
    const a = normalizeJobDescription(
      "<p>Need <b>Node.js</b></p><br/>Docker experience&nbsp;required",
    );
    const b = normalizeJobDescription(
      "<p>Need <b>Node.js</b></p><br/>Docker experience&nbsp;required",
    );
    expect(a).toBe(b);
    expect(a).toContain("Node.js");
    expect(a).toContain("Docker experience required");
    expect(a).not.toContain("<");
  });

  it("dedupes repeated paragraphs", () => {
    const normalized = normalizeJobDescription(
      "Build APIs.\n\nBuild APIs.\n\nOwn delivery.",
    );
    expect(normalized).toBe("Build APIs.\n\nOwn delivery.");
  });
});
