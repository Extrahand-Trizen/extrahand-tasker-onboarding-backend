import { Router } from 'express';
import { LeadController } from '../controllers/LeadController';
import { BulkOperationsController } from '../controllers/BulkOperationsController';
import { SkillController } from '../controllers/SkillController';
import { ActivationController } from '../controllers/ActivationController';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { requirePermission } from '../middleware/roleAuth';

const router = Router();

// All routes require admin authentication
router.use(adminAuthMiddleware);

// Create lead
router.post(
  '/',
  requirePermission('canCreateLead'),
  LeadController.createLead
);

// Search and filter leads
router.get(
  '/',
  requirePermission('canViewLeads'),
  LeadController.searchLeads
);

// Callback queue
router.get(
  '/callback-queue',
  requirePermission('canViewLeads'),
  LeadController.getCallbackQueue
);
router.get(
  '/callback-queue/stats',
  requirePermission('canViewLeads'),
  LeadController.getCallbackQueueStats
);
router.get(
  '/follow-up-queue',
  requirePermission('canViewLeads'),
  LeadController.getFollowUpQueue
);
router.get(
  '/follow-up-queue/stats',
  requirePermission('canViewLeads'),
  LeadController.getFollowUpQueueStats
);

// Get unique users who have added leads (for filter dropdown)
router.get(
  '/creators',
  requirePermission('canViewLeads'),
  LeadController.getLeadCreators
);

// Get qualifiers list (for pick/transfer)
router.get(
  '/qualifiers',
  requirePermission('canViewLeads'),
  LeadController.getQualifiers
);

// Get onboarders list (for transfer)
router.get(
  '/onboarders',
  requirePermission('canViewLeads'),
  LeadController.getOnboarders
);

// Transfer notifications for current user
router.get(
  '/transfer-notifications',
  requirePermission('canViewLeads'),
  LeadController.getTransferNotifications
);

// Get transfer recipients list (all active admin users)
router.get(
  '/transfer-recipients',
  requirePermission('canViewLeads'),
  LeadController.getTransferRecipients
);

// Shared status reason codes for lead status updates
router.get(
  '/status-reason-codes',
  requirePermission('canViewLeads'),
  LeadController.getStatusReasonCodes
);
router.get(
  '/status-analytics',
  requirePermission('canViewLeads'),
  LeadController.getStatusAnalytics
);
router.get(
  '/status-reports/export',
  requirePermission('canViewLeads'),
  LeadController.exportStatusReport
);
router.get(
  '/dashboard-metrics',
  requirePermission('canViewLeads'),
  LeadController.getDashboardMetrics
);

// Check for duplicates
router.post(
  '/duplicate-check',
  requirePermission('canCreateLead'),
  LeadController.checkDuplicate
);

// Activation queue (must be before /:leadId to avoid route conflict)
router.get(
  '/activation-queue',
  requirePermission('canActivate'),
  ActivationController.getActivationQueue
);

// Conversion status (lead registered on main website + Aadhaar verified)
router.get(
  '/:leadId/conversion-status',
  requirePermission('canViewLeads'),
  LeadController.getConversionStatus
);

// Verified skill certificates from platform profile
router.get(
  '/:leadId/verified-certificates',
  requirePermission('canViewLeads'),
  LeadController.getVerifiedCertificates
);

// Get lead by ID
router.get(
  '/:leadId',
  requirePermission('canViewLeads'),
  LeadController.getLead
);

// Pick lead (qualifier/onboarder)
router.post(
  '/:leadId/pick',
  requirePermission('canViewLeads'),
  LeadController.pickLead
);

// Transfer picked lead (qualifier/onboarder)
router.post(
  '/:leadId/transfer',
  requirePermission('canViewLeads'),
  LeadController.transferLead
);

// Accept lead transfer (qualifier/onboarder only)
router.post(
  '/:leadId/accept-transfer',
  requirePermission('canViewLeads'),
  LeadController.acceptTransferLead
);

// Reject lead transfer (qualifier/onboarder only)
router.post(
  '/:leadId/reject-transfer',
  requirePermission('canViewLeads'),
  LeadController.rejectTransferLead
);

// Update lead
router.put(
  '/:leadId',
  requirePermission('canUpdateLead'),
  LeadController.updateLead
);

// Update lead status
router.put(
  '/:leadId/status',
  requirePermission('canUpdateLead'), // Status update is part of lead update
  LeadController.updateStatus
);

// Get status history
router.get(
  '/:leadId/history',
  requirePermission('canViewLeads'),
  LeadController.getStatusHistory
);

// Add internal note
router.post(
  '/:leadId/notes',
  requirePermission('canAddNotes'),
  LeadController.addNote
);

// Bulk operations
router.post(
  '/bulk-status',
  requirePermission('canUpdateLead'),
  BulkOperationsController.bulkStatusChange
);

router.post(
  '/bulk-assign-skills',
  requirePermission('canAssignSkills'),
  BulkOperationsController.bulkAssignSkills
);

router.post(
  '/bulk-delete',
  requirePermission('canDeleteLead'),
  BulkOperationsController.bulkDeleteLeads
);

// Delete single lead (only lead_access_manager can delete)
router.delete(
  '/:leadId',
  requirePermission('canDeleteLead'),
  LeadController.deleteLead
);

// Skill management
router.post(
  '/:leadId/skills',
  requirePermission('canAssignSkills'),
  SkillController.addSkill
);

router.put(
  '/:leadId/skills/:skillIndex',
  requirePermission('canAssignSkills'),
  SkillController.updateSkill
);

router.delete(
  '/:leadId/skills/:skillIndex',
  requirePermission('canAssignSkills'),
  SkillController.removeSkill
);

export default router;

