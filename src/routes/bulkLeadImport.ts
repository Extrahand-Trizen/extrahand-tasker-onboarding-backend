import express from 'express';
import multer from 'multer';
import { BulkLeadImportController } from '../controllers/BulkLeadImportController';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { requirePermission } from '../middleware/roleAuth';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  }
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

// Bulk import leads
router.post(
  '/',
  requirePermission('canBulkImport'),
  upload.single('file'),
  BulkLeadImportController.bulkImport
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

