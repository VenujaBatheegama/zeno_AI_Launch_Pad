/**
 * @deprecated Phase 1 replaced production rendering with React-pdf
 * (`ReactPdfCvRenderer` / `ProfessionalSingleColumnResume`).
 * Kept only as an emergency rollback when `CV_PDF_RENDERER=pdfkit`.
 */
import { PassThrough } from "node:stream";

import PDFDocument from "pdfkit";
import { PDFParse } from "pdf-parse";

import type { CvPdfRenderer } from "../application/ports";
import type { ContentPlan } from "../domain/content-plan";
import type { EvidenceSnapshot } from "../domain/facts";
import type { CvMode } from "../domain/schemas";
import type { TailoredResume } from "../domain/tailored-resume";

export class PdfKitCvRenderer implements CvPdfRenderer {
  async render(input: {
    mode: CvMode;
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
  }> {
    const resume = input.resume ?? input.content;
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const pages = { count: 1 };
    doc.on("pageAdded", () => {
      pages.count += 1;
    });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
      doc.on("error", reject);
    });
    doc.pipe(stream);
    doc.font("Helvetica-Bold").fontSize(18).text(resume.contact.fullName);
    doc.font("Helvetica").fontSize(11).text(resume.targetTitle);
    doc.moveDown();
    doc.fontSize(10).text(resume.summary.text);
    doc.moveDown();
    for (const role of resume.experience) {
      doc.font("Helvetica-Bold").text(`${role.title} - ${role.employer}`);
      for (const bullet of role.bullets) {
        doc.font("Helvetica").text(`• ${bullet.text}`);
      }
      doc.moveDown(0.5);
    }
    for (const project of resume.projects) {
      doc.font("Helvetica-Bold").text(project.name);
      for (const paragraph of project.paragraphs) {
        doc.font("Helvetica").text(paragraph.text);
      }
      doc.moveDown(0.5);
    }
    if (resume.references.length > 0) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").text("References");
      const refs = resume.references;
      const columnGap = 16;
      const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const columns = Math.min(refs.length, 2);
      const columnWidth = (usableWidth - columnGap * (columns - 1)) / columns;
      const startY = doc.y;
      let maxY = startY;
      refs.forEach((referee, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = doc.page.margins.left + column * (columnWidth + columnGap);
        if (column === 0 && row > 0) {
          doc.y = maxY + 8;
        }
        const y = row === 0 ? startY : doc.y;
        doc.x = x;
        doc.y = y;
        doc.font("Helvetica-Bold").fontSize(10).text(referee.name, {
          width: columnWidth,
          continued: false,
        });
        const meta = [referee.title, referee.organization]
          .filter(Boolean)
          .join(" · ");
        if (meta) {
          doc.font("Helvetica").fontSize(9).text(meta, { width: columnWidth });
        }
        const contact = [referee.email, referee.phone].filter(Boolean).join(" · ");
        if (contact) {
          doc.font("Helvetica").fontSize(9).text(contact, { width: columnWidth });
        }
        maxY = Math.max(maxY, doc.y);
      });
      doc.x = doc.page.margins.left;
      doc.y = maxY + 4;
    }
    doc.end();
    const buffer = await done;
    const bytes = new Uint8Array(buffer);
    const parser = new PDFParse({ data: Uint8Array.from(bytes) });
    try {
      const textResult = await parser.getText();
      return {
        bytes,
        pageCount: pages.count,
        extractedText: textResult.text,
        diagnostics: [
          "DEPRECATED: PdfKitCvRenderer used. Prefer ReactPdfCvRenderer.",
        ],
      };
    } finally {
      await parser.destroy();
    }
  }
}
