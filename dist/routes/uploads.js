"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const adminAuth_1 = require("../middleware/adminAuth");
const env_1 = require("../config/env");
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
 * Proxy document upload to user-service.
 * Requires admin auth (Firebase). Sends service auth headers to user-service.
 */
router.post('/document', adminAuth_1.adminAuthMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file provided' });
        }
        const userServiceUrl = env_1.env.USER_SERVICE_URL;
        if (!userServiceUrl) {
            return res.status(500).json({ success: false, error: 'USER_SERVICE_URL not configured' });
        }
        const form = new form_data_1.default();
        form.append('file', req.file.buffer, {
            filename: req.file.originalname || 'document',
            contentType: req.file.mimetype,
        });
        if (req.body?.docType)
            form.append('docType', req.body.docType);
        if (req.body?.leadId)
            form.append('leadId', req.body.leadId);
        const adminUser = req.user;
        const adminUid = adminUser?.uid || 'admin';
        const response = await axios_1.default.post(`${userServiceUrl}/api/v1/uploads/document`, form, {
            headers: {
                ...form.getHeaders(),
                'x-service-auth': env_1.env.SERVICE_AUTH_TOKEN || '',
                'x-user-id': adminUid,
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });
        return res.json(response.data);
    }
    catch (error) {
        const message = error?.response?.data?.error || error?.message || 'Upload failed';
        return res.status(400).json({ success: false, error: message });
    }
});
exports.default = router;
//# sourceMappingURL=uploads.js.map