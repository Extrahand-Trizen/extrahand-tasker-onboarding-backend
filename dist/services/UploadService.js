"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadService = void 0;
const storageManager_1 = require("../utils/storage/storageManager");
const logger_1 = __importDefault(require("../config/logger"));
class UploadService {
    /**
     * Upload document (image/pdf) and return URL/key.
     * Used for onboarding document uploads (Aadhaar, PAN, photos, etc.)
     */
    static async uploadDocument(adminUid, fileBuffer, filename, mimetype, docType = 'document', leadId) {
        if (!fileBuffer || !filename) {
            throw new Error('No file provided');
        }
        // Upload to storage (MinIO/S3)
        const result = await (0, storageManager_1.uploadFile)(fileBuffer, filename, mimetype, 'onboarding-documents', // folder name
        {
            adminUid,
            type: docType,
            leadId,
        });
        logger_1.default.info('Document uploaded', {
            adminUid,
            leadId,
            docType,
            url: result.url,
            key: result.key,
            provider: (0, storageManager_1.getStorageType)()
        });
        return {
            url: result.url,
            key: result.key
        };
    }
}
exports.UploadService = UploadService;
//# sourceMappingURL=UploadService.js.map