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
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
        if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
        }
    }
});
// All routes require admin authentication
router.use(adminAuth_1.adminAuthMiddleware);
// Bulk import leads
router.post('/', (0, roleAuth_1.requirePermission)('canBulkImport'), upload.single('file'), BulkLeadImportController_1.BulkLeadImportController.bulkImport);
// Download template
router.get('/template', (0, roleAuth_1.requirePermission)('canBulkImport'), BulkLeadImportController_1.BulkLeadImportController.downloadTemplate);
// Import history
router.get('/history', (0, roleAuth_1.requirePermission)('canViewLeads'), BulkLeadImportController_1.BulkLeadImportController.getImportHistory);
// Export UIDs from import (must come before :importId route)
router.get('/:importId/export-uids', (0, roleAuth_1.requirePermission)('canViewLeads'), BulkLeadImportController_1.BulkLeadImportController.exportUids);
// Import details
router.get('/:importId', (0, roleAuth_1.requirePermission)('canViewLeads'), BulkLeadImportController_1.BulkLeadImportController.getImportDetails);
exports.default = router;
//# sourceMappingURL=bulkLeadImport.js.map