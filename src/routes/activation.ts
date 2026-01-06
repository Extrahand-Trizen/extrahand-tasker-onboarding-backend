import express from 'express';
import { ActivationController } from '../controllers/ActivationController';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { requirePermission } from '../middleware/roleAuth';

const router = express.Router();

// All routes require admin authentication
router.use(adminAuthMiddleware);

// Get activation queue
router.get(
  '/activation-queue',
  requirePermission('canActivate'),
  ActivationController.getActivationQueue
);

// Activate a single lead
router.post(
  '/:leadId/activate',
  requirePermission('canActivate'),
  ActivationController.activateLead
);

// Bulk activate leads
router.post(
  '/bulk-activate',
  requirePermission('canActivate'),
  ActivationController.bulkActivateLeads
);

export default router;

