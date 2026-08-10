"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

type Stage =
  | "choose"
  | "uploading"
  | "reading"
  | "identifying"
  | "organizing"
  | "preparing"
  | "summary";

const STAGES: Array<{ key: Stage; label: string }> = [
  { key: "reading", label: "Reading your CV" },
  { key: "identifying", label: "Identifying your experience" },
  { key: "organizing", label: "Organizing projects and skills" },
  { key: "preparing", label: "Preparing your review" },
];

type Summary = {
  experience: number;
  projects: number;
  skills: number;
  education: number;
  certifications: number;
  warnings: string[];
  evidenceSetId: string;
};

export function CvImportFlow() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<Stage>("choose");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const onFile = useCallback((next: File | null) => {
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(next.type) && !/\.(pdf|docx)$/i.test(next.name)) {
      setError("Use a PDF or DOCX file.");
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setError("Keep the file under 10 MB.");
      return;
    }
    setFile(next);
  }, []);

  async function startImport() {
    if (!file) return;
    setError(null);
    setStage("uploading");
    const timers = [
      window.setTimeout(() => setStage("reading"), 400),
      window.setTimeout(() => setStage("identifying"), 1200),
      window.setTimeout(() => setStage("organizing"), 2200),
      window.setTimeout(() => setStage("preparing"), 3200),
    ];

    try {
      const formData = new FormData();
      formData.append("cv", file);
      const response = await fetch("/api/cv", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Upload failed.");
      }

      await fetch("/api/onboarding/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboardingMethod: "cv_import",
          onboardingStatus: "awaiting_verification",
          onboardingCurrentStep: "review",
          onboardingProgress: 80,
        }),
      });

      const evidence = payload.evidence;
      setSummary({
        experience: evidence.work_experience?.length ?? 0,
        projects: evidence.projects?.length ?? 0,
        skills: evidence.skills?.length ?? 0,
        education: evidence.education?.length ?? 0,
        certifications: evidence.certifications?.length ?? 0,
        warnings: evidence.warnings ?? [],
        evidenceSetId: payload.id,
      });
      setStage("summary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setStage("choose");
    } finally {
      for (const timer of timers) window.clearTimeout(timer);
    }
  }

  if (stage !== "choose" && stage !== "summary") {
    const activeIndex = Math.max(
      0,
      STAGES.findIndex((item) => item.key === stage),
    );
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-semibold">Working through your CV</h1>
        <p className="mt-2 text-sm text-[var(--zeno-ink-muted)]">
          This usually takes a short moment. Nothing is confirmed until you review it.
        </p>
        <ol className="mt-8 space-y-3">
          {STAGES.map((item, index) => (
            <li
              key={item.key}
              className={`rounded-[var(--zeno-radius-sm)] border px-4 py-3 text-sm ${
                index <= activeIndex
                  ? "border-[var(--zeno-primary)] bg-[var(--zeno-violet-wash)] text-[var(--zeno-ink)]"
                  : "border-[var(--zeno-border)] text-[var(--zeno-ink-faint)]"
              }`}
            >
              {item.label}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (stage === "summary" && summary) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Your profile draft is ready</h1>
        <ul className="mt-4 space-y-1 text-sm text-[var(--zeno-ink-muted)]">
          <li>{summary.experience} experience</li>
          <li>{summary.projects} projects</li>
          <li>{summary.skills} skills</li>
          <li>{summary.education} education records</li>
          <li>{summary.certifications} certifications</li>
        </ul>
        {summary.warnings.length > 0 ? (
          <div className="mt-6 rounded-[var(--zeno-radius-md)] border border-[color-mix(in_srgb,var(--zeno-warning)_30%,white)] bg-[color-mix(in_srgb,var(--zeno-warning)_8%,white)] p-4">
            <h2 className="text-sm font-semibold text-[var(--zeno-warning)]">
              Needs your review
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--zeno-ink-muted)]">
              {summary.warnings.slice(0, 6).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <button
          type="button"
          className="mt-8 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white"
          onClick={() => router.push("/onboarding/review")}
        >
          Continue to review
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Link
        href="/onboarding"
        className="text-sm text-[var(--zeno-ink-muted)] hover:underline"
      >
        ← Back
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Import your CV</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--zeno-ink-muted)]">
        Your CV is used to build your private Zeno career profile. You&apos;ll
        review everything before it is confirmed.
      </p>

      <div
        className={`mt-8 rounded-[var(--zeno-radius-lg)] border border-dashed p-8 text-center transition ${
          dragOver
            ? "border-[var(--zeno-primary)] bg-[var(--zeno-violet-wash)]"
            : "border-[var(--zeno-border)] bg-white"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          onFile(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        <p className="text-sm font-medium">Drag and drop a PDF or DOCX</p>
        <p className="mt-1 text-xs text-[var(--zeno-ink-faint)]">
          Up to 10 MB · PDF and DOCX supported
        </p>
        <label className="mt-4 inline-flex cursor-pointer rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-4 py-2 text-sm font-semibold">
          Choose file
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {file ? (
          <p className="mt-4 text-sm text-[var(--zeno-ink)]">
            Selected: <span className="font-medium">{file.name}</span>
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-[var(--zeno-danger)]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!file}
        onClick={startImport}
        className="mt-6 w-full rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        Upload and extract
      </button>
    </div>
  );
}
