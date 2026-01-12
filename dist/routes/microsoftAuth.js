"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const MicrosoftAuthController_1 = require("../controllers/MicrosoftAuthController");
const adminAuthJWT_1 = require("../middleware/adminAuthJWT");
const router = (0, express_1.Router)();
// Initiate Microsoft OAuth flow
router.get('/microsoft', MicrosoftAuthController_1.MicrosoftAuthController.initiateLogin);
// Handle Microsoft OAuth callback
router.get('/microsoft/callback', MicrosoftAuthController_1.MicrosoftAuthController.handleCallback);
// Refresh access token
router.post('/refresh', MicrosoftAuthController_1.MicrosoftAuthController.refreshToken);
// Logout
router.post('/logout', adminAuthJWT_1.adminAuthJWTMiddleware, MicrosoftAuthController_1.MicrosoftAuthController.logout);
// Get current user
router.get('/me', adminAuthJWT_1.adminAuthJWTMiddleware, MicrosoftAuthController_1.MicrosoftAuthController.getCurrentUser);
exports.default = router;
//# sourceMappingURL=microsoftAuth.js.map