/**
 * MinIO Storage Provider for CapRover
 *
 * Implements storage interface using MinIO (S3-compatible object storage)
 * Specifically configured for CapRover-deployed MinIO instances
 *
 * NOTE: Uses AWS SDK because MinIO implements the S3 API (S3-compatible)
 */
import { BaseStorage } from './StorageInterface';
export declare class MinIOStorage extends BaseStorage {
    private s3;
    private endpoint;
    private accessKeyId;
    private secretAccessKey;
    private bucketName;
    private publicDomain?;
    private region;
    constructor(config?: any);
    /**
     * Ensure bucket exists, create if it doesn't
     */
    private ensureBucketExists;
    /**
     * Ensure bucket has public read policy
     */
    private ensureBucketPolicy;
    /**
     * Upload file to MinIO
     */
    uploadFile(fileBuffer: Buffer, fileName: string, contentType: string, folder?: string, metadata?: any): Promise<{
        url: string;
        key: string;
        bucket?: string;
    }>;
    /**
     * Delete file from MinIO
     */
    deleteFile(key: string): Promise<boolean>;
    /**
     * Get public URL for a file
     */
    getFileUrl(key: string): string;
    /**
     * Generate presigned URL for reading a file (GET)
     */
    private getPresignedReadUrl;
    /**
     * Generate presigned URL for direct upload (PUT)
     */
    getPresignedUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>;
    /**
     * Health check - verify MinIO is accessible and bucket exists
     */
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=MinIOStorage.d.ts.map