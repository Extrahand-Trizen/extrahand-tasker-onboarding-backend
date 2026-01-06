"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AdminUserController_1 = require("../controllers/AdminUserController");
const adminAuth_1 = require("../middleware/adminAuth");
const roleAuth_1 = require("../middleware/roleAuth");
const router = (0, express_1.Router)();
// Temporarily removing role guard (adminAuth only)
router.use(adminAuth_1.adminAuthMiddleware, (0, roleAuth_1.requireRole)('admin'));
router.get('/', AdminUserController_1.AdminUserController.list);
router.post('/', AdminUserController_1.AdminUserController.create);
router.put('/:uid/role', AdminUserController_1.AdminUserController.updateRole);
router.post('/:uid/reset-password', AdminUserController_1.AdminUserController.resetPassword);
exports.default = router;
//# sourceMappingURL=adminUsers.js.map