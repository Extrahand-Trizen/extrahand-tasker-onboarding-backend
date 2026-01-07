"use strict";
/**
 * MinIO Storage Provider for CapRover
 *
 * Implements storage interface using MinIO (S3-compatible object storage)
 * Specifically configured for CapRover-deployed MinIO instances
 *
 * NOTE: Uses AWS SDK because MinIO implements the S3 API (S3-compatible)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinIOStorage = void 0;
const AWS = __importStar(require("aws-sdk"));
const logger_1 = __importDefault(require("../../config/logger"));
const StorageInterface_1 = require("./StorageInterface");
class MinIOStorage extends StorageInterface_1.BaseStorage {
    constructor(config = {}) {
        super();
        // CapRover MinIO configuration
        // Use ONLY the MINIO_ENDPOINT environment variable - no fallbacks or defaults
        const rawEndpoint = process.env.MINIO_ENDPOINT;
        if (!rawEndpoint) {
            logger_1.default.error('❌ MINIO_ENDPOINT environment variable is required but not set');
            throw new Error('MINIO_ENDPOINT environment variable is required');
        }
        // Parse the endpoint URL directly
        let endpointUrl;
        try {
            // If it doesn't have protocol, add http://
            const endpointToParse = rawEndpoint.includes('://') ? rawEndpoint : `http://${rawEndpoint}`;
            endpointUrl = new URL(endpointToParse);
        }
        catch (e) {
            logger_1.default.error('❌ Invalid MINIO_ENDPOINT format', { rawEndpoint, error: e.message });
            throw new Error(`Invalid MINIO_ENDPOINT format: ${rawEndpoint}`);
        }
        // Construct endpoint string properly: protocol://hostname:port (avoid toString() which can cause issues)
        const port = endpointUrl.port || (endpointUrl.protocol === 'https:' ? '443' : '80');
        const protocol = endpointUrl.protocol.replace(':', '');
        this.endpoint = port && port !== '80' && port !== '443'
            ? `${protocol}://${endpointUrl.hostname}:${port}`
            : `${protocol}://${endpointUrl.hostname}`;
        logger_1.default.info('✅ Using MinIO endpoint directly from MINIO_ENDPOINT', {
            MINIO_ENDPOINT: rawEndpoint,
            finalEndpoint: this.endpoint,
            hostname: endpointUrl.hostname,
            port: endpointUrl.port || (endpointUrl.protocol === 'https:' ? '443' : '80'),
            protocol: endpointUrl.protocol.replace(':', '')
        });
        // Support both MINIO_ACCESS_KEY and MINIO_ROOT_USER (CapRover uses MINIO_ROOT_USER)
        this.accessKeyId = config.accessKeyId || process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || '';
        // Support both MINIO_SECRET_KEY and MINIO_ROOT_PASSWORD (CapRover uses MINIO_ROOT_PASSWORD)
        this.secretAccessKey = config.secretAccessKey || process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '';
        this.bucketName = config.bucketName || process.env.MINIO_BUCKET_NAME || 'extrahand-onboarding-documents';
        // MINIO_SERVER_URL is for public domain (used only for generating public URLs, NOT for connections)
        // This should be the public-facing URL, separate from the internal endpoint
        const serverUrl = process.env.MINIO_SERVER_URL;
        if (serverUrl) {
            try {
                const url = new URL(serverUrl);
                this.publicDomain = url.hostname;
                logger_1.default.info('Using MINIO_SERVER_URL for public domain', { publicDomain: this.publicDomain });
            }
            catch (e) {
                this.publicDomain = config.publicDomain || process.env.MINIO_PUBLIC_DOMAIN;
            }
        }
        else {
            this.publicDomain = config.publicDomain || process.env.MINIO_PUBLIC_DOMAIN;
        }
        // Log info if endpoint looks like a public domain (common for local development)
        if (this.endpoint.includes('.apps.') || this.endpoint.includes('.extrahand.in')) {
            logger_1.default.info('ℹ️ Using public domain for MinIO endpoint (suitable for local development)', {
                endpoint: this.endpoint,
                note: 'For production/CapRover, consider using internal service name: srv-captain--taskeronboardingminio:9000'
            });
        }
        // Support MINIO_REGION_NAME from CapRover, fallback to us-east-1
        this.region = config.region || process.env.MINIO_REGION_NAME || 'us-east-1';
        // Validate required configuration
        if (!this.accessKeyId || !this.secretAccessKey) {
            logger_1.default.warn('⚠️ MinIO credentials not configured. Storage operations will fail.');
        }
        // Parse endpoint to extract host and port for AWS SDK (reuse endpointUrl from above)
        const endpointHost = endpointUrl.hostname;
        // Extract port - if not in URL, use default based on protocol
        let endpointPort = endpointUrl.port;
        if (!endpointPort) {
            endpointPort = endpointUrl.protocol === 'https:' ? '443' : '80';
        }
        // Initialize S3 client (MinIO is S3-compatible)
        // Manually construct endpoint with explicit host and port to avoid parsing issues
        const awsEndpoint = new AWS.Endpoint(endpointHost);
        awsEndpoint.port = parseInt(endpointPort, 10);
        awsEndpoint.protocol = endpointUrl.protocol.replace(':', '');
        logger_1.default.info('AWS S3 client endpoint configuration', {
            endpoint: this.endpoint,
            endpointHost,
            endpointPort,
            awsEndpointHost: awsEndpoint.host,
            awsEndpointPort: awsEndpoint.port,
            awsEndpointProtocol: awsEndpoint.protocol
        });
        this.s3 = new AWS.S3({
            endpoint: awsEndpoint,
            accessKeyId: this.accessKeyId,
            secretAccessKey: this.secretAccessKey,
            s3ForcePathStyle: true, // Required for MinIO
            signatureVersion: 'v4',
            region: this.region,
        });
        logger_1.default.info('✅ CapRover MinIO Storage initialized', {
            endpoint: this.endpoint,
            bucket: this.bucketName,
            publicDomain: this.publicDomain || 'using endpoint',
            region: this.region,
        });
        // Ensure bucket exists on initialization
        this.ensureBucketExists().catch(error => {
            logger_1.default.warn('⚠️ Could not ensure bucket exists during initialization:', error.message);
        });
    }
    /**
     * Ensure bucket exists, create if it doesn't
     */
    async ensureBucketExists() {
        try {
            if (!this.accessKeyId || !this.secretAccessKey) {
                throw new Error('MinIO credentials not configured');
            }
            // Check if bucket exists
            try {
                await this.s3.headBucket({ Bucket: this.bucketName }).promise();
                // Bucket exists - ensure public read policy is set
                await this.ensureBucketPolicy();
                logger_1.default.debug(`✅ Bucket '${this.bucketName}' exists - ready for uploads`);
                return true;
            }
            catch (headError) {
                // Bucket doesn't exist (404/NotFound) - proceed to create it
                if (headError.statusCode === 404 || headError.code === 'NotFound') {
                    try {
                        logger_1.default.info(`📦 Bucket '${this.bucketName}' not found. Creating it...`);
                        await this.s3.createBucket({ Bucket: this.bucketName }).promise();
                        // Set bucket policy for public read access
                        await this.ensureBucketPolicy();
                        logger_1.default.info(`✅ Bucket '${this.bucketName}' created successfully - ready for uploads`);
                        return true;
                    }
                    catch (createError) {
                        // Handle race condition: bucket might have been created by another request
                        if (createError.code === 'BucketAlreadyOwnedByYou' ||
                            createError.code === 'BucketAlreadyExists' ||
                            createError.message.includes('already own it') ||
                            createError.message.includes('already exists')) {
                            logger_1.default.debug(`✅ Bucket '${this.bucketName}' exists (created by concurrent request) - ready for uploads`);
                            return true;
                        }
                        logger_1.default.error('Error creating bucket:', {
                            error: createError.message,
                            code: createError.code,
                            bucket: this.bucketName,
                        });
                        throw createError;
                    }
                }
                throw headError;
            }
        }
        catch (error) {
            // Extract detailed error information
            const errorMessage = error?.message ||
                error?.error?.message ||
                error?.code ||
                (error?.statusCode ? `HTTP ${error.statusCode}` : null) ||
                String(error) ||
                'Unknown error';
            // Get more details from AWS SDK error
            const awsErrorDetails = {
                message: error?.message,
                code: error?.code,
                statusCode: error?.statusCode,
                requestId: error?.requestId,
                cfId: error?.cfId,
                extendedRequestId: error?.extendedRequestId,
                region: error?.region
            };
            const errorDetails = {
                message: errorMessage,
                code: error?.code || error?.error?.code,
                statusCode: error?.statusCode || error?.error?.statusCode,
                name: error?.name,
                bucket: this.bucketName,
                endpoint: this.endpoint,
                awsError: awsErrorDetails,
                fullError: error
            };
            logger_1.default.error('Failed to ensure bucket exists:', errorDetails);
            // Provide more helpful error message
            const userMessage = error?.code === 'BadRequest'
                ? `BadRequest: ${error?.message || 'Invalid request to MinIO. Check bucket name format and credentials.'}`
                : errorMessage;
            throw new Error(`Failed to ensure bucket exists: ${userMessage}`);
        }
    }
    /**
     * Ensure bucket has public read policy
     */
    async ensureBucketPolicy() {
        try {
            const bucketPolicy = {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: { AWS: ['*'] },
                        Action: ['s3:GetObject'],
                        Resource: [`arn:aws:s3:::${this.bucketName}/*`],
                    },
                ],
            };
            await this.s3.putBucketPolicy({
                Bucket: this.bucketName,
                Policy: JSON.stringify(bucketPolicy),
            }).promise();
            logger_1.default.debug(`✅ Bucket policy set for public read access on '${this.bucketName}'`);
        }
        catch (policyError) {
            // Log but don't fail - policy might already be set or might require admin access
            if (policyError.code !== 'MalformedPolicy' && !policyError.message.includes('already exists')) {
                logger_1.default.warn(`⚠️ Could not set bucket policy (may need manual configuration): ${policyError.message}`);
            }
        }
    }
    /**
     * Upload file to MinIO
     */
    async uploadFile(fileBuffer, fileName, contentType, folder = 'uploads', metadata = {}) {
        try {
            if (!this.accessKeyId || !this.secretAccessKey) {
                throw new Error('MinIO credentials not configured');
            }
            // Try to ensure bucket exists, but don't fail if it doesn't work
            // The upload itself will fail with a clearer error if the bucket doesn't exist
            try {
                await this.ensureBucketExists();
            }
            catch (bucketError) {
                logger_1.default.warn('⚠️ Bucket check failed, proceeding with upload anyway', {
                    error: bucketError.message,
                    code: bucketError.code,
                    bucket: this.bucketName,
                    note: 'Upload will fail if bucket does not exist'
                });
            }
            // Sanitize file name
            const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const timestamp = Date.now();
            const key = `${folder}/${timestamp}_${sanitizedFileName}`;
            const params = {
                Bucket: this.bucketName,
                Key: key,
                Body: fileBuffer,
                ContentType: contentType,
                Metadata: {
                    uploadedAt: new Date().toISOString(),
                    originalFileName: fileName,
                    ...metadata,
                },
            };
            await this.s3.upload(params).promise();
            // Generate presigned read URL (valid for 1 year) for secure access
            let url;
            try {
                url = await this.getPresignedReadUrl(key, 31536000); // 1 year expiry
                logger_1.default.debug('Using presigned read URL for uploaded file');
            }
            catch (presignedError) {
                // Fallback to public URL if presigned fails
                logger_1.default.warn('Could not generate presigned URL, using public URL:', presignedError.message);
                url = this.getFileUrl(key);
            }
            logger_1.default.info('File uploaded to MinIO', {
                key,
                bucket: this.bucketName,
                url,
                size: fileBuffer.length,
            });
            return {
                url,
                key,
                bucket: this.bucketName,
            };
        }
        catch (error) {
            // Extract error message from various possible error formats
            const errorMessage = error?.message ||
                error?.error?.message ||
                error?.code ||
                error?.statusCode ? `HTTP ${error.statusCode}` :
                String(error) ||
                    'Unknown error';
            // Try to get response body if available (for debugging)
            const responseBody = error?.response?.body || error?.body || error?.data;
            logger_1.default.error('Error uploading file to MinIO:', {
                error: errorMessage,
                code: error?.code,
                statusCode: error?.statusCode,
                endpoint: this.endpoint,
                bucket: this.bucketName,
                accessKeyId: this.accessKeyId ? `${this.accessKeyId.substring(0, 8)}...` : '(not set)',
                hasSecretKey: !!this.secretAccessKey,
                responseBody: responseBody ? (typeof responseBody === 'string' ? responseBody.substring(0, 500) : JSON.stringify(responseBody).substring(0, 500)) : undefined,
                fullError: {
                    code: error?.code,
                    statusCode: error?.statusCode,
                    message: error?.message,
                    name: error?.name
                }
            });
            // Provide more helpful error message
            if (error?.code === 'XMLParserError') {
                throw new Error(`MinIO returned invalid response (likely HTML instead of XML). Check endpoint URL and credentials. Original error: ${errorMessage}`);
            }
            throw new Error(`Failed to upload file to MinIO: ${errorMessage}`);
        }
    }
    /**
     * Delete file from MinIO
     */
    async deleteFile(key) {
        try {
            if (!this.accessKeyId || !this.secretAccessKey) {
                throw new Error('MinIO credentials not configured');
            }
            const params = {
                Bucket: this.bucketName,
                Key: key,
            };
            await this.s3.deleteObject(params).promise();
            logger_1.default.info('File deleted from MinIO', { key, bucket: this.bucketName });
            return true;
        }
        catch (error) {
            logger_1.default.error('Error deleting file from MinIO:', {
                error: error.message,
                key,
            });
            throw new Error(`Failed to delete file from MinIO: ${error.message}`);
        }
    }
    /**
     * Get public URL for a file
     */
    getFileUrl(key) {
        if (this.publicDomain) {
            // Use public domain if configured
            return `https://${this.publicDomain}/${this.bucketName}/${key}`;
        }
        // Fallback to endpoint URL (internal, may not be accessible from outside)
        const endpointUrl = this.endpoint.replace(/\/$/, ''); // Remove trailing slash
        return `${endpointUrl}/${this.bucketName}/${key}`;
    }
    /**
     * Generate presigned URL for reading a file (GET)
     */
    async getPresignedReadUrl(key, expiresIn = 3600) {
        try {
            if (!this.accessKeyId || !this.secretAccessKey) {
                throw new Error('MinIO credentials not configured');
            }
            const params = {
                Bucket: this.bucketName,
                Key: key,
                Expires: expiresIn,
            };
            const url = await this.s3.getSignedUrlPromise('getObject', params);
            return url;
        }
        catch (error) {
            logger_1.default.error('Error generating presigned read URL:', {
                error: error.message,
                key,
            });
            throw new Error(`Failed to generate presigned read URL: ${error.message}`);
        }
    }
    /**
     * Generate presigned URL for direct upload (PUT)
     */
    async getPresignedUploadUrl(key, contentType, expiresIn = 3600) {
        try {
            if (!this.accessKeyId || !this.secretAccessKey) {
                throw new Error('MinIO credentials not configured');
            }
            // Ensure bucket exists before generating URL
            await this.ensureBucketExists();
            const params = {
                Bucket: this.bucketName,
                Key: key,
                ContentType: contentType,
                Expires: expiresIn,
            };
            const url = await this.s3.getSignedUrlPromise('putObject', params);
            return url;
        }
        catch (error) {
            logger_1.default.error('Error generating presigned URL:', {
                error: error.message,
                key,
            });
            throw new Error(`Failed to generate presigned URL: ${error.message}`);
        }
    }
    /**
     * Health check - verify MinIO is accessible and bucket exists
     */
    async healthCheck() {
        try {
            if (!this.accessKeyId || !this.secretAccessKey) {
                return false;
            }
            // Try to ensure bucket exists (will create if needed)
            await this.ensureBucketExists();
            // Verify we can access the bucket
            await this.s3.headBucket({ Bucket: this.bucketName }).promise();
            return true;
        }
        catch (error) {
            logger_1.default.warn('MinIO health check failed:', error.message);
            return false;
        }
    }
}
exports.MinIOStorage = MinIOStorage;
//# sourceMappingURL=MinIOStorage.js.map