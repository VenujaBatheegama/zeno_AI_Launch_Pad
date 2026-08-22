import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getCvTailoringApplication } from "@/server/composition-root";
import { getServerConfig } from "@/server/config";
import { createSupabaseClient } from "@/server/supabase-client";

import { publicCvVariant, publicCvVariantCard } from "./public-variant";

export const runtime = "nodejs";

/** GET: list the current user's tailored CV variants as library cards. */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const readyOnly = url.searchParams.get("readyOnly") === "true";
    const application = getCvTailoringApplication(userId);
    const allVariants = await application.listForUser({
      statuses: readyOnly
        ? ["ready"]
        : ["ready", "ready_to_render", "failed", "rendering"],
      limit: 50,
    });

    const variants = allVariants.filter(
      (v) => v.policyVersion !== "cover-letter-v1" && v.recommendationReason !== "Cover Letter Generation",
    );

    const config = getServerConfig();
    const supabase = createSupabaseClient(config);
    const listingIds = Array.from(
      new Set(variants.map((v) => v.listingId).filter(Boolean)),
    );

    const orgMap: Record<string, string> = {};
    if (listingIds.length > 0) {
      const { data: listings } = await supabase
        .from("job_listings")
        .select(`
          id,
          jobs(
            id,
            title,
            organizations(name)
          )
        `)
        .in("id", listingIds);

      if (listings) {
        type ListingRow = {
          id: string;
          jobs: {
            id: string;
            title: string;
            organizations: { name: string } | null;
          } | null;
        };
        for (const row of listings as unknown as ListingRow[]) {
          if (row.jobs?.organizations?.name) {
            orgMap[row.id] = row.jobs.organizations.name;
          }
        }
      }
    }

    const cards = variants.map((v) => {
      const card = publicCvVariantCard(v);
      return {
        ...card,
        companyName: orgMap[v.listingId] || null,
      };
    });

    return NextResponse.json({
      variants: cards,
    });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

/** POST: plan + Groq tailor + validate. Stops before PDF render. */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      listingId: string;
      mode?: "one_page" | "two_page";
      tailoringContext?: string | null;
      force?: boolean;
    };
    const application = getCvTailoringApplication(userId);
    const variant = await application.generateContent({
      listingId: body.listingId,
      mode: body.mode,
      tailoringContext: body.tailoringContext,
      force: body.force,
    });
    return NextResponse.json({ variant: publicCvVariant(variant) });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
