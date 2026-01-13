import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
import { ActivationService } from '../services/ActivationService';
import { ApprovalService } from '../services/ApprovalService';
import { getPermissions, UserRole } from '../lib/permissions';
import logger from '../config/logger';

export class ActivationController {
  /**
   * Get activation queue (approved leads ready for activation)
   * GET /api/v1/admin/caos/leads/activation-queue
   */
  static async getActivationQueue(req: AdminRequest, res: Response) {
    try {
      const { city, primarySkill, page, limit } = req.query;

      const result = await ApprovalService.getActivationQueue({
        city: city as string,
        primarySkill: primarySkill as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined
      });

      res.json({
        success: true,
        data: {
          leads: result.leads,
          total: result.total,
          page: result.page,
          limit: result.limit
        }
      });
    } catch (error: any) {
      logger.error('Error fetching activation queue', {
        error: error.message,
        userId: req.user?.uid
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch activation queue'
      });
    }
  }

  /**
   * Activate a single lead (create account)
   * POST /api/v1/admin/caos/leads/:leadId/activate
   * ✅ ENFORCES: Only Operations and Admin can activate
   */
  static async activateLead(req: AdminRequest, res: Response) {
    try {
      const { leadId } = req.params;
      const userId = req.admin?.uid || req.user?.uid || 'system';
      const userName = req.admin?.name || req.user?.name || req.user?.email || 'Admin';
      const adminRole = (req.admin?.role || 'marketing') as UserRole;

      // ✅ BACKEND ENFORCEMENT: Marketing cannot activate
      const permissions = getPermissions(adminRole);
      if (!permissions.canActivate) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied',
          message: 'Only Operations and Admin can activate accounts. Marketing can only send invites.'
        });
      }

      const result = await ActivationService.activateLead(leadId, userId, userName, adminRole);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error || 'Activation failed'
        });
      }

      res.json({
        success: true,
        data: {
          firebaseUid: result.firebaseUid,
          profileCreated: result.profileCreated
        },
        message: 'Lead activated successfully'
      });
    } catch (error: any) {
      logger.error('Error activating lead', {
        error: error.message,
        leadId: req.params.leadId,
        userId: req.user?.uid
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to activate lead'
      });
    }
  }

  /**
   * Bulk activate leads
   * POST /api/v1/admin/caos/leads/bulk-activate
   * ✅ ENFORCES: Only Operations and Admin can bulk activate
   */
  static async bulkActivateLeads(req: AdminRequest, res: Response) {
    try {
      const { leadIds } = req.body;
      const userId = req.admin?.uid || req.user?.uid || 'system';
      const userName = req.admin?.name || req.user?.name || req.user?.email || 'Admin';
      const adminRole = (req.admin?.role || 'marketing') as UserRole;

      // ✅ BACKEND ENFORCEMENT: Marketing cannot bulk activate
      const permissions = getPermissions(adminRole);
      if (!permissions.canBulkActivate) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied',
          message: 'Only Operations and Admin can bulk activate accounts. Marketing can only send invites.'
        });
      }

      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'leadIds must be a non-empty array'
        });
      }

      const result = await ActivationService.bulkActivateLeads(leadIds, userId, userName, adminRole);

      res.json({
        success: true,
        data: result,
        message: `Activated ${result.success.length} of ${leadIds.length} leads`
      });
    } catch (error: any) {
      logger.error('Error bulk activating leads', {
        error: error.message,
        userId: req.user?.uid
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to bulk activate leads'
      });
    }
  }
}





