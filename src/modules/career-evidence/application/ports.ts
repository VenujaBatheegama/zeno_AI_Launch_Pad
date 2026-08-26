import type {
  CareerEvidence,
  CareerEvidenceSet,
  ExtractedCareerEvidence,
} from "../domain/evidence";

export type CvFormat = "pdf" | "docx";

export type CvFile = {
  fileName: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
  format: CvFormat;
};

export type CvDocument = {
  id: string;
  userId: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  status: "processing" | "processed" | "failed";
  extractedText: string | null;
  errorMessage: string | null;
};

export interface CvStorage {
  save(input: {
    path: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<void>;
}

export interface CvTextExtractor {
  extract(file: CvFile): Promise<string>;
}

export interface EvidenceExtractor {
  extract(text: string): Promise<ExtractedCareerEvidence>;
}

export interface CareerEvidenceRepository {
  createDocument(document: CvDocument): Promise<void>;
  markDocumentProcessed(input: {
    id: string;
    userId: string;
    extractedText: string;
  }): Promise<void>;
  markDocumentFailed(input: {
    id: string;
    userId: string;
    errorMessage: string;
  }): Promise<void>;
  createDraft(input: {
    id: string;
    userId: string;
    sourceDocumentId: string;
    evidence: CareerEvidence;
    extractionModel: string;
  }): Promise<CareerEvidenceSet>;
  saveDraft(input: {
    id: string;
    userId: string;
    evidence: CareerEvidence;
  }): Promise<CareerEvidenceSet>;
  verify(input: {
    id: string;
    userId: string;
    evidence: CareerEvidence;
    verifiedAt: string;
  }): Promise<CareerEvidenceSet>;
  getById(id: string, userId: string): Promise<CareerEvidenceSet | null>;
  getCurrent(userId: string): Promise<CareerEvidenceSet | null>;
  getVerified(userId: string): Promise<CareerEvidenceSet | null>;
  getDocumentExtractedText(input: {
    documentId: string;
    userId: string;
  }): Promise<string | null>;
}

export type IdGenerator = () => string;
export type Clock = () => Date;
