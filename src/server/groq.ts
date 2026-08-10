import "server-only";

import { GroqKeyPool } from "@/lib/ai/groq-key-pool";

import { getServerConfig } from "./config";

let cachedPool: GroqKeyPool | undefined;

export function getGroqKeyPool(): GroqKeyPool {
  const keys = getServerConfig().groqApiKeys;
  const next = new GroqKeyPool(keys);
  if (!cachedPool || cachedPool.fingerprint !== next.fingerprint) {
    cachedPool = next;
  }
  return cachedPool;
}
