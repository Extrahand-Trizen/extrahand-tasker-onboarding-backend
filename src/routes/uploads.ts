import { Router } from 'express';
import multer from 'multer';
import { adminAuthMiddleware, AdminRequest } from '../middleware/adminAuth';
import { requirePermission } from '../middleware/roleAuth';
import logger from '../config/logger';
import { UploadService } from '../services/UploadService';

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
 * Direct document upload to storage (MinIO/S3).
 * Requires admin auth (Firebase). Uploads directly to configured storage provider.
 */
router.post(
  '/document',
  adminAuthMiddleware,
  requirePermission('canUploadDocuments'),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        logger.error('Multer error', { error: err.message });
        return res.status(400).json({ 
          success: false, 
          error: err.message || 'File upload error' 
        });
      }
      next();
    });
  },
  async (req: AdminRequest, res) => {
    try {
      if (!req.file) {
        logger.warn('No file provided in upload request', {
          body: req.body,
          hasFile: !!req.file
        });
        return res.status(400).json({ success: false, error: 'No file provided' });
      }
      
      // ✅ Use admin.uid from AdminRequest (set by adminAuthMiddleware)
      const adminUid = req.admin?.uid || req.user?.uid || 'system';
      
      logger.info('File upload received', {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        docType: req.body?.docType,
        leadId: req.body?.leadId,
        adminUid
      });

      // Upload directly to storage (MinIO/S3)
      const result = await UploadService.uploadDocument(
        adminUid,
        req.file.buffer,
        req.file.originalname || 'document',
        req.file.mimetype,
        req.body?.docType || 'document',
        req.body?.leadId
      );

      logger.info('Upload successful', {
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
    } catch (error: any) {
      logger.error('Document upload error', {
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
  }
);

export default router;

