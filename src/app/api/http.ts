import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { CareerEvidenceError } from "@/modules/career-evidence/domain/errors";
import { JobDiscoveryError } from "@/modules/job-discovery/domain/errors";

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "The submitted data is invalid." },
      { status: 400 },
    );
  }

  if (error instanceof JobDiscoveryError) {
    const statusByCode = {
      INVALID_PREFERENCES: 400,
      SEARCH_NOT_CONFIGURED: 400,
      SOURCE_UNAVAILABLE: 502,
      SOURCE_RATE_LIMITED: 429,
      SOURCE_UNAUTHORIZED: 503,
      PERSISTENCE_FAILED: 503,
      NOT_FOUND: 404,
    } as const;
    return NextResponse.json(
      { error: error.message },
      { status: statusByCode[error.code] },
    );
  }

  if (error instanceof CareerEvidenceError) {
    const statusByCode = {
      INVALID_FILE: 400,
      TEXT_EXTRACTION_FAILED: 422,
      AI_EXTRACTION_FAILED: 502,
      NOT_FOUND: 404,
      INVALID_STATE: 409,
      PERSISTENCE_FAILED: 503,
    } as const;

    return NextResponse.json(
      { error: error.message },
      { status: statusByCode[error.code] },
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
