import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import logger from './logger';
import { env } from './env';

if (!admin.apps.length) {
  try {
    // Always use environment variables for Firebase credentials
    // Validate required environment variables
    if (!env.FIREBASE_PROJECT_ID) {
      throw new Error('FIREBASE_PROJECT_ID environment variable is required');
    }
    if (!env.FIREBASE_CLIENT_EMAIL) {
      throw new Error('FIREBASE_CLIENT_EMAIL environment variable is required');
    }
    if (!env.FIREBASE_PRIVATE_KEY) {
      throw new Error('FIREBASE_PRIVATE_KEY environment variable is required');
    }

    // Validate private key format
    const privateKey = env.FIREBASE_PRIVATE_KEY;
    if (!privateKey.includes('BEGIN PRIVATE KEY') && !privateKey.includes('BEGIN RSA PRIVATE KEY')) {
      logger.error('❌ Invalid Firebase private key format. Key must include BEGIN/END markers.');
      throw new Error('Invalid Firebase private key format - must include BEGIN/END markers');
    }

    const credential = admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    });

    admin.initializeApp({ credential });
    logger.info('✅ Firebase Admin initialized from environment variables', {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: true,
    });
  } catch (error: any) {
    logger.error('❌ Failed to initialize Firebase:', {
      error: error.message,
      stack: error.stack,
      projectId: env.FIREBASE_PROJECT_ID || 'NOT SET',
      clientEmail: env.FIREBASE_CLIENT_EMAIL || 'NOT SET',
      hasPrivateKey: !!env.FIREBASE_PRIVATE_KEY,
      privateKeyLength: env.FIREBASE_PRIVATE_KEY?.length || 0,
    });
    throw new Error(`Firebase initialization failed: ${error.message}`);
  }
}

export const auth = admin.auth();
export { admin };

