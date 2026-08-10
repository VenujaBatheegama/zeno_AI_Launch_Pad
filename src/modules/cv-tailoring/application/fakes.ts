import type {
  CvLanguageTailorer,
  CvPdfRenderer,
  CvTailoringRepository,
  CvTailoringVariant,
  TailoredCvStorage,
} from "./ports";
import type { GroqResumeDraft, TailoredResume } from "../domain/tailored-resume";

export class InMemoryCvTailoringRepository implements CvTailoringRepository {
  variants = new Map<string, CvTailoringVariant>();

  async saveVariant(variant: CvTailoringVariant) {
    this.variants.set(variant.id, { ...variant });
    return { ...variant };
  }

  async getVariant(userId: string, variantId: string) {
    const variant = this.variants.get(variantId);
    if (!variant || variant.userId !== userId) return null;
    return { ...variant };
  }

  async getVariantByIdempotencyKey(userId: string, idempotencyKey: string) {
    const variant = [...this.variants.values()].find(
      (item) =>
        item.userId === userId && item.idempotencyKey === idempotencyKey,
    );
    return variant ? { ...variant } : null;
  }

  async listVariantsForListing(userId: string, listingId: string) {
    return [...this.variants.values()]
      .filter((item) => item.userId === userId && item.listingId === listingId)
      .map((item) => ({ ...item }));
  }

  async listVariantsForUser(
    userId: string,
    options?: { statuses?: CvTailoringVariant["status"][]; limit?: number },
  ) {
    const statuses = options?.statuses;
    const limit = options?.limit ?? 50;
    return [...this.variants.values()]
      .filter((item) => item.userId === userId)
      .filter((item) => !statuses || statuses.includes(item.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((item) => ({ ...item }));
  }
}

export class FakeCvLanguageTailorer implements CvLanguageTailorer {
  calls = 0;
  repairCalls = 0;

  constructor(private readonly draftFactory: () => GroqResumeDraft) {}

  async tailor() {
    this.calls += 1;
    return {
      draft: this.draftFactory(),
      usage: { modelId: "fake-model", inputTokens: 100, outputTokens: 50 },
    };
  }

  async repairFragment(input: {
    maxBullets: number;
    maxChars: number;
    careerItemId: string;
  }) {
    this.repairCalls += 1;
    return {
      bullets: [
        {
          text: "Supported verified contribution.".slice(0, input.maxChars),
          factIds: [`${input.careerItemId}:bullet:0`],
        },
      ].slice(0, input.maxBullets),
      usage: { modelId: "fake-model", inputTokens: 20, outputTokens: 10 },
    };
  }
}

export class FakeCvPdfRenderer implements CvPdfRenderer {
  calls = 0;

  async render(input: {
    mode: "one_page" | "two_page";
    content: TailoredResume;
  }) {
    this.calls += 1;
    const text = [
      input.content.contact.fullName,
      input.content.targetTitle,
      ...input.content.projects.map((item) => item.name),
      ...input.content.experience.flatMap((item) =>
        item.bullets.map((bullet) => bullet.text),
      ),
    ].join("\n");
    return {
      bytes: new TextEncoder().encode(`%PDF-FAKE\n${text}`),
      pageCount: input.mode === "one_page" ? 1 : 2,
      extractedText: text,
      diagnostics: [],
      resume: input.content,
    };
  }
}

export class InMemoryTailoredCvStorage implements TailoredCvStorage {
  files = new Map<string, Uint8Array>();

  async save(input: { path: string; bytes: Uint8Array }) {
    this.files.set(input.path, input.bytes);
  }

  async read(path: string) {
    const bytes = this.files.get(path);
    if (!bytes) throw new Error(`missing ${path}`);
    return bytes;
  }
}
