"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadService = void 0;
const Lead_1 = __importDefault(require("../models/Lead"));
const LeadActivity_1 = __importDefault(require("../models/LeadActivity"));
const DuplicateCheckService_1 = require("./DuplicateCheckService");
const ApprovalService_1 = require("./ApprovalService");
const permissions_1 = require("../lib/permissions");
const logger_1 = __importDefault(require("../config/logger"));
const uuid_1 = require("uuid");
class LeadService {
    /**
     * Generate unique lead ID
     */
    static generateLeadId() {
        return `LEAD-${Date.now()}-${(0, uuid_1.v4)().substring(0, 8).toUpperCase()}`;
    }
    /**
     * Create a new lead
     */
    static async createLead(data) {
        try {
            // Normalize phone
            const normalizedPhone = DuplicateCheckService_1.DuplicateCheckService.normalizePhone(data.phone);
            // Check for duplicates
            const duplicateCheck = await DuplicateCheckService_1.DuplicateCheckService.checkDuplicate(normalizedPhone, data.name, data.city);
            if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                throw new Error(`Duplicate lead found: ${duplicateCheck.existingLead.leadId} (${duplicateCheck.matchType})`);
            }
            // Decide initial status (restricted set)
            const initialStatus = data.status && ['lead_added', 'contacted', 'interested'].includes(data.status)
                ? data.status
                : 'lead_added';
            // Map primary skill category to human-readable name
            const primarySkillCategory = data.primarySkill.trim();
            const primarySkillNameMap = {
                'home_services': 'Home Services',
                'cleaning': 'Cleaning Services',
                'delivery': 'Delivery & Transport',
                'beauty': 'Beauty & Wellness',
                'tech': 'Tech Services',
                'tutoring': 'Education & Tutoring',
                'other': 'Other'
            };
            const primarySkillName = primarySkillNameMap[primarySkillCategory] || primarySkillCategory;
            // Create lead with primary skill automatically added to skills array
            const leadId = this.generateLeadId();
            const lead = new Lead_1.default({
                leadId,
                name: data.name.trim(),
                phone: normalizedPhone,
                email: data.email?.trim().toLowerCase(),
                city: data.city.trim(),
                state: data.state?.trim(),
                address: data.address?.trim(),
                pincode: data.pincode?.trim(),
                primarySkill: primarySkillCategory,
                source: data.source,
                sourceDetails: data.sourceDetails?.trim(),
                addedBy: data.addedBy,
                addedByName: data.addedByName,
                status: initialStatus,
                statusHistory: [{
                        status: initialStatus,
                        changedBy: data.addedBy,
                        changedByName: data.addedByName,
                        changedAt: new Date()
                    }],
                skills: [{
                        name: primarySkillName,
                        category: primarySkillCategory,
                        level: 'experienced',
                        toolsAvailable: false,
                        assignedBy: data.addedBy,
                        assignedAt: new Date()
                    }],
                documents: [],
                verificationStatus: {},
                communicationLog: [],
                internalNotes: [],
                isDuplicate: false,
                blacklisted: false
            });
            const savedLead = await lead.save();
            // Log activity for lead creation
            await this.logActivity(leadId, 'status_change', `Lead created with status: lead_added`, data.addedBy, data.addedByName);
            // Log activity for primary skill assignment
            await this.logActivity(leadId, 'skill_assigned', `Primary skill assigned: ${primarySkillName}`, data.addedBy, data.addedByName, undefined, { skillName: primarySkillName, category: primarySkillCategory });
            logger_1.default.info('Lead created', {
                leadId,
                name: data.name,
                phone: normalizedPhone,
                addedBy: data.addedBy
            });
            return savedLead;
        }
        catch (error) {
            logger_1.default.error('Error creating lead', {
                error: error.message,
                data
            });
            throw error;
        }
    }
    /**
     * Get lead by ID
     */
    static async getLeadById(leadId) {
        try {
            const lead = await Lead_1.default.findOne({ leadId }).lean();
            return lead;
        }
        catch (error) {
            logger_1.default.error('Error getting lead', {
                error: error.message,
                leadId
            });
            throw error;
        }
    }
    /**
     * Search and filter leads
     */
    static async searchLeads(filters) {
        try {
            const page = filters.page || 1;
            const limit = filters.limit || 20;
            const skip = (page - 1) * limit;
            // Build query
            const query = {};
            if (filters.status) {
                query.status = filters.status;
            }
            if (filters.city) {
                query.city = { $regex: new RegExp(filters.city, 'i') };
            }
            if (filters.primarySkill) {
                query.primarySkill = { $regex: new RegExp(filters.primarySkill, 'i') };
            }
            if (filters.source) {
                query.source = filters.source;
            }
            if (filters.addedBy) {
                query.addedBy = filters.addedBy;
            }
            if (filters.startDate || filters.endDate) {
                query.createdAt = {};
                if (filters.startDate) {
                    query.createdAt.$gte = filters.startDate;
                }
                if (filters.endDate) {
                    query.createdAt.$lte = filters.endDate;
                }
            }
            // Text search (name or phone)
            if (filters.search) {
                const searchRegex = new RegExp(filters.search, 'i');
                query.$or = [
                    { name: searchRegex },
                    { phone: searchRegex },
                    { leadId: searchRegex }
                ];
            }
            // Execute query
            const [leads, total] = await Promise.all([
                Lead_1.default.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Lead_1.default.countDocuments(query)
            ]);
            return {
                leads: leads,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            };
        }
        catch (error) {
            logger_1.default.error('Error searching leads', {
                error: error.message,
                filters
            });
            throw error;
        }
    }
    /**
     * Update lead
     */
    static async updateLead(leadId, data) {
        try {
            const updateData = {};
            if (data.name)
                updateData.name = data.name.trim();
            if (data.email !== undefined)
                updateData.email = data.email?.trim().toLowerCase();
            if (data.city)
                updateData.city = data.city.trim();
            if (data.state !== undefined)
                updateData.state = data.state?.trim();
            if (data.address !== undefined)
                updateData.address = data.address?.trim();
            if (data.pincode !== undefined)
                updateData.pincode = data.pincode?.trim();
            if (data.primarySkill)
                updateData.primarySkill = data.primarySkill.trim();
            if (data.source)
                updateData.source = data.source;
            if (data.sourceDetails !== undefined)
                updateData.sourceDetails = data.sourceDetails?.trim();
            if (data.skills)
                updateData.skills = data.skills;
            const lead = await Lead_1.default.findOneAndUpdate({ leadId }, { $set: updateData }, { new: true }).lean();
            return lead;
        }
        catch (error) {
            logger_1.default.error('Error updating lead', {
                error: error.message,
                leadId,
                data
            });
            throw error;
        }
    }
    /**
     * Update lead status
     */
    static async updateStatus(leadId, data, currentRole) {
        try {
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                throw new Error('Lead not found');
            }
            const currentStatus = lead.status;
            const newStatus = data.status;
            // Check permission
            if (!(0, permissions_1.canUpdateStatus)(currentRole, currentStatus, newStatus)) {
                throw new Error(`Role '${currentRole}' cannot update status from '${currentStatus}' to '${newStatus}'`);
            }
            // Update status
            lead.status = newStatus;
            lead.statusHistory.push({
                status: newStatus,
                changedBy: data.changedBy,
                changedByName: data.changedByName,
                changedAt: new Date(),
                notes: data.notes
            });
            const updatedLead = await lead.save();
            // Log activity
            await this.logActivity(leadId, 'status_change', `Status changed from ${currentStatus} to ${newStatus}`, data.changedBy, data.changedByName, { oldStatus: currentStatus, newStatus });
            logger_1.default.info('Lead status updated', {
                leadId,
                oldStatus: currentStatus,
                newStatus,
                changedBy: data.changedBy
            });
            return updatedLead;
        }
        catch (error) {
            logger_1.default.error('Error updating lead status', {
                error: error.message,
                leadId,
                data
            });
            throw error;
        }
    }
    /**
     * Add internal note
     */
    static async addNote(leadId, note, addedBy, addedByName, isPrivate) {
        try {
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                throw new Error('Lead not found');
            }
            lead.internalNotes.push({
                note: note.trim(),
                addedBy,
                addedByName,
                addedAt: new Date(),
                isPrivate: isPrivate || false
            });
            const updatedLead = await lead.save();
            // Log activity
            await this.logActivity(leadId, 'note', `Note added: ${note.substring(0, 50)}...`, addedBy, addedByName);
            return updatedLead;
        }
        catch (error) {
            logger_1.default.error('Error adding note', {
                error: error.message,
                leadId,
                addedBy
            });
            throw error;
        }
    }
    /**
     * Add document to lead
     */
    static async addDocument(leadId, document) {
        try {
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                throw new Error('Lead not found');
            }
            lead.documents.push(document);
            const updatedLead = await lead.save();
            // Log activity
            await this.logActivity(leadId, 'document_upload', `Document uploaded: ${document.type}`, document.uploadedAt ? 'system' : 'admin', undefined, { documentType: document.type });
            return updatedLead;
        }
        catch (error) {
            logger_1.default.error('Error adding document', {
                error: error.message,
                leadId,
                documentType: document.type
            });
            throw error;
        }
    }
    /**
     * Verify or reject a document
     */
    static async verifyDocument(leadId, documentIndex, status, verifiedBy, verifiedByName, rejectionReason) {
        try {
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                throw new Error('Lead not found');
            }
            if (documentIndex >= lead.documents.length) {
                throw new Error('Document not found');
            }
            const document = lead.documents[documentIndex];
            document.status = status;
            document.verifiedBy = verifiedBy;
            document.verifiedAt = new Date();
            if (status === 'rejected' && rejectionReason) {
                document.rejectionReason = rejectionReason;
            }
            const updatedLead = await lead.save();
            // Log activity
            await this.logActivity(leadId, 'document_verification', `Document ${status}: ${document.type}`, verifiedBy, verifiedByName, { documentType: document.type, status, rejectionReason });
            return updatedLead;
        }
        catch (error) {
            logger_1.default.error('Error verifying document', {
                error: error.message,
                leadId,
                documentIndex
            });
            throw error;
        }
    }
    /**
     * Delete a document
     */
    static async deleteDocument(leadId, documentIndex) {
        try {
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                throw new Error('Lead not found');
            }
            if (documentIndex >= lead.documents.length) {
                throw new Error('Document not found');
            }
            const documentType = lead.documents[documentIndex].type;
            lead.documents.splice(documentIndex, 1);
            const updatedLead = await lead.save();
            // Log activity
            await this.logActivity(leadId, 'document_upload', `Document deleted: ${documentType}`, 'admin', undefined, { documentType });
            return updatedLead;
        }
        catch (error) {
            logger_1.default.error('Error deleting document', {
                error: error.message,
                leadId,
                documentIndex
            });
            throw error;
        }
    }
    /**
     * Add skill to lead
     */
    static async addSkill(leadId, skill) {
        try {
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                throw new Error('Lead not found');
            }
            // Check for duplicates
            const existingSkill = lead.skills.find(s => s.name.toLowerCase() === skill.name.toLowerCase());
            if (existingSkill) {
                throw new Error('Skill already exists');
            }
            lead.skills.push(skill);
            const updatedLead = await lead.save();
            // Log activity
            await this.logActivity(leadId, 'skill_assigned', `Skill assigned: ${skill.name}`, skill.assignedBy || 'admin', undefined, { skillName: skill.name, category: skill.category });
            // Check if lead should be auto-approved (refresh lead to get latest state)
            if (updatedLead) {
                // Refresh lead from database to ensure we have latest documents and skills
                const freshLead = await this.getLeadById(leadId);
                if (freshLead) {
                    const criteria = ApprovalService_1.ApprovalService.checkApprovalCriteria(freshLead);
                    if (criteria.canApprove && freshLead.status !== 'approved' && freshLead.status !== 'activated') {
                        // Auto-approve if all criteria met
                        try {
                            await this.updateStatus(leadId, {
                                status: 'approved',
                                notes: 'Auto-approved: All documents verified and criteria met',
                                changedBy: 'system',
                                changedByName: 'System (Auto-approval)'
                            }, 'admin');
                            logger_1.default.info('Lead auto-approved after skill assignment', {
                                leadId,
                                criteria: {
                                    hasRequiredDocuments: criteria.hasRequiredDocuments,
                                    hasVerifiedDocuments: criteria.hasVerifiedDocuments,
                                    hasSkills: criteria.hasSkills,
                                    hasRequiredFields: criteria.hasRequiredFields
                                }
                            });
                        }
                        catch (error) {
                            logger_1.default.error('Error auto-approving lead after skill assignment', {
                                leadId,
                                error: error.message,
                                currentStatus: freshLead.status,
                                stack: error.stack
                            });
                            // Don't fail skill assignment if auto-approval fails
                        }
                    }
                    else {
                        logger_1.default.debug('Lead not ready for auto-approval after skill assignment', {
                            leadId,
                            canApprove: criteria.canApprove,
                            currentStatus: freshLead.status,
                            missingRequirements: criteria.missingRequirements
                        });
                    }
                }
            }
            return updatedLead;
        }
        catch (error) {
            logger_1.default.error('Error adding skill', {
                error: error.message,
                leadId,
                skillName: skill.name
            });
            throw error;
        }
    }
    /**
     * Update a skill
     */
    static async updateSkill(leadId, skillIndex, updateData) {
        try {
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                throw new Error('Lead not found');
            }
            if (skillIndex >= lead.skills.length) {
                throw new Error('Skill not found');
            }
            const skill = lead.skills[skillIndex];
            Object.assign(skill, updateData);
            const updatedLead = await lead.save();
            // Log activity
            await this.logActivity(leadId, 'skill_assigned', `Skill updated: ${skill.name}`, 'admin', undefined, { skillName: skill.name, updates: updateData });
            return updatedLead;
        }
        catch (error) {
            logger_1.default.error('Error updating skill', {
                error: error.message,
                leadId,
                skillIndex
            });
            throw error;
        }
    }
    /**
     * Remove a skill
     */
    static async removeSkill(leadId, skillIndex) {
        try {
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                throw new Error('Lead not found');
            }
            if (skillIndex >= lead.skills.length) {
                throw new Error('Skill not found');
            }
            const skillName = lead.skills[skillIndex].name;
            lead.skills.splice(skillIndex, 1);
            const updatedLead = await lead.save();
            // Log activity
            await this.logActivity(leadId, 'skill_assigned', `Skill removed: ${skillName}`, 'admin', undefined, { skillName });
            return updatedLead;
        }
        catch (error) {
            logger_1.default.error('Error removing skill', {
                error: error.message,
                leadId,
                skillIndex
            });
            throw error;
        }
    }
    /**
     * Log activity
     */
    static async logActivity(leadId, type, action, performedBy, performedByName, metadata) {
        try {
            const activity = new LeadActivity_1.default({
                activityId: `ACT-${Date.now()}-${(0, uuid_1.v4)().substring(0, 8).toUpperCase()}`,
                leadId,
                type: type,
                action,
                performedBy,
                performedByName,
                metadata: metadata || {}
            });
            await activity.save();
        }
        catch (error) {
            logger_1.default.error('Error logging activity', {
                error: error.message,
                leadId,
                type
            });
            // Don't throw - activity logging failure shouldn't break the main flow
        }
    }
}
exports.LeadService = LeadService;
//# sourceMappingURL=LeadService.js.map