import express from 'express';
import { ApprovalController } from '../controllers/ApprovalController';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { requirePermission } from '../middleware/roleAuth';

const router = express.Router();

// All routes require admin authentication
router.use(adminAuthMiddleware);

// Get approval queue
router.get(
  '/approval-queue',
  requirePermission('canApprove'),
  ApprovalController.getApprovalQueue
);

// Check approval criteria for a lead
router.get(
  '/:leadId/approval-criteria',
  requirePermission('canApprove'),
  ApprovalController.checkApprovalCriteria
);

// Approve a single lead
router.post(
  '/:leadId/approve',
  requirePermission('canApprove'),
  ApprovalController.approveLead
);

// Bulk approve leads
router.post(
  '/bulk-approve',
  requirePermission('canApprove'),
  ApprovalController.bulkApproveLeads
);

export default router;

