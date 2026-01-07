"use strict";
/**
 * Storage Manager
 *
 * Factory/Manager for storage providers
 * Allows easy switching between MinIO, AWS S3, and other storage providers
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORAGE_TYPES = void 0;
exports.uploadFile = uploadFile;
exports.deleteFile = deleteFile;
exports.getFileUrl = getFileUrl;
exports.getPresignedUploadUrl = getPresignedUploadUrl;
exports.healthCheck = healthCheck;
exports.getStorageType = getStorageType;
exports.getStorage = getStorage;
exports.resetStorage = resetStorage;
const logger_1 = __importDefault(require("../../config/logger"));
const MinIOStorage_1 = require("./MinIOStorage");
const env_1 = require("../../config/env");
// Storage provider types
exports.STORAGE_TYPES = {
    MINIO: 'minio',
    S3: 's3',
};
// Get storage provider type from environment (internal function)
function getStorageTypeInternal() {
    const provider = env_1.env.STORAGE_PROVIDER?.toLowerCase();
    if (provider && Object.values(exports.STORAGE_TYPES).includes(provider)) {
        return provider;
    }
    // Default to MinIO
    return exports.STORAGE_TYPES.MINIO;
}
// Initialize storage provider based on configuration
let storageInstance = null;
/**
 * Get or create storage instance
 */
function getStorage() {
    if (storageInstance) {
        return storageInstance;
    }
    const storageType = getStorageTypeInternal();
    logger_1.default.info(`📦 Initializing storage provider: ${storageType}`);
    switch (storageType) {
        case exports.STORAGE_TYPES.MINIO:
            logger_1.default.info('✅ Using CapRover MinIO storage (S3-compatible, uses AWS SDK for S3 API)');
            storageInstance = new MinIOStorage_1.MinIOStorage();
            break;
        case exports.STORAGE_TYPES.S3:
            // S3Storage can be added later if needed
            logger_1.default.warn('⚠️ S3 storage not yet implemented, falling back to MinIO');
            storageInstance = new MinIOStorage_1.MinIOStorage();
            break;
        default:
            logger_1.default.warn(`⚠️ Unknown storage provider: ${storageType}. Falling back to MinIO.`);
            storageInstance = new MinIOStorage_1.MinIOStorage();
    }
    // Perform health check
    storageInstance.healthCheck()
        .then(isHealthy => {
        if (isHealthy) {
            logger_1.default.info(`✅ Storage provider (${storageType}) is healthy`);
        }
        else {
            logger_1.default.warn(`⚠️ Storage provider (${storageType}) health check failed`);
        }
    })
        .catch(error => {
        logger_1.default.error(`❌ Storage provider (${storageType}) health check error:`, error);
    });
    return storageInstance;
}
/**
 * Reset storage instance (useful for testing or reconfiguration)
 */
function resetStorage() {
    storageInstance = null;
    logger_1.default.info('🔄 Storage instance reset');
}
/**
 * Upload file to storage
 */
async function uploadFile(fileBuffer, fileName, contentType, folder = 'uploads', metadata = {}) {
    const storage = getStorage();
    return await storage.uploadFile(fileBuffer, fileName, contentType, folder, metadata);
}
/**
 * Delete file from storage
 */
async function deleteFile(key) {
    const storage = getStorage();
    return await storage.deleteFile(key);
}
/**
 * Get public URL for a file
 */
function getFileUrl(key) {
    const storage = getStorage();
    return storage.getFileUrl(key);
}
/**
 * Generate presigned URL for direct upload
 */
async function getPresignedUploadUrl(key, contentType, expiresIn = 3600) {
    const storage = getStorage();
    return await storage.getPresignedUploadUrl(key, contentType, expiresIn);
}
/**
 * Health check for storage
 */
async function healthCheck() {
    const storage = getStorage();
    return await storage.healthCheck();
}
// Export getStorageType function
function getStorageType() {
    return getStorageTypeInternal();
}
//# sourceMappingURL=storageManager.js.map