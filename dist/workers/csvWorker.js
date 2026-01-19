"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.csvWorker = void 0;
const bullmq_1 = require("bullmq");
const BulkLeadImportService_1 = require("../services/BulkLeadImportService");
const logger_1 = __importDefault(require("../config/logger"));
const promises_1 = __importDefault(require("fs/promises"));
const redis_1 = require("../config/redis");
// Only create worker if Redis is configured
let csvWorkerInstance = null;
function getCsvWorker() {
    if (csvWorkerInstance) {
        return csvWorkerInstance;
    }
    // Check if Redis is configured
    if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
        logger_1.default.warn("⚠️  CSV worker not started - Redis not configured");
        return null;
    }
    try {
        const connection = (0, redis_1.getRedisConnection)();
        // Log connection details (mask sensitive info)
        if (typeof connection === 'string') {
            logger_1.default.info('Creating CSV worker with Redis URL', {
                connection: connection.replace(/:[^:@]+@/, ':*****@'), // Mask password
            });
        }
        else {
            logger_1.default.info('Creating CSV worker with Redis config', {
                host: connection.host,
                port: connection.port,
                hasPassword: !!connection.password,
            });
        }
        csvWorkerInstance = new bullmq_1.Worker("csv-processing", async (job) => {
            const { filePath, fileName, userId, adminName, adminEmail, adminRole, source, primaryCategory, secondaryCategory, } = job.data;
            try {
                // Update progress - job started
                await job.updateProgress(0);
                logger_1.default.info(`Processing CSV job ${job.id}`, {
                    userId,
                    fileName,
                    filePath,
                });
                // Read file from disk
                const fileBuffer = await promises_1.default.readFile(filePath);
                logger_1.default.info(`File read successfully`, {
                    jobId: job.id,
                    fileSize: fileBuffer.length,
                });
                // Process CSV with progress tracking
                // The service will call this callback to update progress
                const progressCallback = async (progress, message) => {
                    await job.updateProgress(progress);
                    logger_1.default.debug(`CSV job ${job.id} progress: ${progress}% - ${message}`);
                };
                const result = await BulkLeadImportService_1.BulkLeadImportService.bulkImportLeads(fileBuffer, fileName, userId, adminName, adminEmail, adminRole, source, primaryCategory, secondaryCategory, progressCallback);
                // Final progress update
                await job.updateProgress(100);
                logger_1.default.info(`CSV job ${job.id} completed successfully`, {
                    jobId: job.id,
                    successCount: result.successCount,
                    failedCount: result.failedCount,
                    importId: result.importId,
                });
                // Clean up temp file
                try {
                    await promises_1.default.unlink(filePath);
                    logger_1.default.debug(`Temp file deleted: ${filePath}`);
                }
                catch (cleanupError) {
                    logger_1.default.warn("Failed to cleanup temp file:", {
                        filePath,
                        error: cleanupError.message,
                    });
                }
                return {
                    success: true,
                    result,
                };
            }
            catch (error) {
                logger_1.default.error(`CSV job ${job.id} failed:`, {
                    error: error.message,
                    stack: error.stack,
                    jobId: job.id,
                    userId,
                    fileName,
                });
                // Clean up temp file on error
                try {
                    await promises_1.default.unlink(filePath);
                }
                catch (cleanupError) {
                    logger_1.default.warn("Failed to cleanup temp file after error:", {
                        filePath,
                        error: cleanupError.message,
                    });
                }
                throw error;
            }
        }, {
            connection: connection, // BullMQ accepts both string URL and connection object
            concurrency: 2, // Process 2 CSV files concurrently
            limiter: {
                max: 5, // Max 5 jobs
                duration: 60000, // Per minute
            },
        });
        // Worker event listeners
        csvWorkerInstance.on("completed", (job) => {
            logger_1.default.info(`CSV worker completed job ${job.id}`);
        });
        csvWorkerInstance.on("failed", (job, err) => {
            logger_1.default.error(`CSV worker failed job ${job?.id}:`, {
                error: err.message,
                stack: err.stack,
            });
        });
        csvWorkerInstance.on("error", (err) => {
            logger_1.default.error("CSV worker error:", err);
        });
        logger_1.default.info("✅ CSV worker started successfully");
        return csvWorkerInstance;
    }
    catch (error) {
        logger_1.default.error("Failed to create CSV worker:", error);
        return null;
    }
}
// Initialize worker on module load (if Redis is configured)
if (process.env.REDIS_HOST || process.env.REDIS_URL) {
    getCsvWorker();
}
exports.csvWorker = getCsvWorker();
exports.default = exports.csvWorker;
//# sourceMappingURL=csvWorker.js.map