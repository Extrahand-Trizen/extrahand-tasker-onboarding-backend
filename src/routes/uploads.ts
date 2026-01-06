import { Router } from 'express';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { env } from '../config/env';

const router = Router();

// Multer in-memory storage, 10MB limit, accept jpg/png/pdf
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only jpg/png/pdf files are allowed'));
    }
  }
});

/**
 * Proxy document upload to user-service.
 * Requires admin auth (Firebase). Sends service auth headers to user-service.
 */
router.post(
  '/document',
  adminAuthMiddleware,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file provided' });
      }

      const userServiceUrl = env.USER_SERVICE_URL;
      if (!userServiceUrl) {
        return res.status(500).json({ success: false, error: 'USER_SERVICE_URL not configured' });
      }

      const form = new FormData();
      form.append('file', req.file.buffer, {
        filename: req.file.originalname || 'document',
        contentType: req.file.mimetype,
      });
      if (req.body?.docType) form.append('docType', req.body.docType);
      if (req.body?.leadId) form.append('leadId', req.body.leadId);

      const adminUser = (req as any).user;
      const adminUid = adminUser?.uid || 'admin';

      const response = await axios.post(
        `${userServiceUrl}/api/v1/uploads/document`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            'x-service-auth': env.SERVICE_AUTH_TOKEN || '',
            'x-user-id': adminUid,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      return res.json(response.data);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Upload failed';
      return res.status(400).json({ success: false, error: message });
    }
  }
);

export default router;

