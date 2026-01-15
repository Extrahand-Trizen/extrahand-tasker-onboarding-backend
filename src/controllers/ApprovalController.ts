import { Request, Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
import { ApprovalService } from '../services/ApprovalService';
import { LeadService } from '../services/LeadService';
import { UserRole } from '../lib/permissions';
import logger from '../config/logger';

export class ApprovalController {
  /**
   * Get approval queue (leads ready for approval)
   * GET /api/v1/admin/caos/leads/approval-queue
   * ✅ ISOLATION: Qualifiers only see leads they added (but they shouldn't access approval queue anyway)
   * Note: Approval queue is typically for onboarders/admin, but we add isolation for consistency
   */
  static async getApprovalQueue(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { city, primarySkill, page, limit } = req.query;
      const role = req.admin.role as UserRole;
      const userId = req.admin.userId || req.admin.uid;

      // Build filters
      const filters: any = {
        city: city as string,
        primarySkill: primarySkill as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined
      };

      // ✅ ISOLATION: Qualifiers can only see leads they added
      // Onboarders and Lead Access Managers can see all leads
      if (role === 'qualifier' && userId) {
        filters.addedBy = userId;
      }

      const result = await ApprovalService.getApprovalQueue(filters);

      // Check approval criteria for each lead
      const leadsWithCriteria = result.leads.map(lead => {
        const criteria = ApprovalService.checkApprovalCriteria(lead);
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
    } catch (error: any) {
      logger.error('Error fetching approval queue', {
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
  static async checkApprovalCriteria(req: AdminRequest, res: Response) {
    try {
      const { leadId } = req.params;

      const lead = await LeadService.getLeadById(leadId);
      if (!lead) {
        return res.status(404).json({
          success: false,
          error: 'Lead not found'
        });
      }

      const criteria = ApprovalService.checkApprovalCriteria(lead);

      res.json({
        success: true,
        data: criteria
      });
    } catch (error: any) {
      logger.error('Error checking approval criteria', {
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
  static async approveLead(req: AdminRequest, res: Response) {
    try {
      const { leadId } = req.params;
      const { notes } = req.body;
      const userId = req.user?.uid || 'system';
      const userName = req.user?.name || req.user?.email || 'Admin';

      // Check approval criteria
      const lead = await LeadService.getLeadById(leadId);
      if (!lead) {
        return res.status(404).json({
          success: false,
          error: 'Lead not found'
        });
      }

      const criteria = ApprovalService.checkApprovalCriteria(lead);
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
      const updatedLead = await LeadService.updateStatus(leadId, {
        status: 'approved',
        notes: notes || 'Lead approved',
        changedBy: userId,
        changedByName: userName
      }, (req.user?.role as UserRole) || 'lead_access_manager');

      res.json({
        success: true,
        data: updatedLead,
        message: 'Lead approved successfully'
      });
    } catch (error: any) {
      logger.error('Error approving lead', {
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
  static async bulkApproveLeads(req: AdminRequest, res: Response) {
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

      const success: string[] = [];
      const failed: Array<{ leadId: string; error: string }> = [];

      for (const leadId of leadIds) {
        try {
          const lead = await LeadService.getLeadById(leadId);
          if (!lead) {
            failed.push({ leadId, error: 'Lead not found' });
            continue;
          }

          const criteria = ApprovalService.checkApprovalCriteria(lead);
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

          await LeadService.updateStatus(leadId, {
            status: 'approved',
            notes: notes || 'Bulk approved',
            changedBy: userId,
            changedByName: userName
          }, (req.user?.role as UserRole) || 'lead_access_manager');

          success.push(leadId);
        } catch (error: any) {
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
    } catch (error: any) {
      logger.error('Error bulk approving leads', {
        error: error.message,
        userId: req.user?.uid
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to bulk approve leads'
      });
    }
  }

  /**
   * Get verification queue (leads with pending documents)
   * GET /api/v1/admin/caos/leads/verification-queue
   */
  static async getVerificationQueue(req: AdminRequest, res: Response) {
    try {
      const { documentType, status, city, page, limit } = req.query;

      const result = await ApprovalService.getVerificationQueue({
        documentType: documentType as string,
        status: status as any,
        city: city as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Error fetching verification queue', {
        error: error.message,
        userId: req.user?.uid
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch verification queue'
      });
    }
  }
}

