import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
import { LeadService, CreateLeadData, UpdateLeadData, UpdateStatusData, SearchFilters, CallbackQueueFilters, FollowUpQueueFilters } from '../services/LeadService';
import { DuplicateCheckService } from '../services/DuplicateCheckService';
import { getConversionStatusByPhone } from '../services/UserLookupService';
import { CertificateReviewService } from '../services/CertificateReviewService';
import Lead from '../models/Lead';
import { UserRole } from '../lib/permissions';
import logger from '../config/logger';
import { LEAD_STATUS_REASON_CODES } from '../constants/leadContactTracking';
import axios from 'axios';
import { env } from '../config/env';

const CONVERSION_STATUS_CACHE_MS = 60 * 1000;

/**
 * Helper function to get consistent userId from req.admin
 * Handles both JWT (userId) and Firebase (uid) authentication
 */
function getUserId(req: AdminRequest): string | undefined {
  return req.admin?.userId || req.admin?.uid;
}

function getScopedAddedByIds(req: AdminRequest): string[] {
  const ids = [req.admin?.userId, req.admin?.uid].filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );
  return Array.from(new Set(ids));
}

/**
 * Read access for lead data.
 * Qualifier/Onboarder/Lead Access Manager can view all leads.
 */
function canViewLead(req: AdminRequest): boolean {
  const role = req.admin?.role as UserRole;
  return role === 'lead_access_manager' || role === 'onboarder' || role === 'qualifier' || role === 'support' || role === 'trust';
}

/**
 * Mutating access for lead records.
 * Qualifier can mutate only own leads.
 * Onboarder/Lead Access Manager can mutate all leads.
 */
function canManageLead(req: AdminRequest, leadAddedBy: string): boolean {
  const role = req.admin?.role as UserRole;
  const userId = getUserId(req);

  if (role === 'lead_access_manager' || role === 'onboarder') return true;
  if (role === 'qualifier') return userId === leadAddedBy;
  return false;
}

function parseISTDateOnly(value: string, endOfDay = false): Date | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const istOffsetMs = 5.5 * 60 * 60 * 1000;

  return endOfDay
    ? new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - istOffsetMs)
    : new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - istOffsetMs);
}

function shouldRefreshConversionSnapshot(lead: {
  phone?: string;
  landline?: string;
  conversionData?: {
    platformUid?: string;
    isAadhaarVerified?: boolean;
    lastCheckedAt?: Date;
  };
}): boolean {
  const hasPhone = !!(lead.phone || lead.landline);
  if (!hasPhone) {
    return false;
  }

  if (lead.conversionData?.platformUid && lead.conversionData?.isAadhaarVerified !== true) {
    return true;
  }

  const lastCheckedAt = lead.conversionData?.lastCheckedAt
    ? new Date(lead.conversionData.lastCheckedAt).getTime()
    : 0;
  const isSnapshotStale =
    !lastCheckedAt ||
    Number.isNaN(lastCheckedAt) ||
    Date.now() - lastCheckedAt >= CONVERSION_STATUS_CACHE_MS;

  return isSnapshotStale && !lead.conversionData?.platformUid;
}

export class LeadController {
  static async getDashboardMetrics(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      if (!env.USER_SERVICE_URL) {
        logger.warn('USER_SERVICE_URL is not configured; returning fallback dashboard metrics', {
          actor: getUserId(req) || 'system',
        });
        res.json({
          success: true,
          data: {
            taskersAadhaarVerified: 0,
          },
        });
        return;
      }

      const actorUid = getUserId(req) || 'system';
      let taskersAadhaarVerified = 0;
      try {
        const response = await axios.get(
          `${env.USER_SERVICE_URL}/api/v1/profiles/internal/stats/taskers/aadhaar-verified`,
          {
            headers: {
              'X-Service-Auth': env.SERVICE_AUTH_TOKEN,
              'X-Service-Name': 'admin-service',
              'X-User-Id': actorUid,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );
        taskersAadhaarVerified = response.data?.data?.taskersAadhaarVerified ?? 0;
      } catch (error: any) {
        logger.error('Dashboard metrics upstream call failed; returning fallback value', {
          actorUid,
          userServiceUrl: env.USER_SERVICE_URL,
          error: error?.message,
          status: axios.isAxiosError(error) ? error.response?.status : undefined,
          responseData: axios.isAxiosError(error) ? error.response?.data : undefined,
          code: axios.isAxiosError(error) ? error.code : undefined,
        });
      }

      res.json({
        success: true,
        data: {
          taskersAadhaarVerified,
        },
      });
    } catch (error: any) {
      logger.error('Error in getDashboardMetrics controller', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dashboard metrics',
        message: error.message
      });
    }
  }

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
      
