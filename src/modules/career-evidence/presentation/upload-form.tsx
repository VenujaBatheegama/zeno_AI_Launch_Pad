"use client";

import { useState } from "react";

import type { CareerEvidenceSet } from "../domain/evidence";

type UploadFormProps = {
  onUploaded: (evidenceSet: CareerEvidenceSet) => void;
  title?: string;
  description?: string;
};

export function UploadForm({
  onUploaded,
  title = "Update from CV",
  description = "PDF or DOCX up to 10 MB. Review before verifying.",
}: UploadFormProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsUploading(true);

    try {
      const form = event.currentTarget;
      const response = await fetch("/api/cv", {
        method: "POST",
        body: new FormData(form),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "The CV could not be uploaded.");
      }

      onUploaded(body as CareerEvidenceSet);
      form.reset();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The CV could not be uploaded.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 py-3 shadow-[var(--zeno-shadow-sm)]"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13px] font-semibold text-[var(--zeno-ink)]">
            {title}
          </p>
          <p className="text-[12px] text-[var(--zeno-ink-muted)]">
            {description}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            name="cv"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
            disabled={isUploading}
            className="block min-w-0 text-[12px] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--zeno-violet-wash)] file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-[var(--zeno-primary-deep)]"
          />
          <button
            type="submit"
            disabled={isUploading}
            className="inline-flex h-9 shrink-0 items-center rounded-[8px] bg-[var(--zeno-ink)] px-3 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {isUploading ? "Extracting…" : "Import"}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-[var(--zeno-danger)]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
