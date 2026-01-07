"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const adminAuth_1 = require("../middleware/adminAuth");
const logger_1 = __importDefault(require("../config/logger"));
const UploadService_1 = require("../services/UploadService");
const router = (0, express_1.Router)();
// Multer in-memory storage, 10MB limit, accept jpg/png/pdf
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only jpg/png/pdf files are allowed'));
        }
    }
});
/**
 * Direct document upload to storage (MinIO/S3).
 * Requires admin auth (Firebase). Uploads directly to configured storage provider.
 */
router.post('/document', adminAuth_1.adminAuthMiddleware, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            logger_1.default.error('Multer error', { error: err.message });
            return res.status(400).json({
                success: false,
                error: err.message || 'File upload error'
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            logger_1.default.warn('No file provided in upload request', {
                body: req.body,
                hasFile: !!req.file
            });
            return res.status(400).json({ success: false, error: 'No file provided' });
        }
        // ✅ Use admin.uid from AdminRequest (set by adminAuthMiddleware)
        const adminUid = req.admin?.uid || req.user?.uid || 'system';
        logger_1.default.info('File upload received', {
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            docType: req.body?.docType,
            leadId: req.body?.leadId,
            adminUid
        });
        // Upload directly to storage (MinIO/S3)
        const result = await UploadService_1.UploadService.uploadDocument(adminUid, req.file.buffer, req.file.originalname || 'document', req.file.mimetype, req.body?.docType || 'document', req.body?.leadId);
        logger_1.default.info('Upload successful', {
            url: result.url,
            key: result.key,
            adminUid
        });
        return res.json({
            success: true,
            data: {
                url: result.url,
                key: result.key
            }
        });
    }
    catch (error) {
        logger_1.default.error('Document upload error', {
            error: error.message,
            stack: error.stack,
            adminUid: req.admin?.uid || req.user?.uid
        });
        const message = error?.message || 'Upload failed';
        return res.status(500).json({
            success: false,
            error: message,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});
exports.default = router;
//# sourceMappingURL=uploads.js.map