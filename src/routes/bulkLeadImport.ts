import express from 'express';
import multer from 'multer';
import { BulkLeadImportController } from '../controllers/BulkLeadImportController';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { requirePermission } from '../middleware/roleAuth';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB - increased for larger CSV files
  },
  fileFilter: (_req, file, cb) => {
    // Validate file type
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/csv',
    ];
    const allowedExtensions = /\.(csv|xlsx|xls)$/i;
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  },
});

// All routes require admin authentication
router.use(adminAuthMiddleware);

// Preview bulk import (dry run - no records created)
router.post(
  '/preview',
  requirePermission('canBulkImport'),
  upload.single('file'),
  BulkLeadImportController.previewBulkImport
);

// Bulk import leads (queued for background processing)
router.post(
  '/',
  requirePermission('canBulkImport'),
  upload.single('file'),
  BulkLeadImportController.bulkImport
);

// Get job status
router.get(
  '/job/:jobId',
  requirePermission('canBulkImport'),
  BulkLeadImportController.getJobStatus
);

// Download template
router.get(
  '/template',
  requirePermission('canBulkImport'),
  BulkLeadImportController.downloadTemplate
);

// Import history
router.get(
  '/history',
  requirePermission('canViewLeads'),
  BulkLeadImportController.getImportHistory
);

// Import analytics (must come before :importId route)
router.get(
  '/analytics',
  requirePermission('canViewLeads'),
  BulkLeadImportController.getImportAnalytics
);

// Get imported leads for an import (must come before :importId route)
router.get(
  '/:importId/leads',
  requirePermission('canViewLeads'),
  BulkLeadImportController.getImportedLeads
);

// Export UIDs from import (must come before :importId route)
router.get(
  '/:importId/export-uids',
  requirePermission('canViewLeads'),
  BulkLeadImportController.exportUids
);

// Import details
router.get(
  '/:importId',
  requirePermission('canViewLeads'),
  BulkLeadImportController.getImportDetails
);

export default router;

