/**
 * Storage Manager
 *
 * Factory/Manager for storage providers
 * Allows easy switching between MinIO, AWS S3, and other storage providers
 */
import { StorageInterface } from './StorageInterface';
export declare const STORAGE_TYPES: {
    readonly MINIO: "minio";
    readonly S3: "s3";
};
/**
 * Get or create storage instance
 */
declare function getStorage(): StorageInterface;
/**
 * Reset storage instance (useful for testing or reconfiguration)
 */
declare function resetStorage(): void;
/**
 * Upload file to storage
 */
export declare function uploadFile(fileBuffer: Buffer, fileName: string, contentType: string, folder?: string, metadata?: any): Promise<{
    url: string;
    key: string;
    bucket?: string;
}>;
/**
 * Delete file from storage
 */
export declare function deleteFile(key: string): Promise<boolean>;
/**
 * Get public URL for a file
 */
export declare function getFileUrl(key: string): string;
/**
 * Generate presigned URL for direct upload
 */
export declare function getPresignedUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>;
/**
 * Health check for storage
 */
export declare function healthCheck(): Promise<boolean>;
export declare function getStorageType(): string;
export { getStorage, resetStorage };
//# sourceMappingURL=storageManager.d.ts.map