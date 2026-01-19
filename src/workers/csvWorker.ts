import { Worker, Job } from "bullmq";
import { BulkLeadImportService } from "../services/BulkLeadImportService";
import logger from "../config/logger";
import fs from "fs/promises";
import path from "path";
import { getRedisConnection } from "../config/redis";

interface CSVJobData {
  filePath: string;
  fileName: string;
  userId: string;
  adminName?: string;
  adminEmail?: string;
  adminRole?: "qualifier" | "onboarder" | "lead_access_manager";
  source?: string;
  primaryCategory?: string;
  secondaryCategory?: string;
}

// Only create worker if Redis is configured
let csvWorkerInstance: Worker | null = null;

function getCsvWorker(): Worker | null {
  if (csvWorkerInstance) {
    return csvWorkerInstance;
  }

  // FORCE DISABLE WORKER
  logger.warn("⚠️  CSV worker manually disabled");
  return null;

  // Check if Redis is configured
  // if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
  //   logger.warn("⚠️  CSV worker not started - Redis not configured");
  //   return null;
  // }

  // try {
  //   const connection = getRedisConnection();

  //   // Log connection details (mask sensitive info)
  //   if (typeof connection === 'string') {
  //     logger.info('Creating CSV worker with Redis URL', {
  //       connection: connection.replace(/:[^:@]+@/, ':*****@'), // Mask password
  //     });
  //   } else {
  //     logger.info('Creating CSV worker with Redis config', {
  //       host: connection.host,
  //       port: connection.port,
  //       hasPassword: !!connection.password,
  //     });
  //   }

  //   csvWorkerInstance = new Worker(
  //     "csv-processing",
  //     async (job: Job<CSVJobData>) => {
  //       const {
  //         filePath,
  //         fileName,
  //         userId,
  //         adminName,
  //         adminEmail,
  //         adminRole,
  //         source,
  //         primaryCategory,
  //         secondaryCategory,
  //       } = job.data;

  //       try {
  //         // Update progress - job started
  //         await job.updateProgress(0);

  //         logger.info(`Processing CSV job ${job.id}`, {
  //           userId,
  //           fileName,
  //           filePath,
  //         });

  //         // Read file from disk
  //         const fileBuffer = await fs.readFile(filePath);

  //         logger.info(`File read successfully`, {
  //           jobId: job.id,
  //           fileSize: fileBuffer.length,
  //         });

  //         // Process CSV with progress tracking
  //         // The service will call this callback to update progress
  //         const progressCallback = async (
  //           progress: number,
  //           message: string
  //         ) => {
  //           await job.updateProgress(progress);
  //           logger.debug(
  //             `CSV job ${job.id} progress: ${progress}% - ${message}`
  //           );
  //         };

  //         const result = await BulkLeadImportService.bulkImportLeads(
  //           fileBuffer,
  //           fileName,
  //           userId,
  //           adminName,
  //           adminEmail,
  //           adminRole as any,
  //           source as any,
  //           primaryCategory,
  //           secondaryCategory,
  //           progressCallback
  //         );

  //         // Final progress update
  //         await job.updateProgress(100);

  //         logger.info(`CSV job ${job.id} completed successfully`, {
  //           jobId: job.id,
  //           successCount: result.successCount,
  //           failedCount: result.failedCount,
  //           importId: result.importId,
  //         });

  //         // Clean up temp file
  //         try {
  //           await fs.unlink(filePath);
  //           logger.debug(`Temp file deleted: ${filePath}`);
  //         } catch (cleanupError: any) {
  //           logger.warn("Failed to cleanup temp file:", {
  //             filePath,
  //             error: cleanupError.message,
  //           });
  //         }

  //         return {
  //           success: true,
  //           result,
  //         };
  //       } catch (error: any) {
  //         logger.error(`CSV job ${job.id} failed:`, {
  //           error: error.message,
  //           stack: error.stack,
  //           jobId: job.id,
  //           userId,
  //           fileName,
  //         });

  //         // Clean up temp file on error
  //         try {
  //           await fs.unlink(filePath);
  //         } catch (cleanupError: any) {
  //           logger.warn("Failed to cleanup temp file after error:", {
  //             filePath,
  //             error: cleanupError.message,
  //           });
  //         }

  //         throw error;
  //       }
  //     },
  //     {
  //       connection: connection as any, // BullMQ accepts both string URL and connection object
  //       concurrency: 2, // Process 2 CSV files concurrently
  //       limiter: {
  //         max: 5, // Max 5 jobs
  //         duration: 60000, // Per minute
  //       },
  //     }
  //   );

  //   // Worker event listeners
  //   csvWorkerInstance.on("completed", (job) => {
  //     logger.info(`CSV worker completed job ${job.id}`);
  //   });

  //   csvWorkerInstance.on("failed", (job, err) => {
  //     logger.error(`CSV worker failed job ${job?.id}:`, {
  //       error: err.message,
  //       stack: err.stack,
  //       });
  //   });

  //   csvWorkerInstance.on("error", (err) => {
  //     logger.error("CSV worker error:", err);
  //   });

  //   logger.info("✅ CSV worker started successfully");
  //   return csvWorkerInstance;
  // } catch (error: any) {
  //   logger.error("Failed to create CSV worker:", error);
  //   return null;
  // }
}

// Initialize worker on module load (if Redis is configured)
if (process.env.REDIS_HOST || process.env.REDIS_URL) {
  getCsvWorker();
}

export const csvWorker = getCsvWorker();
export default csvWorker;
