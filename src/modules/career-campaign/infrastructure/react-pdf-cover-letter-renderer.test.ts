import { describe, expect, it } from "vitest";

import { renderCoverLetterPdf } from "./react-pdf-cover-letter-renderer";

describe("renderCoverLetterPdf", () => {
  it("renders a valid PDF buffer for a cover letter", async () => {
    const bytes = await renderCoverLetterPdf({
      candidateName: "Venuja Batheegama",
      contact: {
        email: "venuja@example.com",
        phone: "+1-555-123-4567",
        location: "Colombo, Sri Lanka",
        linkedinUrl: "https://linkedin.com/in/venuja",
      },
      jobTitle: "Software Engineer",
      organizationName: "Ceyentra Technologies",
      letterText:
        "Dear Hiring Team,\n\nI am excited to bring my technical foundation and problem-solving drive to the Software Engineer position at Ceyentra Technologies.\n\nIn my recent work on enterprise systems, I focused on building scalable backend services.\n\nI would welcome the opportunity to discuss how my background aligns with your team's needs.\n\nSincerely,\nVenuja Batheegama",
    });

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(500);

    // PDF files start with %PDF-
    const header = String.fromCharCode(...bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });
});
