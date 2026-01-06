import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
import { LeadService } from '../services/LeadService';
import { UserRole, LeadStatus } from '../lib/permissions';
import logger from '../config/logger';

export class BulkOperationsController {
  /**
   * Bulk status change
   * POST /api/v1/admin/caos/leads/bulk-status
   */
  static async bulkStatusChange(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { leadIds, status, notes } = req.body;

      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'leadIds array is required',
        });
        return;
      }

      if (!status) {
        res.status(400).json({
          success: false,
          error: 'status is required',
        });
        return;
      }

      const role = (req.admin.role || 'marketing') as UserRole;
      const results = {
        success: 0,
        failed: 0,
        errors: [] as Array<{ leadId: string; error: string }>,
      };

      for (const leadId of leadIds) {
        try {
          await LeadService.updateStatus(
            leadId,
            {
              status: status as LeadStatus,
              notes,
              changedBy: req.admin.uid,
              changedByName: req.admin.name,
            },
            role
          );
          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            leadId,
            error: error.message || 'Failed to update status',
          });
        }
      }

      res.json({
        success: true,
        data: results,
        message: `Updated ${results.success} leads successfully`,
      });
    } catch (error: any) {
      logger.error('Error in bulkStatusChange controller', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to update statuses',
        message: error.message,
      });
    }
  }

  /**
   * Bulk assign skills
   * POST /api/v1/admin/caos/leads/bulk-assign-skills
   */
  static async bulkAssignSkills(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { leadIds, skills } = req.body;

      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'leadIds array is required',
        });
        return;
      }

      if (!Array.isArray(skills) || skills.length === 0) {
        res.status(400).json({
          success: false,
          error: 'skills array is required',
        });
        return;
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as Array<{ leadId: string; error: string }>,
      };

      for (const leadId of leadIds) {
        try {
          const lead = await LeadService.getLeadById(leadId);
          if (!lead) {
            results.failed++;
            results.errors.push({
              leadId,
              error: 'Lead not found',
            });
            continue;
          }

          // Add skills (avoid duplicates)
          const existingSkillNames = new Set(lead.skills.map(s => s.name));
          const newSkills = skills
            .filter((s: any) => !existingSkillNames.has(s.name))
            .map((s: any) => ({
              name: s.name,
              category: s.category,
              level: s.level || 'experienced',
              toolsAvailable: s.toolsAvailable || false,
              assignedBy: req.admin?.uid || req.user?.uid || 'system',
              assignedAt: new Date(),
            }));

          await LeadService.updateLead(leadId, {
            skills: [...lead.skills, ...newSkills],
          } as any);

          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            leadId,
            error: error.message || 'Failed to assign skills',
          });
        }
      }

      res.json({
        success: true,
        data: results,
        message: `Assigned skills to ${results.success} leads successfully`,
      });
    } catch (error: any) {
      logger.error('Error in bulkAssignSkills controller', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to assign skills',
        message: error.message,
      });
    }
  }
}

