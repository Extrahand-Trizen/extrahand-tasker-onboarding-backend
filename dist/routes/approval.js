"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ApprovalController_1 = require("../controllers/ApprovalController");
const adminAuth_1 = require("../middleware/adminAuth");
const roleAuth_1 = require("../middleware/roleAuth");
const router = express_1.default.Router();
// All routes require admin authentication
router.use(adminAuth_1.adminAuthMiddleware);
// Get approval queue
router.get('/approval-queue', (0, roleAuth_1.requirePermission)('canApprove'), ApprovalController_1.ApprovalController.getApprovalQueue);
// Check approval criteria for a lead
router.get('/:leadId/approval-criteria', (0, roleAuth_1.requirePermission)('canApprove'), ApprovalController_1.ApprovalController.checkApprovalCriteria);
// Approve a single lead
router.post('/:leadId/approve', (0, roleAuth_1.requirePermission)('canApprove'), ApprovalController_1.ApprovalController.approveLead);
// Bulk approve leads
router.post('/bulk-approve', (0, roleAuth_1.requirePermission)('canApprove'), ApprovalController_1.ApprovalController.bulkApproveLeads);
exports.default = router;
//# sourceMappingURL=approval.js.map