import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { renderCoverLetterPdf } from "@/modules/career-campaign/infrastructure/react-pdf-cover-letter-renderer";
import { getCareerEvidenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

const renderPdfSchema = z.object({
  letterText: z.string().min(10).max(10000),
  jobTitle: z.string().max(200).optional(),
  organizationName: z.string().max(200).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const json = (await request.json().catch(() => ({}))) as unknown;
    const body = renderPdfSchema.parse(json);
    const evidenceApp = getCareerEvidenceApplication(userId);
    const currentEvidence = await evidenceApp.getCurrent();
    const profile = currentEvidence?.evidence?.profile;

    const pdfBytes = await renderCoverLetterPdf({
      candidateName: profile?.full_name || "Candidate",
      contact: {
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
        location: profile?.location ?? null,
        linkedinUrl: profile?.linkedin_url ?? null,
        githubUrl: profile?.github_url ?? null,
      },
      jobTitle: body.jobTitle || "Software Engineer",
      organizationName: body.organizationName ?? null,
      letterText: body.letterText,
    });

    const slug = (body.jobTitle || "Job").replace(/[^a-zA-Z0-9_-]/gu, "_");
    const filename = `Cover_Letter_${slug}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
