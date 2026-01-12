import { Router } from 'express';
import { PasswordAuthController } from '../controllers/PasswordAuthController';
import { adminAuthJWT } from '../middleware/adminAuth';

const router = Router();

// Public routes (no authentication required)
router.post('/login', PasswordAuthController.login);
router.post('/set-password', PasswordAuthController.setPassword);
router.post('/refresh', PasswordAuthController.refreshToken);

// Protected routes (require JWT authentication)
router.get('/me', adminAuthJWT as any, PasswordAuthController.getCurrentUser as any);
router.post('/logout', adminAuthJWT as any, PasswordAuthController.logout as any);

export default router;
