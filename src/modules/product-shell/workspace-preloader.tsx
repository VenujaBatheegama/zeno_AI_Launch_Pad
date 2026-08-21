"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Background workspace preloader.
 * Fires non-blocking background requests during browser idle time to:
 * 1. Warm up the server-side in-memory cache for jobs & recommendations data.
 * 2. Preload Next.js client route bundles (prefetch) for instant navigation transitions.
 */
export function WorkspacePreloader() {
  const router = useRouter();

  useEffect(() => {
    // Run preloading when browser is idle or after a tiny delay
    const idleCallback =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? window.requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 300);

    const handle = idleCallback(() => {
      // 1. Prefetch Next.js client-side route components
      try {
        router.prefetch("/app/jobs");
        router.prefetch("/app/recommendations");
        router.prefetch("/app/cvs");
        router.prefetch("/app/growth");
      } catch {
        // Ignore prefetch errors
      }

      // 2. Warm up server cache in background
      try {
        fetch("/api/preload/workspace", { priority: "low" }).catch(() => {
          // Non-critical background priming
        });
      } catch {
        // Ignore network errors
      }
    });

    return () => {
      if (typeof window !== "undefined" && "cancelIdleCallback" in window && typeof handle === "number") {
        window.cancelIdleCallback(handle);
      }
    };
  }, [router]);

  return null;
}
