"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const BulkUploadController_1 = require("../controllers/BulkUploadController");
const serviceAuth_1 = require("../middleware/serviceAuth");
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
// All routes require service authentication
router.use(serviceAuth_1.serviceAuthMiddleware);
// Bulk upload
router.post('/upload', upload.single('file'), BulkUploadController_1.BulkUploadController.bulkUpload);
// Download template
router.get('/template', BulkUploadController_1.BulkUploadController.downloadTemplate);
// Import history
router.get('/history', BulkUploadController_1.BulkUploadController.getImportHistory);
// Export UIDs from import (must come before :importId route)
router.get('/:importId/export-uids', BulkUploadController_1.BulkUploadController.exportUids);
// Get imported users/leads (paginated)
router.get('/:importId/users', BulkUploadController_1.BulkUploadController.getImportedUsers);
// Import details
router.get('/:importId', BulkUploadController_1.BulkUploadController.getImportDetails);
exports.default = router;
//# sourceMappingURL=bulkUpload.js.map