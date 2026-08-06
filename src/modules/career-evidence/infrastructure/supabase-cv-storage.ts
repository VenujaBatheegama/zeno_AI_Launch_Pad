import type { SupabaseClient } from "@supabase/supabase-js";

import type { CvStorage } from "../application/ports";
import { CareerEvidenceError } from "../domain/errors";

export class SupabaseCvStorage implements CvStorage {
  constructor(
    private readonly client: SupabaseClient,
    private readonly bucket: string,
  ) {}

  async save(input: {
    path: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(input.path, input.bytes, {
        contentType: input.contentType,
        upsert: false,
      });

    if (error) {
      throw new CareerEvidenceError(
        "PERSISTENCE_FAILED",
        "The CV could not be stored. Please try again.",
        { cause: error },
      );
    }
  }
}
