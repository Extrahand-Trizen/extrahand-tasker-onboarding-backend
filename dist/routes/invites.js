"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const InviteController_1 = require("../controllers/InviteController");
const adminAuthJWT_1 = require("../middleware/adminAuthJWT");
const router = (0, express_1.Router)();
// All routes require JWT authentication (except getByToken which is public)
// Create invite
router.post('/', adminAuthJWT_1.adminAuthJWTMiddleware, InviteController_1.InviteController.create);
// Get invite by token (public - used for invite acceptance page)
router.get('/:token', InviteController_1.InviteController.getByToken);
// List all invites
router.get('/', adminAuthJWT_1.adminAuthJWTMiddleware, InviteController_1.InviteController.list);
// Revoke invite
router.delete('/:inviteId', adminAuthJWT_1.adminAuthJWTMiddleware, InviteController_1.InviteController.revoke);
// Resend invite
router.post('/:inviteId/resend', adminAuthJWT_1.adminAuthJWTMiddleware, InviteController_1.InviteController.resend);
exports.default = router;
//# sourceMappingURL=invites.js.map