import { Queue, Job } from "bullmq";
import { getRedisConnection } from "../config/redis";
import logger from "../config/logger";

// Lazy initialization - only create queue when needed and Redis is configured
let csvQueueInstance: Queue | null = null;

function getCsvQueue(): Queue {
  if (csvQueueInstance) {
    return csvQueueInstance;
  }

  // FORCE DISABLE REDIS QUEUE
  throw new Error(
    "Redis Queue is manually disabled. Using synchronous processing.",
  );

  // Check if Redis is configured
  // if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
  //   throw new Error('Redis not configured. Set REDIS_HOST or REDIS_URL to use CSV queue.');
  // }

  // try {
  //   const connection = getRedisConnection();

  //   csvQueueInstance = new Queue('csv-processing', {
  //     connection: connection as any, // BullMQ accepts both string URL and connection object
  //     defaultJobOptions: {
  //       attempts: 3,
  //       backoff: {
  //         type: 'exponential',
  //         delay: 2000, // 2 seconds, then 4, then 8
  //       },
  //       removeOnComplete: {
  //         age: 24 * 3600, // Keep completed jobs for 24 hours
  //         count: 1000, // Keep max 1000 completed jobs
  //       },
  //       removeOnFail: {
  //         age: 7 * 24 * 3600, // Keep failed jobs for 7 days
  //       },
  //     },
  //   });

  //   // Queue event listeners
  //   csvQueueInstance.on('error', (error: Error) => {
  //     logger.error('CSV Queue error:', error);
  //   });

  //   csvQueueInstance.on('waiting', (job: Job) => {
  //     logger.info(`CSV job ${job.id} is waiting`);
  //   });

  //   logger.info('✅ CSV queue initialized successfully');
  //   return csvQueueInstance;
  // } catch (error: any) {
  //   logger.error('Failed to create CSV queue:', error);
  //   throw error;
  // }
}

// Export queue with lazy initialization
export const csvQueue = {
  get: getCsvQueue,
  add: (...args: Parameters<Queue["add"]>) => getCsvQueue().add(...args),
  getJob: (jobId: string) => getCsvQueue().getJob(jobId),
};

export default csvQueue;
