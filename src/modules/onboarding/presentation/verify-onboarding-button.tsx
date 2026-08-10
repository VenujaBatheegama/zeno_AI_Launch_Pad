"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VerifyOnboardingButton(props: {
  evidenceSetId: string;
  expectedUpdatedAt: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    if (
      !window.confirm(
        "Confirm your career profile?\n\nZeno will use this information to match jobs and create tailored CVs. You can edit it later.",
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not verify profile.");
      }
      void props.evidenceSetId;
      void props.expectedUpdatedAt;
      router.push("/app/home");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={verify}
        className="rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading ? "Verifying…" : "Verify and finish profile"}
      </button>
      {error ? (
        <p className="mt-2 text-xs text-[var(--zeno-danger)]">{error}</p>
      ) : null}
    </div>
  );
}
