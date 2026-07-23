import { Router } from 'express';
import { InviteController } from '../controllers/InviteController';
import { adminAuthJWTMiddleware } from '../middleware/adminAuthJWT';

const router = Router();

// All routes require JWT authentication (except getByToken which is public)

// Create invite
router.post('/', adminAuthJWTMiddleware as any, InviteController.create);

// Get invite by token (public - used for invite acceptance page)
router.get('/:token', InviteController.getByToken);

// List all invites
router.get('/', adminAuthJWTMiddleware as any, InviteController.list);

// Revoke invite
router.delete('/:inviteId', adminAuthJWTMiddleware as any, InviteController.revoke);

// Resend invite
router.post('/:inviteId/resend', adminAuthJWTMiddleware as any, InviteController.resend);

export default router;
