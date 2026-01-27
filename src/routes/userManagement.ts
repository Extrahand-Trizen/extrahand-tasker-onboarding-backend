import { Router } from 'express';
import { UserManagementController } from '../controllers/UserManagementController';
import { adminAuthJWT } from '../middleware/adminAuth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();

// All routes require JWT authentication
router.use(adminAuthJWT as any);

// List all users - requires lead_access_manager
router.get('/', requireRole('lead_access_manager') as any, UserManagementController.list as any);

// Get user by ID - requires lead_access_manager
router.get('/:userId', requireRole('lead_access_manager') as any, UserManagementController.getById as any);

// Update user - requires lead_access_manager
router.put('/:userId', requireRole('lead_access_manager') as any, UserManagementController.update as any);

// Update role - requires lead_access_manager
router.put('/:userId/role', requireRole('lead_access_manager') as any, UserManagementController.updateRole as any);

// Update status - requires lead_access_manager
router.put('/:userId/status', requireRole('lead_access_manager') as any, UserManagementController.updateStatus as any);

// Password reset - requires lead_access_manager
router.post('/:userId/reset-password', requireRole('lead_access_manager') as any, UserManagementController.resetPassword as any);

// Session management (more specific routes first) - requires lead_access_manager
router.get('/:userId/sessions', requireRole('lead_access_manager') as any, UserManagementController.getSessions as any);
router.delete('/:userId/sessions', requireRole('lead_access_manager') as any, UserManagementController.revokeAllSessions as any);
router.delete('/:userId/sessions/:sessionIndex', requireRole('lead_access_manager') as any, UserManagementController.revokeSession as any);

// Delete user (less specific route - must come after more specific routes)
// Only lead_access_manager can delete users
router.delete('/:userId', requireRole('lead_access_manager') as any, UserManagementController.deleteUser as any);

export default router;
