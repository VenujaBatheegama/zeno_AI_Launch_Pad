import mammoth from "mammoth";
import { CanvasFactory } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import type {
  CvFile,
  CvTextExtractor,
} from "../application/ports";
import { CareerEvidenceError } from "../domain/errors";

export class PdfDocxTextExtractor implements CvTextExtractor {
  async extract(file: CvFile): Promise<string> {
    try {
      if (file.format === "docx") {
        const result = await mammoth.extractRawText({
          buffer: Buffer.from(file.bytes),
        });
        return result.value;
      }

const parser = new PDFParse({
  data: file.bytes,
  CanvasFactory,
});      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    } catch (error) {
      throw new CareerEvidenceError(
        "TEXT_EXTRACTION_FAILED",
        "The CV could not be read. Upload a text-based, unprotected PDF or DOCX.",
        { cause: error },
      );
    }
  }
}
