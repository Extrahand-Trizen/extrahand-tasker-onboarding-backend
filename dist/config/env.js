"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.string().transform(Number).default('4006'),
    MONGODB_URI: zod_1.z.string().url(),
    MONGO_DB: zod_1.z.string().default('extrahand'),
    FIREBASE_PROJECT_ID: zod_1.z.string(),
    FIREBASE_PRIVATE_KEY: zod_1.z.string().transform((val) => {
        // Handle both escaped newlines (\\n) and actual newlines
        // Also ensure the key has proper BEGIN/END markers
        let processed = val.replace(/\\n/g, '\n');
        // If key doesn't have newlines but has \n, try to replace them
        if (!processed.includes('\n') && processed.includes('\\n')) {
            processed = processed.replace(/\\n/g, '\n');
        }
        // Validate key format
        if (!processed.includes('BEGIN') || !processed.includes('END')) {
            throw new Error('FIREBASE_PRIVATE_KEY must include BEGIN and END markers');
        }
        return processed;
    }),
    FIREBASE_CLIENT_EMAIL: zod_1.z.string().email(),
    SERVICE_AUTH_TOKEN: zod_1.z.string().min(32),
    USER_SERVICE_URL: zod_1.z.string().url().optional(),
    VERIFICATION_SERVICE_URL: zod_1.z.string().url().optional(),
    LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    // Storage Configuration
    STORAGE_PROVIDER: zod_1.z.enum(['minio', 's3']).default('minio'),
    // MinIO Configuration
    MINIO_ENDPOINT: zod_1.z.string().optional(),
    MINIO_PORT: zod_1.z.string().optional(),
    MINIO_USE_SSL: zod_1.z.string().optional(),
    MINIO_ACCESS_KEY: zod_1.z.string().optional(),
    MINIO_SECRET_KEY: zod_1.z.string().optional(),
    MINIO_ROOT_USER: zod_1.z.string().optional(),
    MINIO_ROOT_PASSWORD: zod_1.z.string().optional(),
    MINIO_BUCKET_NAME: zod_1.z.string().default('extrahand-onboarding-documents'),
    MINIO_PUBLIC_DOMAIN: zod_1.z.string().optional(),
    MINIO_SERVER_URL: zod_1.z.string().url().optional(),
    MINIO_REGION_NAME: zod_1.z.string().optional(),
    // AWS S3 Configuration (optional)
    AWS_REGION: zod_1.z.string().default('us-east-1'),
    AWS_ACCESS_KEY_ID: zod_1.z.string().optional(),
    AWS_SECRET_ACCESS_KEY: zod_1.z.string().optional(),
    AWS_S3_BUCKET_NAME: zod_1.z.string().default('extrahand-onboarding-documents'),
    AWS_CLOUDFRONT_DOMAIN: zod_1.z.string().optional(),
});
exports.env = envSchema.parse(process.env);
//# sourceMappingURL=env.js.map