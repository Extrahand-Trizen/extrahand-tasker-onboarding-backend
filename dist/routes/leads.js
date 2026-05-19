"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const LeadController_1 = require("../controllers/LeadController");
const BulkOperationsController_1 = require("../controllers/BulkOperationsController");
const SkillController_1 = require("../controllers/SkillController");
const ActivationController_1 = require("../controllers/ActivationController");
const adminAuth_1 = require("../middleware/adminAuth");
const roleAuth_1 = require("../middleware/roleAuth");
const router = (0, express_1.Router)();
// All routes require admin authentication
router.use(adminAuth_1.adminAuthMiddleware);
// Create lead
router.post('/', (0, roleAuth_1.requirePermission)('canCreateLead'), LeadController_1.LeadController.createLead);
// Search and filter leads
router.get('/', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.searchLeads);
// Callback queue
router.get('/callback-queue', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getCallbackQueue);
router.get('/callback-queue/stats', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getCallbackQueueStats);
router.get('/follow-up-queue', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getFollowUpQueue);
router.get('/follow-up-queue/stats', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getFollowUpQueueStats);
// Get unique users who have added leads (for filter dropdown)
router.get('/creators', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getLeadCreators);
// Get qualifiers list (for pick/transfer)
router.get('/qualifiers', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getQualifiers);
// Get onboarders list (for transfer)
router.get('/onboarders', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getOnboarders);
// Transfer notifications for current user
router.get('/transfer-notifications', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getTransferNotifications);
// Get transfer recipients list (all active admin users)
router.get('/transfer-recipients', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getTransferRecipients);
// Shared status reason codes for lead status updates
router.get('/status-reason-codes', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getStatusReasonCodes);
router.get('/status-analytics', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getStatusAnalytics);
router.get('/performance', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getTeamPerformance);
router.get('/status-reports/export', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.exportStatusReport);
router.get('/dashboard-metrics', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getDashboardMetrics);
// Check for duplicates
router.post('/duplicate-check', (0, roleAuth_1.requirePermission)('canCreateLead'), LeadController_1.LeadController.checkDuplicate);
// Activation queue (must be before /:leadId to avoid route conflict)
router.get('/activation-queue', (0, roleAuth_1.requirePermission)('canActivate'), ActivationController_1.ActivationController.getActivationQueue);
// Conversion status (lead registered on main website + Aadhaar verified)
router.get('/:leadId/conversion-status', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getConversionStatus);
// Verified skill certificates from platform profile
router.get('/:leadId/verified-certificates', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getVerifiedCertificates);
// Get lead by ID
router.get('/:leadId', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getLead);
// Pick lead (qualifier/onboarder)
router.post('/:leadId/pick', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.pickLead);
// Transfer picked lead (qualifier/onboarder)
router.post('/:leadId/transfer', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.transferLead);
// Accept lead transfer (qualifier/onboarder only)
router.post('/:leadId/accept-transfer', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.acceptTransferLead);
// Reject lead transfer (qualifier/onboarder only)
router.post('/:leadId/reject-transfer', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.rejectTransferLead);
// Update lead
router.put('/:leadId', (0, roleAuth_1.requirePermission)('canUpdateLead'), LeadController_1.LeadController.updateLead);
// Update lead status
router.put('/:leadId/status', (0, roleAuth_1.requirePermission)('canUpdateLead'), // Status update is part of lead update
LeadController_1.LeadController.updateStatus);
// Get status history
router.get('/:leadId/history', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getStatusHistory);
// Add internal note
router.post('/:leadId/notes', (0, roleAuth_1.requirePermission)('canAddNotes'), LeadController_1.LeadController.addNote);
// Bulk operations
router.post('/bulk-status', (0, roleAuth_1.requirePermission)('canUpdateLead'), BulkOperationsController_1.BulkOperationsController.bulkStatusChange);
router.post('/bulk-assign-skills', (0, roleAuth_1.requirePermission)('canAssignSkills'), BulkOperationsController_1.BulkOperationsController.bulkAssignSkills);
router.post('/bulk-delete', (0, roleAuth_1.requirePermission)('canDeleteLead'), BulkOperationsController_1.BulkOperationsController.bulkDeleteLeads);
// Delete single lead (only lead_access_manager can delete)
router.delete('/:leadId', (0, roleAuth_1.requirePermission)('canDeleteLead'), LeadController_1.LeadController.deleteLead);
// Skill management
router.post('/:leadId/skills', (0, roleAuth_1.requirePermission)('canAssignSkills'), SkillController_1.SkillController.addSkill);
router.put('/:leadId/skills/:skillIndex', (0, roleAuth_1.requirePermission)('canAssignSkills'), SkillController_1.SkillController.updateSkill);
router.delete('/:leadId/skills/:skillIndex', (0, roleAuth_1.requirePermission)('canAssignSkills'), SkillController_1.SkillController.removeSkill);
exports.default = router;
//# sourceMappingURL=leads.js.map