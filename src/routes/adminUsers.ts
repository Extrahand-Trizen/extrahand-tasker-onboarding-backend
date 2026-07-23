import { Router } from 'express';
import { AdminUserController } from '../controllers/AdminUserController';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();

// Temporarily removing role guard (adminAuth only)
router.use(adminAuthMiddleware,requireRole('lead_access_manager'));

router.get('/', AdminUserController.list);
router.post('/', AdminUserController.create);
router.put('/:uid/role', AdminUserController.updateRole);
router.post('/:uid/reset-password', AdminUserController.resetPassword);

export default router;

