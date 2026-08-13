"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function RunZenoButton(props: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [busy]);

  async function run() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/campaign/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json()) as {
        error?: string;
        run?: {
          status: string;
          discoveredCount: number;
          analysedCount: number;
          recommendedCount: number;
          failedCount: number;
          errorSummary: string | null;
        };
        reused?: boolean;
      };
      if (!response.ok) {
        setMessage(json.error ?? "Campaign check failed.");
        return;
      }
      const runResult = json.run!;
      if (json.reused) {
        setMessage(
          `Already finished today (${runResult.status}): ${runResult.discoveredCount} discovered · ${runResult.analysedCount} analysed · ${runResult.recommendedCount} recommended.`,
        );
      } else if (runResult.recommendedCount === 0 && runResult.failedCount > 0) {
        setMessage(
          `Found ${runResult.discoveredCount} job(s), but analysis failed for ${runResult.failedCount} (often Groq rate limits). Wait a minute and run again — no recommendations were created.`,
        );
      } else if (runResult.recommendedCount === 0) {
        setMessage(
          `Found ${runResult.discoveredCount} job(s) and analysed ${runResult.analysedCount}, but none cleared the recommendation threshold. Check Jobs for ranked matches.`,
        );
      } else {
        setMessage(
          `Done: ${runResult.discoveredCount} discovered · ${runResult.analysedCount} analysed · ${runResult.recommendedCount} recommended. Open Inbox to review.`,
        );
      }
      router.refresh();
    } catch {
      setMessage("Network error running campaign check.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy || props.disabled}
        onClick={() => void run()}
        className="inline-flex items-center gap-2 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--zeno-primary-deep)] disabled:opacity-60"
      >
        {busy ? (
          <>
            <span
              className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
              aria-hidden
            />
            Running Zeno… {elapsedSec}s
          </>
        ) : (
          "Run Zeno now"
        )}
      </button>
      {busy ? (
        <p className="text-xs text-[var(--zeno-ink-faint)]">
          Searching and analysing jobs — analysis is slow when Groq is
          rate-limited (often 30–120s).
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-[var(--zeno-ink-muted)]">{message}</p>
      ) : null}
    </div>
  );
}
