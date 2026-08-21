/**
 * In-memory Stale-While-Revalidate (SWR) cache for jobs workspace and campaigns.
 * Stores warmed user workspace data in memory with TTL and non-blocking background revalidation.
 */

type CacheEntry<T> = {
  data: T;
  cachedAt: number;
  revalidating?: boolean;
};

const CACHE_TTL_MS = 60 * 1000; // 60 seconds fresh
const STALE_TTL_MS = 5 * 60 * 1000; // 5 minutes stale grace period

const memoryStore = new Map<string, CacheEntry<unknown>>();

export async function getOrSetCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = CACHE_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const entry = memoryStore.get(key) as CacheEntry<T> | undefined;

  // Cache hit & fresh
  if (entry && now - entry.cachedAt < ttlMs) {
    return entry.data;
  }

  // Cache hit & stale -> return stale immediately, revalidate in background
  if (entry && now - entry.cachedAt < STALE_TTL_MS) {
    if (!entry.revalidating) {
      entry.revalidating = true;
      fetcher()
        .then((fresh) => {
          memoryStore.set(key, { data: fresh, cachedAt: Date.now() });
        })
        .catch(() => {
          // Keep stale entry on error
        })
        .finally(() => {
          entry.revalidating = false;
        });
    }
    return entry.data;
  }

  // Cache miss or expired beyond stale TTL -> fetch synchronously
  const data = await fetcher();
  memoryStore.set(key, { data, cachedAt: Date.now() });
  return data;
}

export function invalidateUserCache(userId: string): void {
  for (const key of memoryStore.keys()) {
    if (key.includes(userId)) {
      memoryStore.delete(key);
    }
  }
}

export async function preloadUserJobsWorkspace(
  userId: string,
  fetcher: () => Promise<unknown>,
): Promise<void> {
  const key = `jobs-workspace:${userId}`;
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now - entry.cachedAt > CACHE_TTL_MS / 2) {
    const data = await fetcher();
    memoryStore.set(key, { data, cachedAt: Date.now() });
  }
}
