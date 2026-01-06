import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import logger from './logger';
import { env } from './env';

if (!admin.apps.length) {
  try {
    // Prefer local service account key if present (not for commit)
    const serviceAccountPath = path.join(__dirname, '..', '..', 'serviceAccountKey.json');
    const hasServiceAccount = fs.existsSync(serviceAccountPath);

    const credential = hasServiceAccount
      ? admin.credential.cert(require(serviceAccountPath))
      : admin.credential.cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY,
        });

    admin.initializeApp({ credential });
    logger.info('✅ Firebase Admin initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize Firebase:', error);
    throw new Error('Firebase initialization failed');
  }
}

export const auth = admin.auth();
export { admin };

