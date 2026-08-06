import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { createTextPdf } from "../../../test/pdf-fixture";

import { PdfDocxTextExtractor } from "./pdf-docx-text-extractor";

describe("PDF and DOCX text extraction", () => {
  it("extracts career text from a valid text-based PDF", async () => {
    const extractor = new PdfDocxTextExtractor();
    const bytes = createTextPdf("Ada Lovelace - Software Engineer");

    const text = await extractor.extract({
      fileName: "ada-cv.pdf",
      mimeType: "application/pdf",
      size: bytes.byteLength,
      bytes,
      format: "pdf",
    });

    expect(text).toContain("Ada Lovelace - Software Engineer");
  });

  it("extracts career text from a valid DOCX", async () => {
    const extractor = new PdfDocxTextExtractor();
    const bytes = await createDocx("Grace Hopper - Computer Scientist");

    const text = await extractor.extract({
      fileName: "grace-cv.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: bytes.byteLength,
      bytes,
      format: "docx",
    });

    expect(text).toContain("Grace Hopper - Computer Scientist");
  });

  it("returns a recoverable error for a malformed PDF", async () => {
    const extractor = new PdfDocxTextExtractor();
    const bytes = new Uint8Array(Buffer.from("%PDF-1.4\nnot a document"));

    await expect(
      extractor.extract({
        fileName: "broken.pdf",
        mimeType: "application/pdf",
        size: bytes.byteLength,
        bytes,
        format: "pdf",
      }),
    ).rejects.toMatchObject({ code: "TEXT_EXTRACTION_FAILED" });
  });
});

async function createDocx(text: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
      </w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}
