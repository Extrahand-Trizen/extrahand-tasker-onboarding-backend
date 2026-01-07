import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('4006'),
  MONGODB_URI: z.string().url(),
  MONGO_DB: z.string().default('extrahand'),
  FIREBASE_PROJECT_ID: z.string(),
  FIREBASE_PRIVATE_KEY: z.string().transform((val) => {
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
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  SERVICE_AUTH_TOKEN: z.string().min(32),
  USER_SERVICE_URL: z.string().url().optional(),
  VERIFICATION_SERVICE_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  // Storage Configuration
  STORAGE_PROVIDER: z.enum(['minio', 's3']).default('minio'),
  // MinIO Configuration
  MINIO_ENDPOINT: z.string().optional(),
  MINIO_PORT: z.string().optional(),
  MINIO_USE_SSL: z.string().optional(),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_ROOT_USER: z.string().optional(),
  MINIO_ROOT_PASSWORD: z.string().optional(),
  MINIO_BUCKET_NAME: z.string().default('extrahand-onboarding-documents'),
  MINIO_PUBLIC_DOMAIN: z.string().optional(),
  MINIO_SERVER_URL: z.string().url().optional(),
  MINIO_REGION_NAME: z.string().optional(),
  // AWS S3 Configuration (optional)
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET_NAME: z.string().default('extrahand-onboarding-documents'),
  AWS_CLOUDFRONT_DOMAIN: z.string().optional(),
});

export const env = envSchema.parse(process.env);

