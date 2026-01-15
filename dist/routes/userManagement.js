"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UserManagementController_1 = require("../controllers/UserManagementController");
const adminAuth_1 = require("../middleware/adminAuth");
const roleAuth_1 = require("../middleware/roleAuth");
const router = (0, express_1.Router)();
// All routes require JWT authentication and lead_access_manager role
router.use(adminAuth_1.adminAuthJWT);
router.use((0, roleAuth_1.requireRole)('lead_access_manager'));
// List all users
router.get('/', UserManagementController_1.UserManagementController.list);
// Get user by ID
router.get('/:userId', UserManagementController_1.UserManagementController.getById);
// Update user
router.put('/:userId', UserManagementController_1.UserManagementController.update);
// Update role
router.put('/:userId/role', UserManagementController_1.UserManagementController.updateRole);
// Update status
router.put('/:userId/status', UserManagementController_1.UserManagementController.updateStatus);
// Password reset
router.post('/:userId/reset-password', UserManagementController_1.UserManagementController.resetPassword);
// Session management
router.get('/:userId/sessions', UserManagementController_1.UserManagementController.getSessions);
router.delete('/:userId/sessions', UserManagementController_1.UserManagementController.revokeAllSessions);
router.delete('/:userId/sessions/:sessionIndex', UserManagementController_1.UserManagementController.revokeSession);
exports.default = router;
//# sourceMappingURL=userManagement.js.map