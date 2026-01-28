import Lead, { ILead, LeadStatus, LeadSource, ILeadDocument } from '../models/Lead';
import LeadActivity from '../models/LeadActivity';
import { DuplicateCheckService } from './DuplicateCheckService';
import { ApprovalService } from './ApprovalService';
import { canUpdateStatus, UserRole } from '../lib/permissions';
import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

export interface CreateLeadData {
  name: string;
  phone?: string;
  landline?: string;
  email?: string;
  city: string;
  state?: string;
  address?: string; // Local Area
  pincode?: string;
  primaryCategory?: string; // New field name
  primarySkill?: string; // Legacy field name (for backward compatibility)
  secondaryCategory?: string; // New field name
  secondarySkill?: string; // Legacy field name (for backward compatibility)
  experienceLevel: 'beginner' | 'intermediate' | 'experienced'; // Now required
  workingDays?: string;
  preferredTimeSlot?: string;
  source: LeadSource;
  sourceDetails?: string;
  agentCampaignId?: string;
  addedBy: string;
  addedByName?: string;
  status?: LeadStatus; // optional initial status (restricted set)
}

export interface ILeadSkill {
  name: string;
  category?: string;
  level?: 'beginner' | 'experienced';
  toolsAvailable?: boolean;
  assignedBy?: string;
  assignedAt?: Date;
}

export interface UpdateLeadData {
  name?: string;
  phone?: string;
  landline?: string;
  email?: string;
  city?: string;
  state?: string;
  address?: string;
  pincode?: string;
  primarySkill?: string;
  source?: LeadSource;
  sourceDetails?: string;
  skills?: ILeadSkill[];
}

export interface UpdateStatusData {
  status: LeadStatus;
  notes?: string;
  changedBy: string;
  changedByName?: string;
}

