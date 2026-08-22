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
    let profile: {
      full_name?: string | null;
      email?: string | null;
      phone?: string | null;
      location?: string | null;
      linkedin_url?: string | null;
      github_url?: string | null;
    } | null = null;

    try {
      const evidenceApp = getCareerEvidenceApplication(userId);
      const currentEvidence = await evidenceApp.getCurrent();
      profile = currentEvidence?.evidence?.profile ?? null;
    } catch {
      // Safe fallback
    }

    const candidateName = profile?.full_name?.trim() || "Candidate";

    const pdfBytes = await renderCoverLetterPdf({
      candidateName,
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

    const clean = (str: string) =>
      str.trim().replace(/[^a-zA-Z0-9_-]/gu, "_").replace(/_+/gu, "_");

    const isGeneral =
      !body.jobTitle ||
      body.jobTitle.toLowerCase().includes("general") ||
      !body.organizationName ||
      body.organizationName.toLowerCase() === "general" ||
      body.organizationName.toLowerCase() === "company";

    const roleSlug = clean(body.jobTitle || "Professional");
    const compSlug = clean(body.organizationName || "");

    let filename: string;
    if (isGeneral) {
      filename = roleSlug !== "Professional" && roleSlug !== "General"
        ? `Cover_Letter_General_${roleSlug}.pdf`
        : "Cover_Letter_General.pdf";
    } else if (compSlug) {
      filename = `Cover_Letter_${roleSlug}_${compSlug}.pdf`;
    } else {
      filename = `Cover_Letter_${roleSlug}.pdf`;
    }

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
