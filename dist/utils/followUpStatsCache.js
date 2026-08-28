"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedFollowUpStats = getCachedFollowUpStats;
exports.setCachedFollowUpStats = setCachedFollowUpStats;
exports.buildFollowUpStatsCacheKey = buildFollowUpStatsCacheKey;
const TTL_MS = 45000;
const MAX_ENTRIES = 200;
const cache = new Map();
function stableSerialize(value) {
    return JSON.stringify(value, (_key, v) => {
        if (v instanceof Date) {
            return v.toISOString();
        }
        return v;
    });
}
function getCachedFollowUpStats(cacheKey) {
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
function setCachedFollowUpStats(cacheKey, data) {
    if (cache.size >= MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) {
            cache.delete(oldestKey);
        }
    }
    cache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, data });
}
function buildFollowUpStatsCacheKey(filters, dateRange) {
    return stableSerialize({ filters, dateRange });
}
//# sourceMappingURL=followUpStatsCache.js.map