import { Router } from 'express';
import { LeadController } from '../controllers/LeadController';
import { BulkOperationsController } from '../controllers/BulkOperationsController';
import { DocumentController } from '../controllers/DocumentController';
import { SkillController } from '../controllers/SkillController';
import { ActivationController } from '../controllers/ActivationController';
import { ApprovalController } from '../controllers/ApprovalController';
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

// Get unique users who have added leads (for filter dropdown)
router.get(
  '/creators',
  requirePermission('canViewLeads'),
  LeadController.getLeadCreators
);

// Search and filter leads
router.get(
  '/',
  requirePermission('canViewLeads'),
  LeadController.searchLeads
);

// Check for duplicates
router.post(
  '/duplicate-check',
  requirePermission('canCreateLead'),
  LeadController.checkDuplicate
);

// Verification queue (must be before /:leadId to avoid route conflict)
router.get(
  '/verification-queue',
  requirePermission('canVerifyDocuments'),
  ApprovalController.getVerificationQueue
);

// Activation queue (must be before /:leadId to avoid route conflict)
router.get(
  '/activation-queue',
  requirePermission('canActivate'),
  ActivationController.getActivationQueue
);

// Get lead by ID
router.get(
  '/:leadId',
  requirePermission('canViewLeads'),
  LeadController.getLead
);

// Update lead
router.put(
  '/:leadId',
  requirePermission('canUpdateLead'),
  LeadController.updateLead
);

// Delete lead
router.delete(
  '/:leadId',
  requirePermission('canDeleteLead'),
  LeadController.deleteLead
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

// Document management
router.post(
  '/:leadId/documents',
  requirePermission('canUploadDocuments'),
  DocumentController.uploadDocument
);

// Aadhaar verification (API-based)
router.post(
  '/:leadId/documents/:documentIndex/verify-aadhaar/initiate',
  requirePermission('canVerifyDocuments'),
  DocumentController.initiateAadhaarVerification
);

router.post(
  '/:leadId/documents/:documentIndex/verify-aadhaar/verify',
  requirePermission('canVerifyDocuments'),
  DocumentController.verifyAadhaarOTP
);

// PAN verification (API-based)
router.post(
  '/:leadId/documents/:documentIndex/verify-pan',
  requirePermission('canVerifyDocuments'),
  DocumentController.verifyPAN
);

// Manual document verification (for address_proof and other documents)
router.put(
  '/:leadId/documents/:documentIndex',
  requirePermission('canVerifyDocuments'),
  DocumentController.verifyDocument
);

router.delete(
  '/:leadId/documents/:documentIndex',
  requirePermission('canUpdateLead'),
  DocumentController.deleteDocument
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