      const phoneValue = typeof phone === 'string' ? phone.trim() : (phone ? String(phone).trim() : '');
      const landlineValue = typeof landline === 'string' ? landline.trim() : (landline ? String(landline).trim() : '');

      // Validate at least one contact number is provided
      if (!phoneValue && !landlineValue) {
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
        phone: phoneValue || undefined,
        landline: landlineValue || undefined,
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
      if (!canViewLead(req)) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You are not allowed to access this lead.'
        });
        return;
      }

      let leadToReturn = lead;

      if (shouldRefreshConversionSnapshot(lead)) {
        const phone = lead.phone || (lead as any).landline;
        const status = await getConversionStatusByPhone(phone);

        if (status.converted && (status.platformUid || status.isAadhaarVerified !== undefined)) {
          const refreshedLead = await Lead.findOneAndUpdate(
            { leadId },
            {
              $set: {
                conversionData: {
                  platformUid: status.platformUid,
                  isAadhaarVerified: status.isAadhaarVerified,
                  lastCheckedAt: new Date()
                }
              }
            },
            { new: true }
          );

          if (refreshedLead) {
            leadToReturn = refreshedLead;
          }
        }
      }

      res.json({
        success: true,
        data: leadToReturn
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

      if (!canViewLead(req)) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You are not allowed to access this lead.'
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

      if (!canViewLead(req)) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You are not allowed to access this lead.'
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

      // Keep search generic; caller (UI/page) decides whether to scope by addedBy.
      // This is required so "All Leads" can remain truly global for allowed roles.

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
   * Get callback queue.
   * GET /api/v1/onboarding/leads/callback-queue
   * Qualifier: only own leads
   * Onboarder/Admin: all leads
   */
  static async getCallbackQueue(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { city, primarySkill, startDate, endDate, page, limit } = req.query;
      const role = req.admin.role as UserRole;
      const scopedIds = getScopedAddedByIds(req);

      const filters: CallbackQueueFilters = {
        city: city as string,
        primarySkill: primarySkill as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      };

      if (role === 'qualifier' && scopedIds.length > 0) {
        filters.addedByAny = scopedIds;
      }

      const result = await LeadService.getCallbackQueue(filters);

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
      logger.error('Error in getCallbackQueue controller', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch callback queue',
        message: error.message
      });
    }
  }

  /**
   * Get callback queue counters for dashboard widgets.
   * GET /api/v1/onboarding/leads/callback-queue/stats
   */
  static async getCallbackQueueStats(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const role = req.admin.role as UserRole;
      const scopedIds = getScopedAddedByIds(req);

      const filters: Pick<CallbackQueueFilters, 'addedBy' | 'addedByAny'> = {};
      if (role === 'qualifier' && scopedIds.length > 0) {
        filters.addedByAny = scopedIds;
      }

      const stats = await LeadService.getCallbackQueueStats(filters);

      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      logger.error('Error in getCallbackQueueStats controller', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch callback queue stats',
        message: error.message
      });
    }
  }

  /**
   * Unified follow-up queue for callback + onboarding promises.
   * GET /api/v1/onboarding/leads/follow-up-queue
   */
  static async getFollowUpQueue(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const {
        city,
        primarySkill,
        startDate,
        endDate,
        dueType,
        bucket,
        page,
        limit,
      } = req.query;
      const role = req.admin.role as UserRole;
      const scopedIds = getScopedAddedByIds(req);

      const rawStartDate = startDate as string | undefined;
      const rawEndDate = endDate as string | undefined;
      const parsedStartDate = rawStartDate
        ? (rawStartDate.includes('T') ? new Date(rawStartDate) : parseISTDateOnly(rawStartDate))
        : undefined;
      const parsedEndDate = rawEndDate
        ? (rawEndDate.includes('T') ? new Date(rawEndDate) : parseISTDateOnly(rawEndDate, true))
        : undefined;

      const filters: FollowUpQueueFilters = {
        city: city as string,
        primarySkill: primarySkill as string,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        dueType: (dueType as FollowUpQueueFilters['dueType']) || 'all',
        bucket: (bucket as FollowUpQueueFilters['bucket']) || 'all',
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      };

      if (role === 'qualifier' && scopedIds.length > 0) {
        filters.addedByAny = scopedIds;
      }

      const result = await LeadService.getFollowUpQueue(filters);

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
      logger.error('Error in getFollowUpQueue controller', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch follow-up queue',
        message: error.message
      });
    }
  }

  /**
   * Unified follow-up stats for callback + onboarding promises.
   * GET /api/v1/onboarding/leads/follow-up-queue/stats
   */
  static async getFollowUpQueueStats(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const role = req.admin.role as UserRole;
      const scopedIds = getScopedAddedByIds(req);

      const filters: Pick<FollowUpQueueFilters, 'addedBy' | 'addedByAny'> = {};
      if (role === 'qualifier' && scopedIds.length > 0) {
        filters.addedByAny = scopedIds;
      }

      const stats = await LeadService.getFollowUpQueueStats(filters);

      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      logger.error('Error in getFollowUpQueueStats controller', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch follow-up queue stats',
        message: error.message
      });
    }
  }

  /**
   * GET /api/v1/onboarding/leads/status-analytics
   */
  static async getStatusAnalytics(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const role = req.admin.role as UserRole;
      const userId = getUserId(req);
      const { from, to, qualifierId } = req.query;

      const fromDate = from ? new Date(from as string) : new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      const toDate = to ? new Date(to as string) : new Date();

      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        res.status(400).json({
          success: false,
          error: 'Invalid date range',
          message: 'from/to must be valid ISO date strings'
        });
        return;
      }

      const filters: { from: Date; to: Date; qualifierId?: string } = {
        from: fromDate,
        to: toDate,
      };

      if (role === 'qualifier' && userId) {
        filters.qualifierId = userId;
      } else if (qualifierId && (role === 'onboarder' || role === 'lead_access_manager')) {
        filters.qualifierId = qualifierId as string;
      }

      const analytics = await LeadService.getStatusAnalytics(filters);
      res.json({
        success: true,
        data: analytics
      });
    } catch (error: any) {
      logger.error('Error in getStatusAnalytics controller', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch status analytics',
        message: error.message
      });
    }
  }

  /**
   * GET /api/v1/onboarding/leads/status-reports/export
   */
  static async exportStatusReport(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const role = req.admin.role as UserRole;
      const userId = getUserId(req);
      const {
        from,
        to,
        qualifierId,
        format = 'csv',
        template = 'eod',
        includeNotes = 'false',
      } = req.query;

      if (!['csv', 'xlsx'].includes(String(format))) {
        res.status(400).json({
          success: false,
          error: 'Invalid format',
          message: 'format must be csv or xlsx'
        });
        return;
      }

      if (!['eod', 'detailed'].includes(String(template))) {
        res.status(400).json({
          success: false,
          error: 'Invalid template',
          message: 'template must be eod or detailed'
        });
        return;
      }

      const fromDate = from ? new Date(from as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const toDate = to ? new Date(to as string) : new Date();

      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        res.status(400).json({
          success: false,
          error: 'Invalid date range',
          message: 'from/to must be valid ISO date strings'
        });
        return;
      }

      const filters: {
        from: Date;
        to: Date;
        qualifierId?: string;
        format: 'csv' | 'xlsx';
        template: 'eod' | 'detailed';
        includeNotes?: boolean;
      } = {
        from: fromDate,
        to: toDate,
        format: format as 'csv' | 'xlsx',
        template: template as 'eod' | 'detailed',
        includeNotes: String(includeNotes) === 'true',
      };

      if (role === 'qualifier' && userId) {
        filters.qualifierId = userId;
      } else if (qualifierId && (role === 'onboarder' || role === 'lead_access_manager')) {
        filters.qualifierId = qualifierId as string;
      }

      const report = await LeadService.exportStatusReport(filters);

      await LeadService.logActivity(
        'SYSTEM',
        'report_export',
        `Status report export (${report.rowCount} rows)`,
        userId || 'unknown',
        req.admin.name,
        {
          reportType: 'lead-status-report',
          role,
          filters: {
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            qualifierId: filters.qualifierId,
            format: filters.format,
            template: filters.template,
            includeNotes: filters.includeNotes,
          },
          rowCount: report.rowCount
        }
      );

      res.setHeader('Content-Type', report.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      res.send(report.buffer);
    } catch (error: any) {
      logger.error('Error in exportStatusReport controller', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Failed to export status report',
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

      const existingLead = await LeadService.getLeadById(leadId);
      if (!existingLead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found'
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
      if (!canManageLead(req, existingLead.addedBy)) {
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







