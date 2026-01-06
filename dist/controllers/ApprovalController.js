"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalController = void 0;
const ApprovalService_1 = require("../services/ApprovalService");
const LeadService_1 = require("../services/LeadService");
const logger_1 = __importDefault(require("../config/logger"));
class ApprovalController {
    /**
     * Get approval queue (leads ready for approval)
     * GET /api/v1/admin/caos/leads/approval-queue
     */
    static async getApprovalQueue(req, res) {
        try {
            const { city, primarySkill, page, limit } = req.query;
            const result = await ApprovalService_1.ApprovalService.getApprovalQueue({
                city: city,
                primarySkill: primarySkill,
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined
            });
            // Check approval criteria for each lead
            const leadsWithCriteria = result.leads.map(lead => {
                const criteria = ApprovalService_1.ApprovalService.checkApprovalCriteria(lead);
                return {
                    ...lead,
                    approvalCriteria: criteria
                };
            });
            res.json({
                success: true,
                data: {
                    leads: leadsWithCriteria,
                    total: result.total,
                    page: result.page,
                    limit: result.limit
                }
            });
        }
        catch (error) {
            logger_1.default.error('Error fetching approval queue', {
                error: error.message,
                userId: req.user?.uid
            });
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to fetch approval queue'
            });
        }
    }
    /**
     * Check approval criteria for a lead
     * GET /api/v1/admin/caos/leads/:leadId/approval-criteria
     */
    static async checkApprovalCriteria(req, res) {
        try {
            const { leadId } = req.params;
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
            if (!lead) {
                return res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
            }
            const criteria = ApprovalService_1.ApprovalService.checkApprovalCriteria(lead);
            res.json({
                success: true,
                data: criteria
            });
        }
        catch (error) {
            logger_1.default.error('Error checking approval criteria', {
                error: error.message,
                leadId: req.params.leadId,
                userId: req.user?.uid
            });
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to check approval criteria'
            });
        }
    }
    /**
     * Approve a single lead
     * POST /api/v1/admin/caos/leads/:leadId/approve
     */
    static async approveLead(req, res) {
        try {
            const { leadId } = req.params;
            const { notes } = req.body;
            const userId = req.user?.uid || 'system';
            const userName = req.user?.name || req.user?.email || 'Admin';
            // Check approval criteria
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
            if (!lead) {
                return res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
            }
            const criteria = ApprovalService_1.ApprovalService.checkApprovalCriteria(lead);
            if (!criteria.canApprove) {
                return res.status(400).json({
                    success: false,
                    error: 'Lead does not meet approval criteria',
                    data: {
                        missingRequirements: criteria.missingRequirements
                    }
                });
            }
            // Check current status
            if (lead.status !== 'under_verification' && lead.status !== 'documents_submitted') {
                return res.status(400).json({
                    success: false,
                    error: `Lead cannot be approved from status: ${lead.status}`
                });
            }
            // Update status to approved
            const updatedLead = await LeadService_1.LeadService.updateStatus(leadId, {
                status: 'approved',
                notes: notes || 'Lead approved',
                changedBy: userId,
                changedByName: userName
            }, req.user?.role || 'admin');
            res.json({
                success: true,
                data: updatedLead,
                message: 'Lead approved successfully'
            });
        }
        catch (error) {
            logger_1.default.error('Error approving lead', {
                error: error.message,
                leadId: req.params.leadId,
                userId: req.user?.uid
            });
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to approve lead'
            });
        }
    }
    /**
     * Bulk approve leads
     * POST /api/v1/admin/caos/leads/bulk-approve
     */
    static async bulkApproveLeads(req, res) {
        try {
            const { leadIds, notes } = req.body;
            const userId = req.user?.uid || 'system';
            const userName = req.user?.name || req.user?.email || 'Admin';
            if (!Array.isArray(leadIds) || leadIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'leadIds must be a non-empty array'
                });
            }
            const success = [];
            const failed = [];
            for (const leadId of leadIds) {
                try {
                    const lead = await LeadService_1.LeadService.getLeadById(leadId);
                    if (!lead) {
                        failed.push({ leadId, error: 'Lead not found' });
                        continue;
                    }
                    const criteria = ApprovalService_1.ApprovalService.checkApprovalCriteria(lead);
                    if (!criteria.canApprove) {
                        failed.push({
                            leadId,
                            error: `Missing requirements: ${criteria.missingRequirements.join(', ')}`
                        });
                        continue;
                    }
                    if (lead.status !== 'under_verification' && lead.status !== 'documents_submitted') {
                        failed.push({
                            leadId,
                            error: `Invalid status: ${lead.status}`
                        });
                        continue;
                    }
                    await LeadService_1.LeadService.updateStatus(leadId, {
                        status: 'approved',
                        notes: notes || 'Bulk approved',
                        changedBy: userId,
                        changedByName: userName
                    }, req.user?.role || 'admin');
                    success.push(leadId);
                }
                catch (error) {
                    failed.push({ leadId, error: error.message || 'Approval failed' });
                }
            }
            res.json({
                success: true,
                data: {
                    success: success.length,
                    failed: failed.length,
                    total: leadIds.length,
                    successIds: success,
                    failedDetails: failed
                },
                message: `Approved ${success.length} of ${leadIds.length} leads`
            });
        }
        catch (error) {
            logger_1.default.error('Error bulk approving leads', {
                error: error.message,
                userId: req.user?.uid
            });
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to bulk approve leads'
            });
        }
    }
}
exports.ApprovalController = ApprovalController;
//# sourceMappingURL=ApprovalController.js.map