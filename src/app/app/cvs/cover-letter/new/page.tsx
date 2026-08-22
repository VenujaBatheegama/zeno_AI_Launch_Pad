import { Suspense } from "react";

import { PasteCoverLetterForm } from "@/modules/cv-tailoring/presentation/paste-cover-letter-form";

export const dynamic = "force-dynamic";

export default function NewCoverLetterPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--zeno-ink-muted)]">Loading…</p>}>
      <PasteCoverLetterForm />
    </Suspense>
  );
}

