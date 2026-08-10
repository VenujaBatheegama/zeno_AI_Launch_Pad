import { NextResponse } from "next/server";


import { errorResponse } from "../http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCareerEvidenceApplication } from "@/server/composition-root";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const formData = await request.formData();
    const file = formData.get("cv");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose a PDF or DOCX CV to upload." },
        { status: 400 },
      );
    }

    const application = getCareerEvidenceApplication(userId);
    const evidenceSet = await application.ingest({
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });

    return NextResponse.json(evidenceSet, { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
