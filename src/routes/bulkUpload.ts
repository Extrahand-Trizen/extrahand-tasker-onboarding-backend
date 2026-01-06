import express from 'express';
import multer from 'multer';
import { BulkUploadController } from '../controllers/BulkUploadController';
import { serviceAuthMiddleware } from '../middleware/serviceAuth';

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

// All routes require service authentication
router.use(serviceAuthMiddleware);

// Bulk upload
router.post('/upload', upload.single('file'), BulkUploadController.bulkUpload);

// Download template
router.get('/template', BulkUploadController.downloadTemplate);

// Import history
router.get('/history', BulkUploadController.getImportHistory);

// Export UIDs from import (must come before :importId route)
router.get('/:importId/export-uids', BulkUploadController.exportUids);

// Get imported users/leads (paginated)
router.get('/:importId/users', BulkUploadController.getImportedUsers);

// Import details
router.get('/:importId', BulkUploadController.getImportDetails);

export default router;

