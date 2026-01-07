"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.admin = exports.auth = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
exports.admin = firebase_admin_1.default;
const logger_1 = __importDefault(require("./logger"));
const env_1 = require("./env");
if (!firebase_admin_1.default.apps.length) {
    try {
        // Always use environment variables for Firebase credentials
        // Validate required environment variables
        if (!env_1.env.FIREBASE_PROJECT_ID) {
            throw new Error('FIREBASE_PROJECT_ID environment variable is required');
        }
        if (!env_1.env.FIREBASE_CLIENT_EMAIL) {
            throw new Error('FIREBASE_CLIENT_EMAIL environment variable is required');
        }
        if (!env_1.env.FIREBASE_PRIVATE_KEY) {
            throw new Error('FIREBASE_PRIVATE_KEY environment variable is required');
        }
        // Validate private key format
        const privateKey = env_1.env.FIREBASE_PRIVATE_KEY;
        if (!privateKey.includes('BEGIN PRIVATE KEY') && !privateKey.includes('BEGIN RSA PRIVATE KEY')) {
            logger_1.default.error('❌ Invalid Firebase private key format. Key must include BEGIN/END markers.');
            throw new Error('Invalid Firebase private key format - must include BEGIN/END markers');
        }
        const credential = firebase_admin_1.default.credential.cert({
            projectId: env_1.env.FIREBASE_PROJECT_ID,
            clientEmail: env_1.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
        });
        firebase_admin_1.default.initializeApp({ credential });
        logger_1.default.info('✅ Firebase Admin initialized from environment variables', {
            projectId: env_1.env.FIREBASE_PROJECT_ID,
            clientEmail: env_1.env.FIREBASE_CLIENT_EMAIL,
            hasPrivateKey: true,
        });
    }
    catch (error) {
        logger_1.default.error('❌ Failed to initialize Firebase:', {
            error: error.message,
            stack: error.stack,
            projectId: env_1.env.FIREBASE_PROJECT_ID || 'NOT SET',
            clientEmail: env_1.env.FIREBASE_CLIENT_EMAIL || 'NOT SET',
            hasPrivateKey: !!env_1.env.FIREBASE_PRIVATE_KEY,
            privateKeyLength: env_1.env.FIREBASE_PRIVATE_KEY?.length || 0,
        });
        throw new Error(`Firebase initialization failed: ${error.message}`);
    }
}
exports.auth = firebase_admin_1.default.auth();
//# sourceMappingURL=firebase.js.map