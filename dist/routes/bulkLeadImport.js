"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const BulkLeadImportController_1 = require("../controllers/BulkLeadImportController");
const adminAuth_1 = require("../middleware/adminAuth");
const roleAuth_1 = require("../middleware/roleAuth");
const router = express_1.default.Router();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
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
        }
        else {
            cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
        }
    },
});
// All routes require admin authentication
router.use(adminAuth_1.adminAuthMiddleware);
// Preview bulk import (dry run - no records created)
router.post('/preview', (0, roleAuth_1.requirePermission)('canBulkImport'), upload.single('file'), BulkLeadImportController_1.BulkLeadImportController.previewBulkImport);
// Bulk import leads (queued for background processing)
router.post('/', (0, roleAuth_1.requirePermission)('canBulkImport'), upload.single('file'), BulkLeadImportController_1.BulkLeadImportController.bulkImport);
// Get job status
router.get('/job/:jobId', (0, roleAuth_1.requirePermission)('canBulkImport'), BulkLeadImportController_1.BulkLeadImportController.getJobStatus);
// Download template
router.get('/template', (0, roleAuth_1.requirePermission)('canBulkImport'), BulkLeadImportController_1.BulkLeadImportController.downloadTemplate);
// Import history
router.get('/history', (0, roleAuth_1.requirePermission)('canViewLeads'), BulkLeadImportController_1.BulkLeadImportController.getImportHistory);
// Import analytics (must come before :importId route)
router.get('/analytics', (0, roleAuth_1.requirePermission)('canViewLeads'), BulkLeadImportController_1.BulkLeadImportController.getImportAnalytics);
// Get imported leads for an import (must come before :importId route)
router.get('/:importId/leads', (0, roleAuth_1.requirePermission)('canViewLeads'), BulkLeadImportController_1.BulkLeadImportController.getImportedLeads);
// Export UIDs from import (must come before :importId route)
router.get('/:importId/export-uids', (0, roleAuth_1.requirePermission)('canViewLeads'), BulkLeadImportController_1.BulkLeadImportController.exportUids);
// Import details
router.get('/:importId', (0, roleAuth_1.requirePermission)('canViewLeads'), BulkLeadImportController_1.BulkLeadImportController.getImportDetails);
exports.default = router;
//# sourceMappingURL=bulkLeadImport.js.map