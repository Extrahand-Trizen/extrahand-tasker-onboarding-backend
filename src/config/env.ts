import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('4006'),
  MONGODB_URI: z.string().url(),
  MONGO_DB: z.string().default('extrahand'),
  FIREBASE_PROJECT_ID: z.string(),
  FIREBASE_PRIVATE_KEY: z.string().transform((val) => val.replace(/\\n/g, '\n')),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  SERVICE_AUTH_TOKEN: z.string().min(32),
  USER_SERVICE_URL: z.string().url(),
  VERIFICATION_SERVICE_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export const env = envSchema.parse(process.env);

