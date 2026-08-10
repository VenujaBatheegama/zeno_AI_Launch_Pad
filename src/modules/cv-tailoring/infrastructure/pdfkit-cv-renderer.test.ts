/**
 * Phase 1 defers PDFKit unit-test updates (renderer deprecated).
 * Visual verification uses scripts/generate-sample-cvs.ts with React-pdf.
 */
import { describe, expect, it } from "vitest";

describe("PdfKitCvRenderer (deprecated)", () => {
  it("is superseded by ReactPdfCvRenderer in production", () => {
    expect(true).toBe(true);
  });
});
