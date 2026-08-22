import { NextResponse } from "next/server";
import { z } from "zod";
import { generateText, Output } from "ai";

import { requireUserId } from "@/server/auth";
import { getServerConfig } from "@/server/config";
import { getGroqKeyPool } from "@/server/groq";

export const dynamic = "force-dynamic";

const extractUrlSchema = z.object({
  url: z.string().trim().url("Valid URL required"),
});

const extractedMetadataSchema = z.object({
  roleTitle: z.string().nullable(),
  companyName: z.string().nullable(),
  location: z.string().nullable(),
  descriptionSnippet: z.string().nullable(),
});

export async function POST(request: Request) {
  try {
    await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = extractUrlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid URL" },
      { status: 400 },
    );
  }

  const targetUrl = parsed.data.url;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      // If direct fetch is blocked, fallback to URL heuristics
      const heuristic = parseHeuristicsFromUrl(targetUrl);
      return NextResponse.json({
        success: true,
        ...heuristic,
      });
    }

    const html = await response.text();

    // 1. Check Schema.org JSON-LD for JobPosting
    const jsonLdMatch = html.match(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    );
    if (jsonLdMatch) {
      for (const tag of jsonLdMatch) {
        try {
          const content = tag.replace(/<\/?script[^>]*>/gi, "").trim();
          const parsedLd = JSON.parse(content);
          const jobObj = Array.isArray(parsedLd)
            ? parsedLd.find((item) => item["@type"] === "JobPosting")
            : parsedLd["@type"] === "JobPosting"
              ? parsedLd
              : null;

          if (jobObj) {
            const role = jobObj.title ?? null;
            const company =
              typeof jobObj.hiringOrganization === "object"
                ? jobObj.hiringOrganization?.name
                : typeof jobObj.hiringOrganization === "string"
                  ? jobObj.hiringOrganization
                  : null;

            if (role || company) {
              return NextResponse.json({
                success: true,
                roleTitle: role,
                companyName: company,
                location: jobObj.jobLocation?.address?.addressLocality ?? null,
                descriptionSnippet: jobObj.description ? stripHtml(jobObj.description).slice(0, 300) : null,
              });
            }
          }
        } catch {
          // ignore malformed JSON-LD
        }
      }
    }

    // 2. Check OpenGraph and Meta tags
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogSiteName = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];

    const rawTitle = ogTitle ?? titleTag ?? "";
    const rawDesc = ogDesc ?? "";
    const rawSite = ogSiteName ?? "";

    // 3. Fast LLM Extraction from metadata text
    const keyPool = getGroqKeyPool();
    const config = getServerConfig();

    if (rawTitle.length > 3) {
      try {
        const result = await keyPool.withKey(
          async (apiKey) => {
            const { output } = await generateText({
              model: keyPool.createModel(apiKey, config.GROQ_MODEL),
              temperature: 0.0,
              maxOutputTokens: 200,
              output: Output.object({ schema: extractedMetadataSchema }),
              system: `You extract structured job information from raw web page titles, meta tags, and URL strings.
Extract:
- roleTitle: exact job title (e.g. "Senior DevOps Engineer", "Full Stack Developer").
- companyName: the hiring company or organization name (e.g. "Stripe", "Netflix", "Google").
- location: city/country or "Remote" if present.
- descriptionSnippet: short 1-2 sentence summary.`,
              prompt: `URL: ${targetUrl}
Page Title: ${rawTitle}
Site Name: ${rawSite}
Meta Description: ${rawDesc}`,
            });
            return output;
          },
          { rotateOnRateLimit: false, rotateOnToolFailure: false },
        );

        if (result && (result.roleTitle || result.companyName)) {
          return NextResponse.json({
            success: true,
            roleTitle: result.roleTitle,
            companyName: result.companyName,
            location: result.location,
            descriptionSnippet: result.descriptionSnippet,
          });
        }
      } catch {
        // Fall back to regex parser
      }
    }

    // 4. Regex fallback parsing from title / URL
    const fallback = parseHeuristicsFromText(rawTitle, targetUrl);
    return NextResponse.json({
      success: true,
      ...fallback,
    });
  } catch (err) {
    console.error("[extract-url] fetch failed, using heuristics:", err);
    const heuristic = parseHeuristicsFromUrl(targetUrl);
    return NextResponse.json({
      success: true,
      ...heuristic,
    });
  }
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseHeuristicsFromUrl(url: string): {
  roleTitle: string | null;
  companyName: string | null;
  location: string | null;
  descriptionSnippet: string | null;
} {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    let company: string | null = hostname.split(".")[0] ?? null;
    if (company && ["linkedin", "greenhouse", "lever", "ashbyhq", "workday", "indeed", "glassdoor"].includes(company)) {
      company = null;
    }

    // Try path segments
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    let role: string | null = null;
    for (const part of pathParts) {
      if (part.includes("-") || part.includes("_")) {
        const cleaned = part.replace(/[-_]/g, " ").replace(/\b(jobs?|careers?|view|apply|id|\d+)\b/gi, "").trim();
        if (cleaned.length >= 4 && cleaned.length < 50) {
          role = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
          break;
        }
      }
    }

    return {
      roleTitle: role,
      companyName: company ? company.charAt(0).toUpperCase() + company.slice(1) : null,
      location: null,
      descriptionSnippet: null,
    };
  } catch {
    return { roleTitle: null, companyName: null, location: null, descriptionSnippet: null };
  }
}

function parseHeuristicsFromText(title: string, url: string): {
  roleTitle: string | null;
  companyName: string | null;
  location: string | null;
  descriptionSnippet: string | null;
} {
  const clean = title.trim();

  // Pattern: "Job Title - Company" or "Job Title at Company"
  const split = clean.split(/[-–|@]|(?:\s+at\s+)/iu);
  if (split.length >= 2) {
    const p1 = split[0]!.trim();
    const p2 = split[1]!.trim();
    return {
      roleTitle: p1.length < 60 ? p1 : null,
      companyName: p2.length < 50 ? p2 : null,
      location: null,
      descriptionSnippet: null,
    };
  }

  const urlHeuristic = parseHeuristicsFromUrl(url);
  return {
    roleTitle: clean.length < 60 ? clean : urlHeuristic.roleTitle,
    companyName: urlHeuristic.companyName,
    location: null,
    descriptionSnippet: null,
  };
}
