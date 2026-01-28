"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const PasswordAuthController_1 = require("../controllers/PasswordAuthController");
const adminAuth_1 = require("../middleware/adminAuth");
const router = (0, express_1.Router)();
// Public routes (no authentication required)
router.post('/login', PasswordAuthController_1.PasswordAuthController.login);
router.post('/set-password', PasswordAuthController_1.PasswordAuthController.setPassword);
router.post('/refresh', PasswordAuthController_1.PasswordAuthController.refreshToken);
router.get('/verify-reset-token', PasswordAuthController_1.PasswordAuthController.verifyResetToken);
router.post('/reset-password', PasswordAuthController_1.PasswordAuthController.resetPassword);
// Protected routes (require JWT authentication)
router.get('/me', adminAuth_1.adminAuthJWT, PasswordAuthController_1.PasswordAuthController.getCurrentUser);
router.post('/logout', adminAuth_1.adminAuthJWT, PasswordAuthController_1.PasswordAuthController.logout);
exports.default = router;
//# sourceMappingURL=passwordAuth.js.map