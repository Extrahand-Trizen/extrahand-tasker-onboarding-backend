import type { FollowUpQueueStats } from '../services/LeadService';
export declare function getCachedFollowUpStats(cacheKey: string): FollowUpQueueStats | null;
export declare function setCachedFollowUpStats(cacheKey: string, data: FollowUpQueueStats): void;
export declare function buildFollowUpStatsCacheKey(filters: Record<string, unknown>, dateRange?: {
    from?: Date;
    to?: Date;
}): string;
//# sourceMappingURL=followUpStatsCache.d.ts.map