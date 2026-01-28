"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UserManagementController_1 = require("../controllers/UserManagementController");
const adminAuth_1 = require("../middleware/adminAuth");
const roleAuth_1 = require("../middleware/roleAuth");
const router = (0, express_1.Router)();
// All routes require JWT authentication
router.use(adminAuth_1.adminAuthJWT);
// List all users - requires lead_access_manager
router.get('/', (0, roleAuth_1.requireRole)('lead_access_manager'), UserManagementController_1.UserManagementController.list);
// Get user by ID - requires lead_access_manager
router.get('/:userId', (0, roleAuth_1.requireRole)('lead_access_manager'), UserManagementController_1.UserManagementController.getById);
// Update user - requires lead_access_manager
router.put('/:userId', (0, roleAuth_1.requireRole)('lead_access_manager'), UserManagementController_1.UserManagementController.update);
// Update role - requires lead_access_manager
router.put('/:userId/role', (0, roleAuth_1.requireRole)('lead_access_manager'), UserManagementController_1.UserManagementController.updateRole);
// Update status - requires lead_access_manager
router.put('/:userId/status', (0, roleAuth_1.requireRole)('lead_access_manager'), UserManagementController_1.UserManagementController.updateStatus);
// Password reset - requires lead_access_manager
router.post('/:userId/reset-password', (0, roleAuth_1.requireRole)('lead_access_manager'), UserManagementController_1.UserManagementController.resetPassword);
// Session management (more specific routes first) - requires lead_access_manager
router.get('/:userId/sessions', (0, roleAuth_1.requireRole)('lead_access_manager'), UserManagementController_1.UserManagementController.getSessions);
router.delete('/:userId/sessions', (0, roleAuth_1.requireRole)('lead_access_manager'), UserManagementController_1.UserManagementController.revokeAllSessions);
router.delete('/:userId/sessions/:sessionIndex', (0, roleAuth_1.requireRole)('lead_access_manager'), UserManagementController_1.UserManagementController.revokeSession);
// Delete user (less specific route - must come after more specific routes)
// Only lead_access_manager can delete users
router.delete('/:userId', (0, roleAuth_1.requireRole)('lead_access_manager'), UserManagementController_1.UserManagementController.deleteUser);
exports.default = router;
//# sourceMappingURL=userManagement.js.map