import Link from "next/link";
import { PasteJdForm } from "@/modules/cv-tailoring/presentation/paste-jd-form";

export default function CvsPastePage() {
  return (
    <div className="space-y-4">
      <Link
        href="/app/cvs"
        className="text-xs text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)]"
      >
        ← Back to CVs
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--zeno-ink)]">
          Paste a job description
        </h1>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          Import a job description directly. Zeno will extract requirements,
          analyse fit, and prepare a tailored CV and cover letter.
        </p>
      </header>
      <PasteJdForm />
    </div>
  );
}
