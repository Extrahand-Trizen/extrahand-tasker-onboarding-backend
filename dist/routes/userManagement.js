"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UserManagementController_1 = require("../controllers/UserManagementController");
const adminAuth_1 = require("../middleware/adminAuth");
const roleAuth_1 = require("../middleware/roleAuth");
const router = (0, express_1.Router)();
// All routes require JWT authentication and admin role
router.use(adminAuth_1.adminAuthJWT);
router.use((0, roleAuth_1.requireRole)('admin'));
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
exports.default = router;
//# sourceMappingURL=userManagement.js.map