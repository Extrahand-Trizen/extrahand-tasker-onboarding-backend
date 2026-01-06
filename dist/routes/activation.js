"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ActivationController_1 = require("../controllers/ActivationController");
const adminAuth_1 = require("../middleware/adminAuth");
const roleAuth_1 = require("../middleware/roleAuth");
const router = express_1.default.Router();
// All routes require admin authentication
router.use(adminAuth_1.adminAuthMiddleware);
// Get activation queue
router.get('/activation-queue', (0, roleAuth_1.requirePermission)('canActivate'), ActivationController_1.ActivationController.getActivationQueue);
// Activate a single lead
router.post('/:leadId/activate', (0, roleAuth_1.requirePermission)('canActivate'), ActivationController_1.ActivationController.activateLead);
// Bulk activate leads
router.post('/bulk-activate', (0, roleAuth_1.requirePermission)('canActivate'), ActivationController_1.ActivationController.bulkActivateLeads);
exports.default = router;
//# sourceMappingURL=activation.js.map