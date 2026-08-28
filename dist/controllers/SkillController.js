"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillController = void 0;
const LeadService_1 = require("../services/LeadService");
const logger_1 = __importDefault(require("../config/logger"));
class SkillController {
    static getUserId(req) {
        return req.admin?.userId || req.admin?.uid;
    }
    static canMutatePickedLead(req, lead) {
        const role = req.admin?.role;
        const userId = this.getUserId(req);
        if (!userId)
            return false;
        if (lead.pickedBy && lead.pickedBy !== userId)
            return false;
        if (role === 'qualifier') {
            return lead.pickedBy ? lead.pickedBy === userId : lead.addedBy === userId;
        }
        return true;
    }
    /**
     * Add skill to a lead
     * POST /api/v1/admin/caos/leads/:leadId/skills
     */
    static async addSkill(req, res) {
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
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
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
            const newSkill = {
                name: name.trim(),
                category: category?.trim(),
                level: level || 'experienced',
                toolsAvailable: toolsAvailable || false,
                assignedBy: req.admin.uid,
                assignedAt: new Date(),
            };
            const updatedLead = await LeadService_1.LeadService.addSkill(leadId, newSkill);
            res.json({
                success: true,
                data: updatedLead,
                message: 'Skill added successfully',
            });
        }
        catch (error) {
            logger_1.default.error('Error in addSkill controller', {
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
    static async updateSkill(req, res) {
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
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
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
            const updateData = {};
            if (name !== undefined)
                updateData.name = name.trim();
            if (category !== undefined)
                updateData.category = category?.trim();
            if (level !== undefined)
                updateData.level = level;
            if (toolsAvailable !== undefined)
                updateData.toolsAvailable = toolsAvailable;
            const updatedLead = await LeadService_1.LeadService.updateSkill(leadId, index, updateData);
            res.json({
                success: true,
                data: updatedLead,
                message: 'Skill updated successfully',
            });
        }
        catch (error) {
            logger_1.default.error('Error in updateSkill controller', {
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
    static async removeSkill(req, res) {
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
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
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
            const updatedLead = await LeadService_1.LeadService.removeSkill(leadId, index);
            res.json({
                success: true,
                data: updatedLead,
                message: 'Skill removed successfully',
            });
        }
        catch (error) {
            logger_1.default.error('Error in removeSkill controller', {
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
exports.SkillController = SkillController;
//# sourceMappingURL=SkillController.js.map