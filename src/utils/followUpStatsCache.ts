import type { FollowUpQueueStats } from '../services/LeadService';

const TTL_MS = 45_000;
const MAX_ENTRIES = 200;

type CacheEntry = { expiresAt: number; data: FollowUpQueueStats };

const cache = new Map<string, CacheEntry>();

function stableSerialize(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v instanceof Date) {
      return v.toISOString();
    }
    return v;
  });
}

export function getCachedFollowUpStats(cacheKey: string): FollowUpQueueStats | null {
  const entry = cache.get(cacheKey);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

export function setCachedFollowUpStats(cacheKey: string, data: FollowUpQueueStats): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
  cache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, data });
}

export function buildFollowUpStatsCacheKey(
  filters: Record<string, unknown>,
  dateRange?: { from?: Date; to?: Date },
): string {
  return stableSerialize({ filters, dateRange });
}
