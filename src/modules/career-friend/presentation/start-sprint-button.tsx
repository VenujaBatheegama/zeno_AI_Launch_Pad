"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartSprintButton(props: { growthActionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function start() {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch("/api/career-friend/sprints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ growthActionId: props.growthActionId }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Sprint could not be started.");
      router.push("/app/growth");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sprint could not be started.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="rounded-full bg-[var(--zeno-primary)] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Starting…" : "Start sprint"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
