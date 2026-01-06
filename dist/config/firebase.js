"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.admin = exports.auth = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
exports.admin = firebase_admin_1.default;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const logger_1 = __importDefault(require("./logger"));
const env_1 = require("./env");
if (!firebase_admin_1.default.apps.length) {
    try {
        // Prefer local service account key if present (not for commit)
        const serviceAccountPath = path_1.default.join(__dirname, '..', '..', 'serviceAccountKey.json');
        const hasServiceAccount = fs_1.default.existsSync(serviceAccountPath);
        const credential = hasServiceAccount
            ? firebase_admin_1.default.credential.cert(require(serviceAccountPath))
            : firebase_admin_1.default.credential.cert({
                projectId: env_1.env.FIREBASE_PROJECT_ID,
                clientEmail: env_1.env.FIREBASE_CLIENT_EMAIL,
                privateKey: env_1.env.FIREBASE_PRIVATE_KEY,
            });
        firebase_admin_1.default.initializeApp({ credential });
        logger_1.default.info('✅ Firebase Admin initialized');
    }
    catch (error) {
        logger_1.default.error('❌ Failed to initialize Firebase:', error);
        throw new Error('Firebase initialization failed');
    }
}
exports.auth = firebase_admin_1.default.auth();
//# sourceMappingURL=firebase.js.map