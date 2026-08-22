import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/http";
import { authErrorResponse, requireUserId } from "@/server/auth";
import { getServerConfig } from "@/server/config";
import { createSupabaseClient } from "@/server/supabase-client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const config = getServerConfig();
    const supabase = createSupabaseClient(config);

    const coverLetters: Array<{
      id: string;
      listingId: string;
      jobTitle: string;
      companyName: string;
      draft: string;
      createdAt: string;
      updatedAt: string;
    }> = [];

    const seenIds = new Set<string>();

    // 1. Direct query on application_packets
    try {
      const { data: packets, error: packetError } = await supabase
        .from("application_packets")
        .select("id, listing_id, cover_letter_draft, cover_letter_meta, created_at, updated_at")
        .eq("user_id", userId)
        .not("cover_letter_draft", "is", null)
        .order("updated_at", { ascending: false });

      if (!packetError && packets) {
        for (const row of packets) {
          if (!row.cover_letter_draft) continue;
          const meta = (row.cover_letter_meta ?? {}) as {
            jobTitle?: string;
            organizationName?: string;
          };

          seenIds.add(row.id);
          coverLetters.push({
            id: row.id,
            listingId: row.listing_id,
            jobTitle: meta.jobTitle || "Target Role",
            companyName: meta.organizationName || "Company",
            draft: row.cover_letter_draft,
            createdAt: row.created_at || row.updated_at,
            updatedAt: row.updated_at,
          });
        }
      }
    } catch (err) {
      console.warn("Application packets query warning:", err);
    }

    // 2. Query from cv_tailoring_variants (where tailored_content has cover_letter_draft)
    try {
      const { data: variants, error: varError } = await supabase
        .from("cv_tailoring_variants")
        .select("id, listing_id, tailored_content, created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (!varError && variants) {
        for (const row of variants) {
          const content = (row.tailored_content ?? {}) as {
            cover_letter_draft?: string;
            coverLetterDraft?: string;
            cover_letter_meta?: { jobTitle?: string; organizationName?: string };
            coverLetterMeta?: { jobTitle?: string; organizationName?: string };
          };
          const draft = content.cover_letter_draft || content.coverLetterDraft;
          if (draft && typeof draft === "string" && !seenIds.has(row.id)) {
            seenIds.add(row.id);
            const meta = content.cover_letter_meta || content.coverLetterMeta || {};
            coverLetters.push({
              id: row.id,
              listingId: row.listing_id,
              jobTitle: meta.jobTitle || "Target Role",
              companyName: meta.organizationName || "Company",
              draft,
              createdAt: row.created_at || row.updated_at,
              updatedAt: row.updated_at,
            });
          }
        }
      }
    } catch (err) {
      console.warn("CV variants query warning:", err);
    }

    // Sort by updated_at descending
    coverLetters.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return NextResponse.json({ coverLetters });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    const json = (await request.json().catch(() => ({}))) as unknown;
    const { z } = await import("zod");
    const body = z
      .object({
        id: z.string(),
        draft: z.string().min(5),
      })
      .parse(json);

    const config = getServerConfig();
    const supabase = createSupabaseClient(config);
    const now = new Date().toISOString();

    // 1. Try update application_packets
    await supabase
      .from("application_packets")
      .update({
        cover_letter_draft: body.draft,
        updated_at: now,
      })
      .eq("id", body.id)
      .eq("user_id", userId);

    // 2. Try update cv_tailoring_variants
    const { data: variant } = await supabase
      .from("cv_tailoring_variants")
      .select("id, tailored_content")
      .eq("id", body.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (variant) {
      const content = (variant.tailored_content ?? {}) as Record<string, unknown>;
      await supabase
        .from("cv_tailoring_variants")
        .update({
          tailored_content: {
            ...content,
            cover_letter_draft: body.draft,
          },
          updated_at: now,
        })
        .eq("id", body.id);
    }

    return NextResponse.json({ success: true, updatedAt: now });
  } catch (error) {
    return authErrorResponse(error) ?? errorResponse(error);
  }
}