export interface SearchFilters {
  status?: LeadStatus;
  city?: string;
  primarySkill?: string;
  source?: LeadSource;
  addedBy?: string;
  search?: string; // Name or phone search
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export class LeadService {
  /**
   * Generate unique lead ID
   */
  static generateLeadId(): string {
    return `LEAD-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;
  }

  /**
   * Create a new lead
   */
  static async createLead(
    data: CreateLeadData,
    options?: { skipNameCityDuplicate?: boolean }
  ): Promise<ILead> {
    try {
      // Ensure at least one contact number is provided
      if (!data.phone?.trim() && !data.landline?.trim()) {
        throw new Error('At least one contact number (phone or landline) is required');
      }

      // Normalize phone and landline
      const normalizedPhone = data.phone ? DuplicateCheckService.normalizePhone(data.phone) : null;
      const normalizedLandline = data.landline ? DuplicateCheckService.normalizeLandline(data.landline) : null;

      // Support both new (primaryCategory) and legacy (primarySkill) field names
      const primarySkillCategory = (data.primaryCategory || data.primarySkill || '').trim();
      const secondaryCategoryValue = (data.secondaryCategory || data.secondarySkill || '').trim();

      // Check for duplicates (considering category) - check both phone and landline
      let duplicateCheck;
      if (options?.skipNameCityDuplicate) {
        // Check phone duplicates if phone provided
        if (normalizedPhone) {
          duplicateCheck = await DuplicateCheckService.checkPhoneCategoryDuplicate(
            normalizedPhone,
            primarySkillCategory,
            secondaryCategoryValue
          );
          if (duplicateCheck.isDuplicate && duplicateCheck.sameCategory) {
            // Found duplicate, return it
          } else if (normalizedLandline) {
            // Also check landline
            const landlineCheck = await DuplicateCheckService.checkPhoneCategoryDuplicate(
              normalizedLandline,
              primarySkillCategory,
              secondaryCategoryValue
            );
            if (landlineCheck.isDuplicate && landlineCheck.sameCategory) {
              duplicateCheck = landlineCheck;
            }
          }
        } else if (normalizedLandline) {
          duplicateCheck = await DuplicateCheckService.checkPhoneCategoryDuplicate(
            normalizedLandline,
            primarySkillCategory,
            secondaryCategoryValue
          );
        } else {
          duplicateCheck = { isDuplicate: false };
        }
      } else {
        // Use comprehensive duplicate check
        duplicateCheck = await DuplicateCheckService.checkDuplicateWithCategory(
          normalizedPhone || normalizedLandline || '',
          primarySkillCategory,
          secondaryCategoryValue,
          data.name,
          data.city
        );
      }

      if (duplicateCheck.isDuplicate && duplicateCheck.sameCategory) {
        throw new Error(
          `This person with this category already exists: ${duplicateCheck.existingLead?.leadId} (${duplicateCheck.matchType})`
        );
      }
      // If sameCategory is false, allow it (different category for same person)

      // Decide initial status (restricted set)
      const initialStatus: LeadStatus = data.status && ['lead_added', 'contacted', 'interested'].includes(data.status)
        ? data.status
        : 'lead_added';

      // Validate categories (already extracted above)
      if (!primarySkillCategory) {
        throw new Error('Primary category is required');
      }
      
      if (!secondaryCategoryValue) {
        throw new Error('Secondary category is required');
      }
      
      if (!data.experienceLevel) {
        throw new Error('Experience level is required');
      }

      // Map primary skill category to human-readable name
      const primarySkillNameMap: Record<string, string> = {
        'cleaning': 'Cleaning',
        'handyperson': 'Handyperson',
        'moving': 'Moving & Delivery',
        'gardening': 'Gardening',
        'business': 'Business Services',
        'marketing': 'Marketing & Design',
        'tech': 'Tech Support',
        'tutoring': 'Tutoring',
        'photography': 'Photography',
        'beauty': 'Beauty & Wellness',
        'pet-care': 'Pet Care',
        'events': 'Events & Entertainment',
        'other': 'Other'
      };
      const primarySkillName = primarySkillNameMap[primarySkillCategory] || primarySkillCategory;

      // Create lead with primary skill automatically added to skills array
      const leadId = this.generateLeadId();
      const lead = new Lead({
        leadId,
        name: data.name.trim(),
        phone: normalizedPhone,
        email: data.email?.trim().toLowerCase(),
        city: data.city.trim(),
        state: data.state?.trim(),
        address: data.address?.trim(),
        pincode: data.pincode?.trim(),
        primarySkill: primarySkillCategory,  // Legacy field
        primaryCategory: primarySkillCategory,  // New field
        secondarySkill: secondaryCategoryValue,  // Legacy field
        secondaryCategory: secondaryCategoryValue,  // New field
        experienceLevel: data.experienceLevel,
        workingDays: data.workingDays?.trim(),
        preferredTimeSlot: data.preferredTimeSlot?.trim(),
        source: data.source,
        sourceDetails: data.sourceDetails?.trim(),
        agentCampaignId: data.agentCampaignId?.trim(),
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
          level: (data.experienceLevel || 'beginner') as 'beginner' | 'intermediate' | 'experienced',
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
      await this.logActivity(
        leadId,
        'status_change',
        `Lead created with status: lead_added`,
        data.addedBy,
        data.addedByName
      );

      // Log activity for primary skill assignment
      await this.logActivity(
        leadId,
        'skill_assigned',
        `Primary skill assigned: ${primarySkillName}`,
        data.addedBy,
        data.addedByName,
        { skillName: primarySkillName, category: primarySkillCategory }
      );

      logger.info('Lead created', {
        leadId,
        name: data.name,
        phone: normalizedPhone,
        landline: normalizedLandline,
        addedBy: data.addedBy
      });

      return savedLead;
    } catch (error: any) {
      logger.error('Error creating lead', {
        error: error.message,
        data
      });
      throw error;
    }
  }

  /**
   * Normalize lead data to ensure primaryCategory is always present
   * (fallback to primarySkill for backward compatibility)
   */
  private static normalizeLeadData(lead: any): any {
    if (!lead) return lead;
    
    // Ensure primaryCategory is set (fallback to primarySkill for old leads)
    if (!lead.primaryCategory && lead.primarySkill) {
      lead.primaryCategory = lead.primarySkill;
    }
    
    // Ensure secondaryCategory is set (fallback to secondarySkill for old leads)
    if (!lead.secondaryCategory && lead.secondarySkill) {
      lead.secondaryCategory = lead.secondarySkill;
    }
    
    return lead;
  }

  /**
   * Get lead by ID
   */
  static async getLeadById(leadId: string): Promise<ILead | null> {
    try {
      const lead = await Lead.findOne({ leadId }).lean();
      if (!lead) return null;
      
      // Normalize lead data to ensure primaryCategory is present
      return this.normalizeLeadData(lead) as ILead;
    } catch (error: any) {
      logger.error('Error getting lead', {
        error: error.message,
        leadId
      });
      throw error;
    }
  }

  /**
   * Search and filter leads
   */
  /**
   * Get unique users who have added leads (for filter dropdown)
   * Returns array of { userId, name } for users who have added at least one lead
   */
  static async getLeadCreators(): Promise<Array<{ userId: string; name: string }>> {
    try {
      // Use aggregation to get distinct addedBy values with their names
      const creators = await Lead.aggregate([
        {
          $match: {
            addedBy: { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: '$addedBy',
            // Get the most recent non-null name
            names: { $push: '$addedByName' }
          }
        },
        {
          $project: {
            userId: '$_id',
            name: {
              $let: {
                vars: {
                  filteredNames: {
                    $filter: {
                      input: '$names',
                      as: 'name',
                      cond: { $ne: ['$$name', null] }
                    }
                  }
                },
                in: {
                  $cond: {
                    if: { $gt: [{ $size: '$$filteredNames' }, 0] },
                    then: { $arrayElemAt: ['$$filteredNames', -1] }, // Get last non-null name
                    else: 'Unknown'
                  }
                }
              }
            }
          }
        },
        {
          $sort: { name: 1 } // Sort alphabetically by name
        }
      ]);

      return creators.map(c => ({
        userId: c.userId,
        name: c.name || 'Unknown'
      }));
    } catch (error: any) {
      logger.error('Error getting lead creators', {
        error: error.message
      });
      throw error;
    }
  }

  static async searchLeads(filters: SearchFilters): Promise<{
    leads: ILead[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const skip = (page - 1) * limit;

      // Build query
      const query: any = {};

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

      // Text search (name, phone, city, or leadId)
      if (filters.search) {
        const searchRegex = new RegExp(filters.search, 'i');
        query.$or = [
          { name: searchRegex },
          { phone: searchRegex },
          { city: searchRegex },
          { leadId: searchRegex }
        ];
      }

      // Execute query
      const [leads, total] = await Promise.all([
        Lead.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Lead.countDocuments(query)
      ]);

      // Normalize lead data to ensure primaryCategory is present
      const normalizedLeads = leads.map(lead => this.normalizeLeadData(lead));

      return {
        leads: normalizedLeads as unknown as ILead[],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error: any) {
      logger.error('Error searching leads', {
        error: error.message,
        filters
      });
      throw error;
    }
  }

  /**
   * Update lead
   */
  static async updateLead(leadId: string, data: UpdateLeadData & { skills?: ILeadSkill[] }): Promise<ILead | null> {
    try {
      const updateData: any = {};

      if (data.name) updateData.name = data.name.trim();
      if (data.phone !== undefined) {
        updateData.phone = data.phone?.trim() ? DuplicateCheckService.normalizePhone(data.phone.trim()) : undefined;
      }
      if (data.landline !== undefined) {
        updateData.landline = data.landline?.trim() ? DuplicateCheckService.normalizeLandline(data.landline.trim()) : undefined;
      }
      // Ensure at least one contact number remains after update
      // Get existing lead to check current phone/landline values
      const existingLead = await Lead.findOne({ leadId }).lean();
      if (!existingLead) {
        throw new Error('Lead not found');
      }
      
      // Determine final values after update
      const finalPhone = updateData.phone !== undefined ? updateData.phone : existingLead.phone;
      const finalLandline = updateData.landline !== undefined ? updateData.landline : existingLead.landline;
      
      // Validate at least one contact number exists after update
      if (!finalPhone?.trim() && !finalLandline?.trim()) {
        throw new Error('At least one contact number (phone or landline) must be present');
      }
      if (data.email !== undefined) updateData.email = data.email?.trim().toLowerCase();
      if (data.city) updateData.city = data.city.trim();
      if (data.state !== undefined) updateData.state = data.state?.trim();
      if (data.address !== undefined) updateData.address = data.address?.trim();
      if (data.pincode !== undefined) updateData.pincode = data.pincode?.trim();
      if (data.primarySkill) updateData.primarySkill = data.primarySkill.trim();
      if (data.source) updateData.source = data.source;
      if (data.sourceDetails !== undefined) updateData.sourceDetails = data.sourceDetails?.trim();
      if (data.skills) updateData.skills = data.skills;

      const lead = await Lead.findOneAndUpdate(
        { leadId },
        { $set: updateData },
        { new: true }
      ).lean();

      return lead as ILead | null;
    } catch (error: any) {
      logger.error('Error updating lead', {
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
  static async updateStatus(
    leadId: string,
    data: UpdateStatusData,
    currentRole: UserRole
  ): Promise<ILead | null> {
    try {
      const lead = await Lead.findOne({ leadId });
      if (!lead) {
        throw new Error('Lead not found');
      }

      const currentStatus = lead.status;
      const newStatus = data.status;

      // Check permission
      if (!canUpdateStatus(currentRole, currentStatus, newStatus)) {
        throw new Error(
          `Role '${currentRole}' cannot update status from '${currentStatus}' to '${newStatus}'`
        );
      }

      // ✅ Auto-transition: When marketing sets status to 'documents_submitted', 
      // automatically transition to 'under_verification' so lead appears in verification queue
      let finalStatus = newStatus;
      // ✅ UPDATED: Removed 'activated' check - activation is now tracked via accountStatus, not lead status
      if (newStatus === 'documents_submitted' && currentStatus !== 'under_verification' && currentStatus !== 'approved') {
        finalStatus = 'under_verification';
        logger.info('Auto-transitioning lead from documents_submitted to under_verification', {
          leadId,
          changedBy: data.changedBy
        });
      }

      // Update status
      lead.status = finalStatus;
      lead.statusHistory.push({
        status: finalStatus,
        changedBy: data.changedBy,
        changedByName: data.changedByName,
        changedAt: new Date(),
        notes: newStatus === 'documents_submitted' && finalStatus === 'under_verification' 
          ? (data.notes || '') + ' (Auto-transitioned to verification queue)'
          : data.notes
      });

      const updatedLead = await lead.save();

      // Log activity
      await this.logActivity(
        leadId,
        'status_change',
        `Status changed from ${currentStatus} to ${finalStatus}${finalStatus !== newStatus ? ` (requested: ${newStatus})` : ''}`,
        data.changedBy,
        data.changedByName,
        { oldStatus: currentStatus, newStatus: finalStatus, requestedStatus: newStatus }
      );

      logger.info('Lead status updated', {
        leadId,
        oldStatus: currentStatus,
        newStatus: finalStatus,
        requestedStatus: newStatus,
        changedBy: data.changedBy
      });

      return updatedLead;
    } catch (error: any) {
      logger.error('Error updating lead status', {
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
  static async addNote(
    leadId: string,
    note: string,
    addedBy: string,
    addedByName?: string,
    isPrivate?: boolean
  ): Promise<ILead | null> {
    try {
      const lead = await Lead.findOne({ leadId });
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
      await this.logActivity(
        leadId,
        'note',
        `Note added: ${note.substring(0, 50)}...`,
        addedBy,
        addedByName
      );

      return updatedLead;
    } catch (error: any) {
      logger.error('Error adding note', {
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
  static async addDocument(
    leadId: string,
    document: ILead['documents'][0]
  ): Promise<ILead | null> {
    try {
      const lead = await Lead.findOne({ leadId });
      if (!lead) {
        throw new Error('Lead not found');
      }

      lead.documents.push(document);
      const updatedLead = await lead.save();

      // Log activity
      await this.logActivity(
        leadId,
        'document_upload',
        `Document uploaded: ${document.type}`,
        document.uploadedAt ? 'system' : 'lead_access_manager',
        undefined,
        { documentType: document.type }
      );

      return updatedLead;
    } catch (error: any) {
      logger.error('Error adding document', {
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
  static async verifyDocument(
    leadId: string,
    documentIndex: number,
    status: 'verified' | 'rejected',
    verifiedBy: string,
    verifiedByName?: string,
    rejectionReason?: string,
    exactDetails?: {
      exactAadhaarNumber?: string;
      exactPANNumber?: string;
      exactAddressDetails?: string;
    }
  ): Promise<ILead | null> {
    try {
      const lead = await Lead.findOne({ leadId });
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
        // Clear exact details if rejecting
        document.exactAadhaarNumber = undefined;
        document.exactPANNumber = undefined;
        document.exactAddressDetails = undefined;
      } else if (status === 'verified') {
        // ✅ MANDATORY: Exact details must be provided when verifying Aadhaar, PAN, or Address Proof
        if (document.type === 'aadhaar') {
          if (!exactDetails || !exactDetails.exactAadhaarNumber) {
            throw new Error('Exact Aadhaar number is mandatory when verifying Aadhaar document');
          }
          // Validate Aadhaar format (12 digits)
          const cleaned = exactDetails.exactAadhaarNumber.replace(/\D/g, '');
          if (cleaned.length !== 12) {
            throw new Error('Aadhaar number must be exactly 12 digits');
          }
          document.exactAadhaarNumber = cleaned;
          logger.info('Stored exact Aadhaar number for document verification', {
            leadId,
            documentIndex,
            masked: `${cleaned.slice(0, 4)} ${cleaned.slice(4, 8)} ${cleaned.slice(8)}`
          });
        } else if (document.type === 'pan') {
          if (!exactDetails || !exactDetails.exactPANNumber) {
            throw new Error('Exact PAN number is mandatory when verifying PAN document');
          }
          // Validate PAN format (10 characters: 5 letters, 4 digits, 1 letter)
          const cleaned = exactDetails.exactPANNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
          if (cleaned.length !== 10 || !/^[A-Z]{5}\d{4}[A-Z]{1}$/.test(cleaned)) {
            throw new Error('PAN number must be in format ABCDE1234F');
          }
          document.exactPANNumber = cleaned;
          logger.info('Stored exact PAN number for document verification', {
            leadId,
            documentIndex,
            masked: `${cleaned.slice(0, 2)}XXXX${cleaned.slice(6)}`
          });
        } else if (document.type === 'address_proof') {
          if (!exactDetails || !exactDetails.exactAddressDetails) {
            throw new Error('Exact address details are mandatory when verifying Address Proof document');
          }
          if (exactDetails.exactAddressDetails.trim().length < 10) {
            throw new Error('Address details must be at least 10 characters long');
          }
          document.exactAddressDetails = exactDetails.exactAddressDetails.trim();
          logger.info('Stored exact address details for document verification', {
            leadId,
            documentIndex
          });
        }
      }

      const updatedLead = await lead.save();

      // Log activity
      await this.logActivity(
        leadId,
        'document_verification',
        `Document ${status}: ${document.type}`,
        verifiedBy,
        verifiedByName,
        { documentType: document.type, status, rejectionReason }
      );

      return updatedLead;
    } catch (error: any) {
      logger.error('Error verifying document', {
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
  static async deleteDocument(
    leadId: string,
    documentIndex: number
  ): Promise<ILead | null> {
    try {
      const lead = await Lead.findOne({ leadId });
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
      await this.logActivity(
        leadId,
        'document_upload',
        `Document deleted: ${documentType}`,
        'lead_access_manager',
        undefined,
        { documentType }
      );

      return updatedLead;
    } catch (error: any) {
      logger.error('Error deleting document', {
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
  static async addSkill(
    leadId: string,
    skill: ILeadSkill
  ): Promise<ILead | null> {
    try {
      const lead = await Lead.findOne({ leadId });
      if (!lead) {
        throw new Error('Lead not found');
      }

      // Check for duplicates
      const existingSkill = lead.skills.find(
        s => s.name.toLowerCase() === skill.name.toLowerCase()
      );
      if (existingSkill) {
        throw new Error('Skill already exists');
      }

      lead.skills.push(skill);
      const updatedLead = await lead.save();

      // Log activity
      await this.logActivity(
        leadId,
        'skill_assigned',
        `Skill assigned: ${skill.name}`,
        skill.assignedBy || 'lead_access_manager',
        undefined,
        { skillName: skill.name, category: skill.category }
      );

      // Check if lead should be auto-approved (refresh lead to get latest state)
      if (updatedLead) {
        // Refresh lead from database to ensure we have latest documents and skills
        const freshLead = await this.getLeadById(leadId);
        if (freshLead) {
          const criteria = ApprovalService.checkApprovalCriteria(freshLead);
          // ✅ UPDATED: Removed 'activated' check - activation is now tracked via accountStatus, not lead status
          if (criteria.canApprove && freshLead.status !== 'approved') {
            // Auto-approve if all criteria met
            try {
              await this.updateStatus(leadId, {
                status: 'approved',
                notes: 'Auto-approved: All documents verified and criteria met',
                changedBy: 'system',
                changedByName: 'System (Auto-approval)'
              }, 'lead_access_manager');
              logger.info('Lead auto-approved after skill assignment', { 
                leadId,
                criteria: {
                  hasRequiredDocuments: criteria.hasRequiredDocuments,
                  hasVerifiedDocuments: criteria.hasVerifiedDocuments,
                  hasSkills: criteria.hasSkills,
                  hasRequiredFields: criteria.hasRequiredFields
                }
              });
            } catch (error: any) {
              logger.error('Error auto-approving lead after skill assignment', { 
                leadId, 
                error: error.message,
                currentStatus: freshLead.status,
                stack: error.stack
              });
              // Don't fail skill assignment if auto-approval fails
            }
          } else {
            logger.debug('Lead not ready for auto-approval after skill assignment', {
              leadId,
              canApprove: criteria.canApprove,
              currentStatus: freshLead.status,
              missingRequirements: criteria.missingRequirements
            });
          }
        }
      }

      return updatedLead;
    } catch (error: any) {
      logger.error('Error adding skill', {
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
  static async updateSkill(
    leadId: string,
    skillIndex: number,
    updateData: Partial<ILeadSkill>
  ): Promise<ILead | null> {
    try {
      const lead = await Lead.findOne({ leadId });
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
      await this.logActivity(
        leadId,
        'skill_assigned',
        `Skill updated: ${skill.name}`,
        'lead_access_manager',
        undefined,
        { skillName: skill.name, updates: updateData }
      );

      return updatedLead;
    } catch (error: any) {
      logger.error('Error updating skill', {
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
  static async removeSkill(
    leadId: string,
    skillIndex: number
  ): Promise<ILead | null> {
    try {
      const lead = await Lead.findOne({ leadId });
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
      await this.logActivity(
        leadId,
        'skill_assigned',
        `Skill removed: ${skillName}`,
        'lead_access_manager',
        undefined,
        { skillName }
      );

      return updatedLead;
    } catch (error: any) {
      logger.error('Error removing skill', {
        error: error.message,
        leadId,
        skillIndex
      });
      throw error;
    }
  }

  /**
   * Update address from Aadhaar verification
   */
  static async updateAddressFromAadhaar(
    leadId: string,
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      pincode: string;
    }
  ): Promise<ILead | null> {
    try {
      const lead = await Lead.findOne({ leadId });
      if (!lead) {
        throw new Error('Lead not found');
      }

      // Update address fields
      const fullAddress = `${address.line1}${address.line2 ? ', ' + address.line2 : ''}`;
      lead.address = fullAddress;
      lead.city = address.city;
      lead.state = address.state;
      lead.pincode = address.pincode;

      const updatedLead = await lead.save();

      // Log activity
      await this.logActivity(
        leadId,
        'address_update',
        `Address updated from Aadhaar verification: ${address.city}, ${address.state} - ${address.pincode}`,
        'system',
        'Aadhaar Verification',
        { source: 'aadhaar_verification', address }
      );

      logger.info('Address updated from Aadhaar verification', {
        leadId,
        city: address.city,
        state: address.state,
        pincode: address.pincode
      });

      return updatedLead;
    } catch (error: any) {
      logger.error('Error updating address from Aadhaar', {
        error: error.message,
        leadId
      });
      throw error;
    }
  }

  /**
   * Mark address as verified
   */
  static async markAddressAsVerified(
    leadId: string,
    data: {
      verifiedBy: string;
      verifiedAt: Date;
      source: string;
    }
  ): Promise<ILead | null> {
    try {
      const lead = await Lead.findOne({ leadId });
      if (!lead) {
        throw new Error('Lead not found');
      }

      // Find or create address_proof document
      let addressDoc = lead.documents.find(doc => doc.type === 'address_proof');
      
      if (!addressDoc) {
        // Create address_proof document if it doesn't exist
        addressDoc = {
          type: 'address_proof',
          status: 'verified',
          verifiedBy: data.verifiedBy,
          verifiedAt: data.verifiedAt,
          addressDetails: lead.address || `${lead.city}, ${lead.state} - ${lead.pincode}`
        };
        lead.documents.push(addressDoc);
      } else {
        // Update existing address_proof document
        addressDoc.status = 'verified';
        addressDoc.verifiedBy = data.verifiedBy;
        addressDoc.verifiedAt = data.verifiedAt;
        if (!addressDoc.addressDetails) {
          addressDoc.addressDetails = lead.address || `${lead.city}, ${lead.state} - ${lead.pincode}`;
        }
      }

      const updatedLead = await lead.save();

      // Log activity
      await this.logActivity(
        leadId,
        'address_verification',
        `Address verified via ${data.source}`,
        data.verifiedBy,
        undefined,
        { source: data.source }
      );

      logger.info('Address marked as verified', {
        leadId,
        source: data.source,
        verifiedBy: data.verifiedBy
      });

      return updatedLead;
    } catch (error: any) {
      logger.error('Error marking address as verified', {
        error: error.message,
        leadId
      });
      throw error;
    }
  }

  /**
   * Delete a lead
   */
  static async deleteLead(leadId: string, deletedBy: string, deletedByName?: string): Promise<void> {
    try {
      const lead = await Lead.findOne({ leadId });
      
      if (!lead) {
        throw new Error('Lead not found');
      }

      // Log deletion activity before deleting
      await this.logActivity(
        leadId,
        'deletion',
        'Lead deleted',
        deletedBy,
        deletedByName,
        {
          leadName: lead.name,
          leadPhone: lead.phone,
          leadCity: lead.city,
          status: lead.status,
          accountStatus: lead.accountStatus
        }
      );

      // Delete the lead
      await Lead.deleteOne({ leadId });

      logger.info('Lead deleted successfully', {
        leadId,
        deletedBy,
        deletedByName,
        leadName: lead.name
      });
    } catch (error: any) {
      logger.error('Error deleting lead', {
        error: error.message,
        leadId,
        deletedBy
      });
      throw error;
    }
  }

  /**
   * Log activity
   */
  static async logActivity(
    leadId: string,
    type: string,
    action: string,
    performedBy: string,
    performedByName?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const activity = new LeadActivity({
        activityId: `ACT-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`,
        leadId,
        type: type as any,
        action,
        performedBy,
        performedByName,
        metadata: metadata || {}
      });

      await activity.save();
    } catch (error: any) {
      logger.error('Error logging activity', {
        error: error.message,
        leadId,
        type
      });
      // Don't throw - activity logging failure shouldn't break the main flow
    }
  }
}

