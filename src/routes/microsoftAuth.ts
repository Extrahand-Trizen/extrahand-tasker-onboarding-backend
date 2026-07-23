import { Router } from 'express';
import { MicrosoftAuthController } from '../controllers/MicrosoftAuthController';
import { adminAuthJWTMiddleware } from '../middleware/adminAuthJWT';

const router = Router();

// Initiate Microsoft OAuth flow
router.get('/microsoft', MicrosoftAuthController.initiateLogin);

// Handle Microsoft OAuth callback
router.get('/microsoft/callback', MicrosoftAuthController.handleCallback);

// Refresh access token
router.post('/refresh', MicrosoftAuthController.refreshToken);

// Logout
router.post('/logout', adminAuthJWTMiddleware as any, MicrosoftAuthController.logout);

// Get current user
router.get('/me', adminAuthJWTMiddleware as any, MicrosoftAuthController.getCurrentUser);

export default router;
