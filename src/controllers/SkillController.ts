import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
import { LeadService } from '../services/LeadService';
import { UserRole } from '../lib/permissions';
import logger from '../config/logger';
import { ILeadSkill } from '../models/Lead';

export class SkillController {
  private static getUserId(req: AdminRequest): string | undefined {
    return req.admin?.userId || req.admin?.uid;
  }

  private static canMutatePickedLead(req: AdminRequest, lead: { addedBy: string; pickedBy?: string | null }): boolean {
    const role = req.admin?.role as UserRole;
    const userId = this.getUserId(req);

    if (!userId) return false;
    if (lead.pickedBy && lead.pickedBy !== userId) return false;

    if (role === 'qualifier') {
      return lead.pickedBy ? lead.pickedBy === userId : lead.addedBy === userId;
    }

    return true;
  }
  /**
   * Add skill to a lead
   * POST /api/v1/admin/caos/leads/:leadId/skills
   */
  static async addSkill(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { leadId } = req.params;
      const { name, category, level, toolsAvailable } = req.body;

      if (!name) {
        res.status(400).json({
          success: false,
          error: 'Skill name is required',
        });
        return;
      }

      const lead = await LeadService.getLeadById(leadId);
      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found',
        });
        return;
      }

      if (!this.canMutatePickedLead(req, lead)) {
        res.status(403).json({
          success: false,
          error: 'Permission denied',
          message: 'Only the picked qualifier can update this lead.'
        });
        return;
      }

      // Check if skill already exists
      const existingSkill = lead.skills.find(s => s.name.toLowerCase() === name.toLowerCase());
      if (existingSkill) {
        res.status(409).json({
          success: false,
          error: 'Skill already exists for this lead',
        });
        return;
      }

      const newSkill: ILeadSkill = {
        name: name.trim(),
        category: category?.trim(),
        level: level || 'experienced',
        toolsAvailable: toolsAvailable || false,
        assignedBy: req.admin.uid,
        assignedAt: new Date(),
      };

      const updatedLead = await LeadService.addSkill(leadId, newSkill);

      res.json({
        success: true,
        data: updatedLead,
        message: 'Skill added successfully',
      });
    } catch (error: any) {
      logger.error('Error in addSkill controller', {
        error: error.message,
        leadId: req.params.leadId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to add skill',
        message: error.message,
      });
    }
  }

  /**
   * Update a skill
   * PUT /api/v1/admin/caos/leads/:leadId/skills/:skillIndex
   */
  static async updateSkill(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { leadId, skillIndex } = req.params;
      const { name, category, level, toolsAvailable } = req.body;

      const index = parseInt(skillIndex);
      if (isNaN(index) || index < 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid skill index',
        });
        return;
      }

      const lead = await LeadService.getLeadById(leadId);
      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found',
        });
        return;
      }

      if (!this.canMutatePickedLead(req, lead)) {
        res.status(403).json({
          success: false,
          error: 'Permission denied',
          message: 'Only the picked qualifier can update this lead.'
        });
        return;
      }

      if (!lead.skills || index >= lead.skills.length) {
        res.status(404).json({
          success: false,
          error: 'Skill not found',
        });
        return;
      }

      const updateData: Partial<ILeadSkill> = {};
      if (name !== undefined) updateData.name = name.trim();
      if (category !== undefined) updateData.category = category?.trim();
      if (level !== undefined) updateData.level = level;
      if (toolsAvailable !== undefined) updateData.toolsAvailable = toolsAvailable;

      const updatedLead = await LeadService.updateSkill(leadId, index, updateData);

      res.json({
        success: true,
        data: updatedLead,
        message: 'Skill updated successfully',
      });
    } catch (error: any) {
      logger.error('Error in updateSkill controller', {
        error: error.message,
        leadId: req.params.leadId,
        skillIndex: req.params.skillIndex,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to update skill',
        message: error.message,
      });
    }
  }

  /**
   * Remove a skill
   * DELETE /api/v1/admin/caos/leads/:leadId/skills/:skillIndex
   */
  static async removeSkill(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { leadId, skillIndex } = req.params;
      const index = parseInt(skillIndex);

      if (isNaN(index) || index < 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid skill index',
        });
        return;
      }

      const lead = await LeadService.getLeadById(leadId);
      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found',
        });
        return;
      }

      if (!this.canMutatePickedLead(req, lead)) {
        res.status(403).json({
          success: false,
          error: 'Permission denied',
          message: 'Only the picked qualifier can update this lead.'
        });
        return;
      }

      if (!lead.skills || index >= lead.skills.length) {
        res.status(404).json({
          success: false,
          error: 'Skill not found',
        });
        return;
      }

      const updatedLead = await LeadService.removeSkill(leadId, index);

      res.json({
        success: true,
        data: updatedLead,
        message: 'Skill removed successfully',
      });
    } catch (error: any) {
      logger.error('Error in removeSkill controller', {
        error: error.message,
        leadId: req.params.leadId,
        skillIndex: req.params.skillIndex,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to remove skill',
        message: error.message,
      });
    }
  }
}

