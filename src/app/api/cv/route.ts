import { NextResponse } from "next/server";

import { getCareerEvidenceApplication } from "@/server/composition-root";

import { errorResponse } from "../http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("cv");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose a PDF or DOCX CV to upload." },
        { status: 400 },
      );
    }

    const application = getCareerEvidenceApplication();
    const evidenceSet = await application.ingest({
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });

    return NextResponse.json(evidenceSet, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
