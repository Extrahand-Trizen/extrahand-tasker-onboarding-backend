import { Redis } from 'ioredis';
export declare function getRedisClient(): Redis;
export declare function getRedisConnection(): string | {
    host: string;
    port: number;
    password?: string;
};
export declare function closeRedisConnection(): Promise<void>;
//# sourceMappingURL=redis.d.ts.map