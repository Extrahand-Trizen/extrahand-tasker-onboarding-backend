import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
import { LeadService, CreateLeadData, UpdateLeadData, UpdateStatusData, SearchFilters } from '../services/LeadService';
import { DuplicateCheckService } from '../services/DuplicateCheckService';
import { getConversionStatusByPhone } from '../services/UserLookupService';
import { CertificateReviewService } from '../services/CertificateReviewService';
import Lead from '../models/Lead';
import { UserRole } from '../lib/permissions';
import logger from '../config/logger';
import { LEAD_STATUS_REASON_CODES } from '../constants/leadContactTracking';

/**
 * Helper function to get consistent userId from req.admin
 * Handles both JWT (userId) and Firebase (uid) authentication
 */
function getUserId(req: AdminRequest): string | undefined {
  return req.admin?.userId || req.admin?.uid;
}

/**
 * Helper function to check if user can access a lead (for qualifiers)
 * Qualifiers can only access leads they added
 * Lead Access Managers and Onboarders can access all leads
 */
function canAccessLead(req: AdminRequest, leadAddedBy: string): boolean {
  const role = req.admin?.role as UserRole;
  const userId = getUserId(req);
  
  // Lead Access Managers and Onboarders can access all leads
  if (role === 'lead_access_manager' || role === 'onboarder') {
    return true;
  }
  
  // Qualifiers can only access their own leads
  if (role === 'qualifier') {
    return userId === leadAddedBy;
  }
  
  // Support and Trust roles - check permissions (they might have read-only access to all)
  // For now, allow them to see all (can be restricted later if needed)
  return true;
}

