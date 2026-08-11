import { Suspense } from "react";

import { CvsHub } from "@/modules/cv-tailoring/presentation/cvs-hub";

export default function CvsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--zeno-ink-muted)]">Loading…</p>}>
      <CvsHub />
    </Suspense>
  );
}
