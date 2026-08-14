import { renderToBuffer } from "@react-pdf/renderer";
import { CanvasFactory } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

import type { CvPdfRenderer } from "../application/ports";
import type { ContentPlan } from "../domain/content-plan";
import type { EvidenceSnapshot } from "../domain/facts";
import {
  reduceResumeForOnePage,
  reduceResumeForTwoPage,
} from "../domain/reduce-content";
import {
  isTailoredResume,
  type ResumeDensity,
  type TailoredResume,
} from "../domain/tailored-resume";
import { ProfessionalSingleColumnResume } from "./react-pdf/ProfessionalSingleColumnResume";

/**
 * Production React-pdf renderer for TailoredResume documents.
 */
export class ReactPdfCvRenderer implements CvPdfRenderer {
  async render(input: {
    mode: "one_page" | "two_page";
    content: TailoredResume;
    snapshot: EvidenceSnapshot;
    plan: ContentPlan;
    jobTitle: string;
    resume?: TailoredResume;
  }): Promise<{
    bytes: Uint8Array;
    pageCount: number;
    extractedText: string;
    diagnostics: string[];
    resume: TailoredResume;
  }> {
    const resume =
      input.resume ?? (isTailoredResume(input.content) ? input.content : null);
    if (!resume) {
      throw new Error(
        "ReactPdfCvRenderer requires a TailoredResume. Regenerate CV content.",
      );
    }

    const diagnostics: string[] = [];
    let working = resume;
    let density: ResumeDensity = "comfortable";
    let rendered = await renderResume(working, density, input.plan);
    diagnostics.push(...rendered.diagnostics);

    const maxPages = input.mode === "one_page" ? 1 : 2;

    if (rendered.pageCount > maxPages) {
      density = "compact";
      rendered = await renderResume(working, density, input.plan);
      diagnostics.push(
        `Compact retry produced ${rendered.pageCount} page(s).`,
      );
    }

    if (rendered.pageCount > maxPages) {
      const reduce =
        input.mode === "one_page"
          ? reduceResumeForOnePage
          : reduceResumeForTwoPage;
      for (let attempt = 0; attempt < 10 && rendered.pageCount > maxPages; attempt += 1) {
        const reduced = reduce(working);
        if (JSON.stringify(reduced) === JSON.stringify(working)) break;
        working = reduced;
        rendered = await renderResume(working, "compact", input.plan);
        diagnostics.push(
          `Content reduction attempt ${attempt + 1} → ${rendered.pageCount} page(s).`,
        );
      }
    }

    if (input.mode === "two_page" && rendered.pageCount === 1) {
      diagnostics.push(
        "Two-page mode requested but content fits on one page; not artificially stretched.",
      );
    }

    // Soft ATS checks from extracted text.
    if (/\s{2,}[A-Z]\s[a-z]\s[a-z]/u.test(rendered.extractedText)) {
      diagnostics.push(
        "WARN: Extracted text may contain letter-spaced words; inspect PDF.",
      );
    }
    if (
      working.contact.email &&
      !rendered.extractedText.includes(working.contact.email)
    ) {
      diagnostics.push("WARN: Email missing from extracted PDF text.");
    }

    return {
      bytes: rendered.bytes,
      pageCount: rendered.pageCount,
      extractedText: rendered.extractedText,
      diagnostics,
      resume: working,
    };
  }
}

function countPdfPages(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return Math.max(1, matches?.length ?? 1);
}

async function renderResume(
  resume: TailoredResume,
  density: ResumeDensity,
  plan: ContentPlan,
): Promise<{
  bytes: Uint8Array;
  pageCount: number;
  extractedText: string;
  diagnostics: string[];
}> {
  const buffer = await renderToBuffer(
    <ProfessionalSingleColumnResume
      resume={resume}
      plan={plan}
      density={density}
    />,
  );
  const owned = Uint8Array.from(buffer);
  const pageCount = countPdfPages(owned);
const parser = new PDFParse({
  data: Uint8Array.from(buffer),
  CanvasFactory,
});  try {
    const textResult = await parser.getText();
    return {
      bytes: owned,
      pageCount,
      extractedText: textResult.text,
      diagnostics: [`Rendered with density=${density}.`],
    };
  } finally {
    await parser.destroy();
  }
}
