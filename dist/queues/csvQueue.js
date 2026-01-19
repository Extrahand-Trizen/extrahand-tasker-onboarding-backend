"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.csvQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const logger_1 = __importDefault(require("../config/logger"));
// Lazy initialization - only create queue when needed and Redis is configured
let csvQueueInstance = null;
function getCsvQueue() {
    if (csvQueueInstance) {
        return csvQueueInstance;
    }
    // Check if Redis is configured
    if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
        throw new Error('Redis not configured. Set REDIS_HOST or REDIS_URL to use CSV queue.');
    }
    try {
        const connection = (0, redis_1.getRedisConnection)();
        csvQueueInstance = new bullmq_1.Queue('csv-processing', {
            connection: connection, // BullMQ accepts both string URL and connection object
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000, // 2 seconds, then 4, then 8
                },
                removeOnComplete: {
                    age: 24 * 3600, // Keep completed jobs for 24 hours
                    count: 1000, // Keep max 1000 completed jobs
                },
                removeOnFail: {
                    age: 7 * 24 * 3600, // Keep failed jobs for 7 days
                },
            },
        });
        // Queue event listeners
        csvQueueInstance.on('error', (error) => {
            logger_1.default.error('CSV Queue error:', error);
        });
        csvQueueInstance.on('waiting', (job) => {
            logger_1.default.info(`CSV job ${job.id} is waiting`);
        });
        logger_1.default.info('✅ CSV queue initialized successfully');
        return csvQueueInstance;
    }
    catch (error) {
        logger_1.default.error('Failed to create CSV queue:', error);
        throw error;
    }
}
// Export queue with lazy initialization
exports.csvQueue = {
    get: getCsvQueue,
    add: (...args) => getCsvQueue().add(...args),
    getJob: (jobId) => getCsvQueue().getJob(jobId),
};
exports.default = exports.csvQueue;
//# sourceMappingURL=csvQueue.js.map