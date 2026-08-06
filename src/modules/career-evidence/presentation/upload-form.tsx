"use client";

import { useState } from "react";

import type { CareerEvidenceSet } from "../domain/evidence";

type UploadFormProps = {
  onUploaded: (evidenceSet: CareerEvidenceSet) => void;
};

export function UploadForm({ onUploaded }: UploadFormProps) {
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
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 className="text-xl font-semibold text-slate-950">Upload your CV</h2>
      <p className="mt-1 text-sm leading-5 text-slate-600">
        Use a text-based PDF or DOCX up to 10 MB. Zeno will extract a draft for
        you to review; nothing is trusted until you verify it.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          name="cv"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          required
          disabled={isUploading}
          className="block min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:font-medium"
        />
        <button
          type="submit"
          disabled={isUploading}
          className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUploading ? "Extracting…" : "Upload and extract"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
