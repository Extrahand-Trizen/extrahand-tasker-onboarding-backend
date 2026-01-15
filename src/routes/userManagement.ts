import { Router } from 'express';
import { UserManagementController } from '../controllers/UserManagementController';
import { adminAuthJWT } from '../middleware/adminAuth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();

// All routes require JWT authentication and lead_access_manager role
router.use(adminAuthJWT as any);
router.use(requireRole('lead_access_manager') as any);

// List all users
router.get('/', UserManagementController.list as any);

// Get user by ID
router.get('/:userId', UserManagementController.getById as any);

// Update user
router.put('/:userId', UserManagementController.update as any);

// Update role
router.put('/:userId/role', UserManagementController.updateRole as any);

// Update status
router.put('/:userId/status', UserManagementController.updateStatus as any);

// Password reset
router.post('/:userId/reset-password', UserManagementController.resetPassword as any);

// Session management
router.get('/:userId/sessions', UserManagementController.getSessions as any);
router.delete('/:userId/sessions', UserManagementController.revokeAllSessions as any);
router.delete('/:userId/sessions/:sessionIndex', UserManagementController.revokeSession as any);

export default router;
