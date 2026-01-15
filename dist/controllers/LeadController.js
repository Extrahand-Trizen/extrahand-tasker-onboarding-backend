"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadController = void 0;
const LeadService_1 = require("../services/LeadService");
const DuplicateCheckService_1 = require("../services/DuplicateCheckService");
const logger_1 = __importDefault(require("../config/logger"));
class LeadController {
    /**
     * Create a new lead
     * POST /api/v1/admin/caos/leads
     */
    static async createLead(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const { name, phone, email, city, state, address, pincode, primaryCategory, primarySkill, // Legacy support
            secondaryCategory, secondarySkill, // Legacy support
            experienceLevel, workingDays, preferredTimeSlot, source, sourceDetails } = req.body;
            // Validation - support both new and legacy field names
            const primaryCategoryValue = primaryCategory || primarySkill;
            const secondaryCategoryValue = secondaryCategory || secondarySkill;
            if (!name || !phone || !city || !primaryCategoryValue || !source) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    message: 'Name, phone, city, primary category, and source are required'
                });
                return;
            }
            if (!secondaryCategoryValue) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    message: 'Secondary category is required'
                });
                return;
            }
            if (!experienceLevel) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    message: 'Experience level is required'
                });
                return;
            }
            const leadData = {
                name,
                phone,
                email,
                city,
                state,
                address,
                pincode,
                primaryCategory: primaryCategoryValue,
                primarySkill: primarySkill, // For backward compatibility
                secondaryCategory: secondaryCategoryValue,
                secondarySkill: secondarySkill, // For backward compatibility
                experienceLevel,
                workingDays,
                preferredTimeSlot,
                source,
                sourceDetails,
                addedBy: req.admin.uid || req.admin?.userId || "",
                addedByName: req.admin.name
            };
            try {
                const lead = await LeadService_1.LeadService.createLead(leadData);
                res.status(201).json({
                    success: true,
                    data: lead,
                    message: 'Lead created successfully'
                });
            }
            catch (error) {
                if (error.message.includes('Duplicate')) {
                    res.status(409).json({
                        success: false,
                        error: 'Duplicate lead',
                        message: error.message
                    });
                    return;
                }
                throw error;
            }
        }
        catch (error) {
            logger_1.default.error('Error in createLead controller', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: 'Failed to create lead',
                message: error.message
            });
        }
    }
    /**
     * Get lead by ID
     * GET /api/v1/admin/caos/leads/:leadId
     */
    static async getLead(req, res) {
        try {
            const { leadId } = req.params;
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
            if (!lead) {
                res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
                return;
            }
            res.json({
                success: true,
                data: lead
            });
        }
        catch (error) {
            logger_1.default.error('Error in getLead controller', {
                error: error.message,
                leadId: req.params.leadId
            });
            res.status(500).json({
                success: false,
                error: 'Failed to get lead',
                message: error.message
            });
        }
    }
    /**
     * Search and filter leads
     * GET /api/v1/admin/caos/leads
     */
    static async searchLeads(req, res) {
        try {
            const { status, city, primarySkill, source, addedBy, search, startDate, endDate, page, limit } = req.query;
            const filters = {
                status: status,
                city: city,
                primarySkill: primarySkill,
                source: source,
                addedBy: addedBy,
                search: search,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined
            };
            const result = await LeadService_1.LeadService.searchLeads(filters);
            res.json({
                success: true,
                data: result.leads,
                pagination: {
                    page: result.page,
                    limit: result.limit,
                    total: result.total,
                    totalPages: result.totalPages
                }
            });
        }
        catch (error) {
            logger_1.default.error('Error in searchLeads controller', {
                error: error.message
            });
            res.status(500).json({
                success: false,
                error: 'Failed to search leads',
                message: error.message
            });
        }
    }
    /**
     * Update lead
     * PUT /api/v1/admin/caos/leads/:leadId
     */
    static async updateLead(req, res) {
        try {
            const { leadId } = req.params;
            const updateData = req.body;
            const lead = await LeadService_1.LeadService.updateLead(leadId, updateData);
            if (!lead) {
                res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
                return;
            }
            res.json({
                success: true,
                data: lead,
                message: 'Lead updated successfully'
            });
        }
        catch (error) {
            logger_1.default.error('Error in updateLead controller', {
                error: error.message,
                leadId: req.params.leadId
            });
            res.status(500).json({
                success: false,
                error: 'Failed to update lead',
                message: error.message
            });
        }
    }
    /**
     * Update lead status
     * PUT /api/v1/admin/caos/leads/:leadId/status
     */
    static async updateStatus(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const { leadId } = req.params;
            const { status, notes } = req.body;
            if (!status) {
                res.status(400).json({
                    success: false,
                    error: 'Status is required'
                });
                return;
            }
            const role = (req.admin.role || 'qualifier');
            const statusData = {
                status,
                notes,
                changedBy: req.admin.uid || req.admin?.userId || "",
                changedByName: req.admin.name
            };
            try {
                const lead = await LeadService_1.LeadService.updateStatus(leadId, statusData, role);
                if (!lead) {
                    res.status(404).json({
                        success: false,
                        error: 'Lead not found'
                    });
                    return;
                }
                res.json({
                    success: true,
                    data: lead,
                    message: 'Status updated successfully'
                });
            }
            catch (error) {
                if (error.message.includes('cannot update status')) {
                    res.status(403).json({
                        success: false,
                        error: 'Permission denied',
                        message: error.message
                    });
                    return;
                }
                throw error;
            }
        }
        catch (error) {
            logger_1.default.error('Error in updateStatus controller', {
                error: error.message,
                leadId: req.params.leadId
            });
            res.status(500).json({
                success: false,
                error: 'Failed to update status',
                message: error.message
            });
        }
    }
    /**
     * Add internal note
     * POST /api/v1/admin/caos/leads/:leadId/notes
     */
    static async addNote(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const { leadId } = req.params;
            const { note, isPrivate } = req.body;
            if (!note || !note.trim()) {
                res.status(400).json({
                    success: false,
                    error: 'Note is required'
                });
                return;
            }
            const lead = await LeadService_1.LeadService.addNote(leadId, note, req.admin.uid || req.admin?.userId || "", req.admin.name, isPrivate);
            if (!lead) {
                res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
                return;
            }
            res.json({
                success: true,
                data: lead,
                message: 'Note added successfully'
            });
        }
        catch (error) {
            logger_1.default.error('Error in addNote controller', {
                error: error.message,
                leadId: req.params.leadId
            });
            res.status(500).json({
                success: false,
                error: 'Failed to add note',
                message: error.message
            });
        }
    }
    /**
     * Check for duplicates
     * POST /api/v1/admin/caos/leads/duplicate-check
     */
    static async checkDuplicate(req, res) {
        try {
            const { phone, name, city } = req.body;
            if (!phone) {
                res.status(400).json({
                    success: false,
                    error: 'Phone number is required'
                });
                return;
            }
            const result = await DuplicateCheckService_1.DuplicateCheckService.checkDuplicate(phone, name, city);
            res.json({
                success: true,
                data: result
            });
        }
        catch (error) {
            logger_1.default.error('Error in checkDuplicate controller', {
                error: error.message
            });
            res.status(500).json({
                success: false,
                error: 'Failed to check duplicate',
                message: error.message
            });
        }
    }
    /**
     * Get status history
     * GET /api/v1/admin/caos/leads/:leadId/history
     */
    static async getStatusHistory(req, res) {
        try {
            const { leadId } = req.params;
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
            if (!lead) {
                res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
                return;
            }
            res.json({
                success: true,
                data: {
                    statusHistory: lead.statusHistory,
                    currentStatus: lead.status
                }
            });
        }
        catch (error) {
            logger_1.default.error('Error in getStatusHistory controller', {
                error: error.message,
                leadId: req.params.leadId
            });
            res.status(500).json({
                success: false,
                error: 'Failed to get status history',
                message: error.message
            });
        }
    }
}
exports.LeadController = LeadController;
//# sourceMappingURL=LeadController.js.map