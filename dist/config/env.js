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
    FIREBASE_PRIVATE_KEY: zod_1.z.string().transform((val) => val.replace(/\\n/g, '\n')),
    FIREBASE_CLIENT_EMAIL: zod_1.z.string().email(),
    SERVICE_AUTH_TOKEN: zod_1.z.string().min(32),
    USER_SERVICE_URL: zod_1.z.string().url(),
    VERIFICATION_SERVICE_URL: zod_1.z.string().url().optional(),
    LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});
exports.env = envSchema.parse(process.env);
//# sourceMappingURL=env.js.map