export class LeadController {
  static async getStatusReasonCodes(req: AdminRequest, res: Response): Promise<void> {
    try {
      res.json({
        success: true,
        data: LEAD_STATUS_REASON_CODES
      });
    } catch (error: any) {
      logger.error('Error in getStatusReasonCodes controller', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get status reason codes',
        message: error.message
      });
    }
  }

  private static extractVerifiedSkillCertificates(profile: any): Array<{
    skillName: string;
    certificateType?: string;
    issuingAuthority?: string;
    certificateNumber?: string;
    uploadedAt?: string;
    reviewedAt?: string;
  }> {
    const skills = profile?.skills?.list || [];
    const verifiedCertificates: Array<{
      skillName: string;
      certificateType?: string;
      issuingAuthority?: string;
      certificateNumber?: string;
      uploadedAt?: string;
      reviewedAt?: string;
    }> = [];

    skills.forEach((skill: any) => {
      const skillName = skill?.name || 'Unknown Skill';
      const certificates = Array.isArray(skill?.certificates) ? skill.certificates : [];

      certificates.forEach((certificate: any) => {
        if (certificate?.status !== 'verified') {
          return;
        }

        verifiedCertificates.push({
          skillName,
          certificateType: certificate?.certificateType || certificate?.title,
          issuingAuthority: certificate?.issuingAuthority || certificate?.issuedBy,
          certificateNumber: certificate?.certificateNumber,
          uploadedAt: certificate?.uploadedAt || certificate?.issueDate || certificate?.issuedDate,
          reviewedAt: certificate?.reviewedAt,
        });
      });
    });

    return verifiedCertificates;
  }

  /**
   * Create a new lead
   * POST /api/v1/admin/caos/leads
   */
  static async createLead(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const {
        name,
        phone,
        landline,
        email,
        city,
        state,
        address,
        pincode,
        primaryCategory,
        primarySkill, // Legacy support
        secondaryCategory,
        secondarySkill, // Legacy support
        experienceLevel,
        workingDays,
        preferredTimeSlot,
        source,
        sourceDetails
      } = req.body;

      // Validation - support both new and legacy field names
      const primaryCategoryValue = primaryCategory || primarySkill;
      const secondaryCategoryValue = secondaryCategory || secondarySkill;
      
      // Validate at least one contact number is provided
      if (!phone?.trim() && !landline?.trim()) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'At least one contact number (phone or landline) is required'
        });
        return;
      }
      
      if (!name?.trim()) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'Name is required'
        });
        return;
      }

      const leadData: CreateLeadData = {
        name: name.trim(),
        phone: phone?.trim() || undefined,
        landline: landline?.trim() || undefined,
        email,
        city,
        state,
        address,
        pincode,
        primaryCategory: primaryCategoryValue,
        primarySkill: primarySkill, // For backward compatibility
        secondaryCategory: secondaryCategoryValue || '',
        secondarySkill: secondarySkill || '', // For backward compatibility
        experienceLevel,
        workingDays,
        preferredTimeSlot,
        source,
        sourceDetails,
        addedBy: req.admin.uid || req.admin?.userId || "",
        addedByName: req.admin.name
      };

      try {
        const lead = await LeadService.createLead(leadData);
        res.status(201).json({
          success: true,
          data: lead,
          message: 'Lead created successfully'
        });
      } catch (error: any) {
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
    } catch (error: any) {
      logger.error('Error in createLead controller', {
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
   * ✅ ISOLATION: Qualifiers can only access leads they added
   */
  static async getLead(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { leadId } = req.params;

      const lead = await LeadService.getLeadById(leadId);

      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found'
        });
        return;
      }

      // ✅ ISOLATION: Check if qualifier can access this lead
      if (!canAccessLead(req, lead.addedBy)) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You can only access leads that you have added.'
        });
        return;
      }

      res.json({
        success: true,
        data: lead
      });
    } catch (error: any) {
      logger.error('Error in getLead controller', {
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
   * Get conversion status (did lead register on main website and verify Aadhaar?)
   * GET /api/v1/onboarding/leads/:leadId/conversion-status
   */
  static async getConversionStatus(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { leadId } = req.params;
      const lead = await LeadService.getLeadById(leadId);

      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found'
        });
        return;
      }

      if (!canAccessLead(req, lead.addedBy)) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You can only access leads that you have added.'
        });
        return;
      }

      const phone = lead.phone || (lead as any).landline;
      if (!phone) {
        res.status(400).json({
          success: false,
          error: 'Lead has no phone number',
          message: 'Cannot check conversion status without a phone number.'
        });
        return;
      }

      const status = await getConversionStatusByPhone(phone);

      // Optionally cache on lead for list views
      if (status.converted && (status.platformUid || status.isAadhaarVerified !== undefined)) {
        await Lead.findOneAndUpdate(
          { leadId },
          {
            $set: {
              conversionData: {
                platformUid: status.platformUid,
                isAadhaarVerified: status.isAadhaarVerified,
                lastCheckedAt: new Date()
              }
            }
          }
        );
      }

      res.json({
        success: true,
        data: {
          converted: status.converted,
          platformUid: status.platformUid,
          isAadhaarVerified: status.isAadhaarVerified,
          name: status.name
        }
      });
    } catch (error: any) {
      logger.error('Error in getConversionStatus', {
        error: error.message,
        leadId: req.params.leadId
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get conversion status',
        message: error.message
      });
    }
  }

  /**
   * Get verified skill certificates for a lead from platform profile.
   * GET /api/v1/onboarding/leads/:leadId/verified-certificates
   */
  static async getVerifiedCertificates(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { leadId } = req.params;
      const lead = await LeadService.getLeadById(leadId);

      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found'
        });
        return;
      }

      if (!canAccessLead(req, lead.addedBy)) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You can only access leads that you have added.'
        });
        return;
      }

      const phone = lead.phone || (lead as any).landline;
      if (!phone) {
        res.json({
          success: true,
          data: {
            platformUid: undefined,
            certificates: []
          }
        });
        return;
      }

      let platformUid = lead.conversionData?.platformUid;

      if (!platformUid) {
        const conversion = await getConversionStatusByPhone(phone);
        platformUid = conversion.platformUid;

        if (platformUid || conversion.isAadhaarVerified !== undefined) {
          await Lead.findOneAndUpdate(
            { leadId },
            {
              $set: {
                conversionData: {
                  platformUid,
                  isAadhaarVerified: conversion.isAadhaarVerified,
                  lastCheckedAt: new Date()
                }
              }
            }
          );
        }
      }

      if (!platformUid) {
        res.json({
          success: true,
          data: {
            platformUid: undefined,
            certificates: []
          }
        });
        return;
      }

      const actorUid = req.admin.userId || req.admin.uid || 'system';
      const profile = await CertificateReviewService.getProfileByUid(platformUid, actorUid);
      const certificates = LeadController.extractVerifiedSkillCertificates(profile);

      res.json({
        success: true,
        data: {
          platformUid,
          certificates
        }
      });
    } catch (error: any) {
      logger.error('Error in getVerifiedCertificates', {
        error: error.message,
        leadId: req.params.leadId
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get verified certificates',
        message: error.message
      });
    }
  }

  /**
   * Get unique users who have added leads (for filter dropdown)
   * GET /api/v1/onboarding/leads/creators
   */
  static async getLeadCreators(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const creators = await LeadService.getLeadCreators();

      res.json({
        success: true,
        data: creators
      });
    } catch (error: any) {
      logger.error('Error in getLeadCreators controller', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get lead creators',
        message: error.message
      });
    }
  }

  /**
   * Search and filter leads
   * GET /api/v1/admin/caos/leads
   * ✅ ISOLATION: Qualifiers only see leads they added
   */
  static async searchLeads(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const {
        status,
        city,
        primarySkill,
        source,
        addedBy,
        search,
        startDate,
        endDate,
        page,
        limit,
        registrationStatus
      } = req.query;

      const role = req.admin.role as UserRole;
      const userId = getUserId(req);

      const filters: SearchFilters = {
        status: status as any,
        city: city as string,
        primarySkill: primarySkill as string,
        source: source as any,
        addedBy: addedBy as string,
        search: search as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        registrationStatus: registrationStatus as SearchFilters['registrationStatus']
      };

      // ✅ ISOLATION: Qualifiers can only see leads they added
      // Lead Access Managers and Onboarders can see all leads
      if (role === 'qualifier' && userId) {
        filters.addedBy = userId; // Override any client-supplied addedBy
        logger.debug('Qualifier isolation applied', {
          userId,
          role,
          filteredBy: userId
        });
      }

      const result = await LeadService.searchLeads(filters);

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
    } catch (error: any) {
      logger.error('Error in searchLeads controller', {
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
  static async updateLead(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { leadId } = req.params;
      const updateData: UpdateLeadData = req.body;

      const lead = await LeadService.updateLead(leadId, updateData);

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
    } catch (error: any) {
      logger.error('Error in updateLead controller', {
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
   * ✅ ISOLATION: Qualifiers can only update leads they added
   */
  static async updateStatus(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { leadId } = req.params;
      const { status, notes, statusReasonCode, statusReasonText, callbackAt, expectedOnboardingAt } = req.body;

      if (!status) {
        res.status(400).json({
          success: false,
          error: 'Status is required'
        });
        return;
      }

      // ✅ ISOLATION: Check if qualifier can access this lead
      const existingLead = await LeadService.getLeadById(leadId);
      if (!existingLead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found'
        });
        return;
      }

      if (!canAccessLead(req, existingLead.addedBy)) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You can only update leads that you have added.'
        });
        return;
      }

      const role = (req.admin.role || 'qualifier') as UserRole;

      const statusData: UpdateStatusData = {
        status,
        notes,
        statusReasonCode,
        statusReasonText,
        callbackAt,
        expectedOnboardingAt,
        changedBy: req.admin.uid || req.admin?.userId || "" ,
        changedByName: req.admin.name
      };

      try {
        const lead = await LeadService.updateStatus(leadId, statusData, role);

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
      } catch (error: any) {
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
    } catch (error: any) {
      logger.error('Error in updateStatus controller', {
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
  static async addNote(req: AdminRequest, res: Response): Promise<void> {
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

      const lead = await LeadService.addNote(
        leadId,
        note,
        req.admin.uid || req.admin?.userId || "",
        req.admin.name,
        isPrivate
      );

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
    } catch (error: any) {
      logger.error('Error in addNote controller', {
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
  static async checkDuplicate(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { phone, landline, name, city } = req.body;

      // At least one contact number must be provided
      if (!phone?.trim() && !landline?.trim()) {
        res.status(400).json({
          success: false,
          error: 'At least one contact number (phone or landline) is required'
        });
        return;
      }

      const result = await DuplicateCheckService.checkDuplicate(
        phone?.trim() || undefined,
        landline?.trim() || undefined,
        name,
        city
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Error in checkDuplicate controller', {
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
  static async getStatusHistory(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { leadId } = req.params;

      const lead = await LeadService.getLeadById(leadId);

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
    } catch (error: any) {
      logger.error('Error in getStatusHistory controller', {
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

  /**
   * Delete a lead
   * DELETE /api/v1/admin/caos/leads/:leadId
   */
  static async deleteLead(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { leadId } = req.params;
      const userId = getUserId(req);
      const userName = req.admin.name;

      // Check if user can access this lead
      const existingLead = await LeadService.getLeadById(leadId);
      if (!existingLead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found'
        });
        return;
      }

      // Check access permissions
      if (!canAccessLead(req, existingLead.addedBy)) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You can only delete leads that you have added.'
        });
        return;
      }

      await LeadService.deleteLead(leadId, userId || '', userName);

      res.json({
        success: true,
        message: 'Lead deleted successfully'
      });
    } catch (error: any) {
      logger.error('Error in deleteLead controller', {
        error: error.message,
        leadId: req.params.leadId
      });
      res.status(500).json({
        success: false,
        error: 'Failed to delete lead',
        message: error.message
      });
    }
  }
}







