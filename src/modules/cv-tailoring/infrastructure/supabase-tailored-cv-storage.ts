import type { SupabaseClient } from "@supabase/supabase-js";

import type { TailoredCvStorage } from "../application/ports";
import { CvTailoringError } from "../domain/errors";

export class SupabaseTailoredCvStorage implements TailoredCvStorage {
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
        upsert: true,
      });
    if (error) {
      throw new CvTailoringError(
        "PERSISTENCE_FAILED",
        "The tailored CV PDF could not be stored.",
        { cause: error },
      );
    }
  }

  async read(path: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(path);
    if (error || !data) {
      throw new CvTailoringError(
        "NOT_FOUND",
        "The tailored CV PDF could not be loaded.",
        { cause: error },
      );
    }
    return new Uint8Array(await data.arrayBuffer());
  }
}
