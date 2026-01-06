"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const LeadController_1 = require("../controllers/LeadController");
const BulkOperationsController_1 = require("../controllers/BulkOperationsController");
const DocumentController_1 = require("../controllers/DocumentController");
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
// Check for duplicates
router.post('/duplicate-check', (0, roleAuth_1.requirePermission)('canCreateLead'), LeadController_1.LeadController.checkDuplicate);
// Activation queue (must be before /:leadId to avoid route conflict)
router.get('/activation-queue', (0, roleAuth_1.requirePermission)('canActivate'), ActivationController_1.ActivationController.getActivationQueue);
// Get lead by ID
router.get('/:leadId', (0, roleAuth_1.requirePermission)('canViewLeads'), LeadController_1.LeadController.getLead);
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
// Document management
router.post('/:leadId/documents', (0, roleAuth_1.requirePermission)('canUpdateLead'), DocumentController_1.DocumentController.uploadDocument);
router.put('/:leadId/documents/:documentIndex', (0, roleAuth_1.requirePermission)('canVerifyDocuments'), DocumentController_1.DocumentController.verifyDocument);
router.delete('/:leadId/documents/:documentIndex', (0, roleAuth_1.requirePermission)('canUpdateLead'), DocumentController_1.DocumentController.deleteDocument);
// Skill management
router.post('/:leadId/skills', (0, roleAuth_1.requirePermission)('canAssignSkills'), SkillController_1.SkillController.addSkill);
router.put('/:leadId/skills/:skillIndex', (0, roleAuth_1.requirePermission)('canAssignSkills'), SkillController_1.SkillController.updateSkill);
router.delete('/:leadId/skills/:skillIndex', (0, roleAuth_1.requirePermission)('canAssignSkills'), SkillController_1.SkillController.removeSkill);
exports.default = router;
//# sourceMappingURL=leads.js.map