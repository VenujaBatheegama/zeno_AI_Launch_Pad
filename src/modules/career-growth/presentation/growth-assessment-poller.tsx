"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function GrowthAssessmentPoller(props: {
  requestId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch(
          `/api/growth/assessments/${props.requestId}/process`,
          { method: "POST" },
        );
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Assessment failed.");
        if (!cancelled) router.refresh();
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Assessment failed.");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [props.requestId, router]);

  if (error) {
    return (
      <p className="mt-2 text-[13px] text-amber-800" role="alert">
        {error} Zeno will retry this review automatically.
      </p>
    );
  }
  if (props.compact) return null;
  return (
    <p className="mt-2 text-[13px] text-[var(--zeno-ink-muted)]">
      Zeno is reviewing your profile…
    </p>
  );
}

export function GrowthStateLink(props: {
  label: string;
  href: string;
}) {
  return (
    <Link
      href={props.href}
      className="mt-3 inline-flex text-[12px] font-semibold text-[var(--zeno-primary-deep)] hover:underline"
    >
      {props.label}
    </Link>
  );
}
