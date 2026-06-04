"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadController = void 0;
const LeadService_1 = require("../services/LeadService");
const DuplicateCheckService_1 = require("../services/DuplicateCheckService");
const UserLookupService_1 = require("../services/UserLookupService");
const CertificateReviewService_1 = require("../services/CertificateReviewService");
const Lead_1 = __importDefault(require("../models/Lead"));
const AdminUser_1 = __importDefault(require("../models/AdminUser"));
const leadCreatorAccess_1 = require("../utils/leadCreatorAccess");
const logger_1 = __importDefault(require("../config/logger"));
const leadContactTracking_1 = require("../constants/leadContactTracking");
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const CONVERSION_STATUS_CACHE_MS = 60 * 1000;
/**
 * Helper function to get consistent userId from req.admin
 * Handles both JWT (userId) and Firebase (uid) authentication
 */
function getUserId(req) {
    return req.admin?.userId || req.admin?.uid;
}
function getScopedAddedByIds(req) {
    const ids = [req.admin?.userId, req.admin?.uid].filter((id) => typeof id === 'string' && id.trim().length > 0);
    return Array.from(new Set(ids));
}
/**
 * Read access for lead data.
 * Qualifier/Onboarder/Lead Access Manager can view all leads.
 */
function canViewLead(req) {
    const role = req.admin?.role;
    return role === 'lead_access_manager' || role === 'onboarder' || role === 'qualifier' || role === 'support' || role === 'trust';
}
/**
 * Mutating access for lead records.
 * Qualifier can mutate only own leads.
 * Onboarder/Lead Access Manager can mutate all leads.
 */
function canManageLead(req, leadAddedBy) {
    const role = req.admin?.role;
    const userId = getUserId(req);
    if (role === 'lead_access_manager' || role === 'onboarder')
        return true;
    if (role === 'qualifier')
        return userId === leadAddedBy;
    return false;
}
function canMutatePickedLead(req, lead) {
    const role = req.admin?.role;
    const identityIds = getScopedAddedByIds(req);
    if (!identityIds.length)
        return false;
    // ✅ Qualifiers can edit any lead — skip the pickedBy ownership check for them
    if (role === 'qualifier') {
        return (0, leadCreatorAccess_1.canQualifierEditLead)(lead, identityIds);
    }
    if (lead.pickedBy && !identityIds.includes(lead.pickedBy)) {
        return false;
    }
    return true;
}
function parseISTDateOnly(value, endOfDay = false) {
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
function shouldRefreshConversionSnapshot(lead) {
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
    const isSnapshotStale = !lastCheckedAt ||
        Number.isNaN(lastCheckedAt) ||
        Date.now() - lastCheckedAt >= CONVERSION_STATUS_CACHE_MS;
    return isSnapshotStale && !lead.conversionData?.platformUid;
}
class LeadController {
    static async getDashboardMetrics(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            if (!env_1.env.USER_SERVICE_URL) {
                logger_1.default.warn('USER_SERVICE_URL is not configured; returning fallback dashboard metrics', {
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
                const response = await axios_1.default.get(`${env_1.env.USER_SERVICE_URL}/api/v1/profiles/internal/stats/taskers/aadhaar-verified`, {
                    headers: {
                        'X-Service-Auth': env_1.env.SERVICE_AUTH_TOKEN,
                        'X-Service-Name': 'admin-service',
                        'X-User-Id': actorUid,
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                });
                taskersAadhaarVerified = response.data?.data?.taskersAadhaarVerified ?? 0;
            }
            catch (error) {
                logger_1.default.error('Dashboard metrics upstream call failed; returning fallback value', {
                    actorUid,
                    userServiceUrl: env_1.env.USER_SERVICE_URL,
                    error: error?.message,
                    status: axios_1.default.isAxiosError(error) ? error.response?.status : undefined,
                    responseData: axios_1.default.isAxiosError(error) ? error.response?.data : undefined,
                    code: axios_1.default.isAxiosError(error) ? error.code : undefined,
                });
            }
            res.json({
                success: true,
                data: {
                    taskersAadhaarVerified,
                },
            });
        }
        catch (error) {
            logger_1.default.error('Error in getDashboardMetrics controller', {
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
    static async getStatusReasonCodes(req, res) {
        try {
            res.json({
                success: true,
                data: leadContactTracking_1.LEAD_STATUS_REASON_CODES
            });
        }
        catch (error) {
            logger_1.default.error('Error in getStatusReasonCodes controller', {
                error: error.message
            });
            res.status(500).json({
                success: false,
                error: 'Failed to get status reason codes',
                message: error.message
            });
        }
    }
    static extractVerifiedSkillCertificates(profile) {
        const skills = profile?.skills?.list || [];
        const verifiedCertificates = [];
        skills.forEach((skill) => {
            const skillName = skill?.name || 'Unknown Skill';
            const certificates = Array.isArray(skill?.certificates) ? skill.certificates : [];
            certificates.forEach((certificate) => {
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
    static async createLead(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const { name, phone, landline, email, city, locality, state, address, pincode, isGatedCommunity, gatedCommunityName, primaryCategory, primarySkill, // Legacy support
            secondaryCategory, secondarySkill, // Legacy support
            experienceLevel, workingDays, preferredTimeSlot, source, sourceDetails } = req.body;
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
            const leadData = {
                name: name.trim(),
                phone: phoneValue || undefined,
                landline: landlineValue || undefined,
                email,
                city,
                locality,
                state,
                address,
                pincode,
                isGatedCommunity: req.body.isGatedCommunity === true || req.body.isGatedCommunity === 'true',
                gatedCommunityName: req.body.gatedCommunityName,
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
     * ✅ ISOLATION: Qualifiers can only access leads they added
     */
    static async getLead(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const { leadId } = req.params;
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
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
                const phone = lead.phone || lead.landline;
                const status = await (0, UserLookupService_1.getConversionStatusByPhone)(phone);
                if (status.converted && (status.platformUid || status.isAadhaarVerified !== undefined)) {
                    const refreshedLead = await Lead_1.default.findOneAndUpdate({ leadId }, {
                        $set: {
                            conversionData: {
                                platformUid: status.platformUid,
                                isAadhaarVerified: status.isAadhaarVerified,
                                lastCheckedAt: new Date()
                            }
                        }
                    }, { new: true });
                    if (refreshedLead) {
                        leadToReturn = refreshedLead;
                    }
                }
            }
            res.json({
                success: true,
                data: LeadService_1.LeadService.normalizeLeadForResponse(leadToReturn)
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
     * Get conversion status (did lead register on main website and verify Aadhaar?)
     * GET /api/v1/onboarding/leads/:leadId/conversion-status
     */
    static async getConversionStatus(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const { leadId } = req.params;
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
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
            const phone = lead.phone || lead.landline;
            if (!phone) {
                res.status(400).json({
                    success: false,
                    error: 'Lead has no phone number',
                    message: 'Cannot check conversion status without a phone number.'
                });
                return;
            }
            const status = await (0, UserLookupService_1.getConversionStatusByPhone)(phone);
            // Optionally cache on lead for list views
            if (status.converted && (status.platformUid || status.isAadhaarVerified !== undefined)) {
                await Lead_1.default.findOneAndUpdate({ leadId }, {
                    $set: {
                        conversionData: {
                            platformUid: status.platformUid,
                            isAadhaarVerified: status.isAadhaarVerified,
                            lastCheckedAt: new Date()
                        }
                    }
                });
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
        }
        catch (error) {
            logger_1.default.error('Error in getConversionStatus', {
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
    static async getVerifiedCertificates(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const { leadId } = req.params;
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
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
            const phone = lead.phone || lead.landline;
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
                const conversion = await (0, UserLookupService_1.getConversionStatusByPhone)(phone);
                platformUid = conversion.platformUid;
                if (platformUid || conversion.isAadhaarVerified !== undefined) {
                    await Lead_1.default.findOneAndUpdate({ leadId }, {
                        $set: {
                            conversionData: {
                                platformUid,
                                isAadhaarVerified: conversion.isAadhaarVerified,
                                lastCheckedAt: new Date()
                            }
                        }
                    });
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
            const profile = await CertificateReviewService_1.CertificateReviewService.getProfileByUid(platformUid, actorUid);
            const certificates = LeadController.extractVerifiedSkillCertificates(profile);
            res.json({
                success: true,
                data: {
                    platformUid,
                    certificates
                }
            });
        }
        catch (error) {
            logger_1.default.error('Error in getVerifiedCertificates', {
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
     * Get unique gated community names (for dropdown/autocomplete)
     * GET /api/v1/onboarding/leads/gated-community-names
     */
    static async getGatedCommunityNames(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({ success: false, error: 'Authentication required' });
                return;
            }
            const names = await LeadService_1.LeadService.getGatedCommunityNames();
            res.json({ success: true, data: names });
        }
        catch (error) {
            logger_1.default.error('Error in getGatedCommunityNames controller', { error: error.message });
            res.status(500).json({ success: false, error: 'Failed to get gated community names', message: error.message });
        }
    }
    /**
     * Distinct cities and local areas from existing leads (for filter dropdowns).
     * GET /api/v1/onboarding/leads/location-filter-options
     */
    static async getLeadLocationFilterOptions(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({ success: false, error: 'Authentication required' });
                return;
            }
            const [cities, localities, localAreas] = await Promise.all([
                LeadService_1.LeadService.getLeadCities(),
                LeadService_1.LeadService.getLeadLocalities(),
                LeadService_1.LeadService.getLeadLocalAreas(),
            ]);
            res.json({ success: true, data: { cities, localities, localAreas } });
        }
        catch (error) {
            logger_1.default.error('Error in getLeadLocationFilterOptions controller', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get location filter options',
                message: error.message,
            });
        }
    }
    /**
     * Get unique users who have added leads (for filter dropdown)
     * GET /api/v1/onboarding/leads/creators
     */
    static async getLeadCreators(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const creators = await LeadService_1.LeadService.getLeadCreators();
            res.json({
                success: true,
                data: creators
            });
        }
        catch (error) {
            logger_1.default.error('Error in getLeadCreators controller', {
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
     * Get active qualifiers for pick/transfer
     * GET /api/v1/onboarding/leads/qualifiers
     */
    static async getQualifiers(req, res) {
        try {
            const qualifiers = await AdminUser_1.default.find({ role: 'qualifier', status: 'active' })
                .sort({ name: 1, email: 1 })
                .lean();
            res.json({
                success: true,
                data: qualifiers.map((q) => ({
                    userId: q.userId || q.uid,
                    uid: q.uid,
                    name: q.name || q.firstName || q.lastName || q.email,
                    email: q.email,
                })),
            });
        }
        catch (error) {
            logger_1.default.error('Error in getQualifiers controller', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to fetch qualifiers',
                message: error.message,
            });
        }
    }
    /**
     * Get active transfer recipients (all active admin users)
     * GET /api/v1/onboarding/leads/transfer-recipients
     */
    static async getTransferRecipients(req, res) {
        try {
            const recipients = await AdminUser_1.default.find({ status: 'active' })
                .sort({ name: 1, email: 1 })
                .lean();
            res.json({
                success: true,
                data: recipients.map((u) => ({
                    userId: u.userId || u.uid,
                    uid: u.uid,
                    name: u.name || u.firstName || u.lastName || u.email,
                    email: u.email,
                    role: u.role,
                })),
            });
        }
        catch (error) {
            logger_1.default.error('Error in getTransferRecipients controller', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to fetch transfer recipients',
                message: error.message,
            });
        }
    }
    /**
     * Get active onboarders for transfer
     * GET /api/v1/onboarding/leads/onboarders
     */
    static async getOnboarders(req, res) {
        try {
            const onboarders = await AdminUser_1.default.find({ role: 'onboarder', status: 'active' })
                .sort({ name: 1, email: 1 })
                .lean();
            res.json({
                success: true,
                data: onboarders.map((o) => ({
                    userId: o.userId || o.uid,
                    uid: o.uid,
                    name: o.name || o.firstName || o.lastName || o.email,
                    email: o.email,
                })),
            });
        }
        catch (error) {
            logger_1.default.error('Error in getOnboarders controller', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to fetch onboarders',
                message: error.message,
            });
        }
    }
    /**
     * Get transfer decision notifications for current user
     * GET /api/v1/onboarding/leads/transfer-notifications
     */
    static async getTransferNotifications(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({ success: false, error: 'Authentication required' });
                return;
            }
            const userId = getUserId(req) || '';
            const { since } = req.query;
            const sinceDate = since ? new Date(since) : undefined;
            const filters = {
                lastTransferDecisionAt: { $exists: true },
                $or: [{ lastTransferredBy: userId }, { lastTransferDecisionBy: userId }],
            };
            if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
                filters.lastTransferDecisionAt.$gt = sinceDate;
            }
            const leads = await Lead_1.default.find(filters)
                .select('leadId lastTransferDecision lastTransferDecisionAt lastTransferredBy lastTransferredByName lastTransferDecisionBy lastTransferDecisionByName')
                .sort({ lastTransferDecisionAt: -1 })
                .lean();
            res.json({
                success: true,
                data: leads.map((lead) => ({
                    leadId: lead.leadId,
                    decision: lead.lastTransferDecision,
                    decidedAt: lead.lastTransferDecisionAt,
                    fromUserId: lead.lastTransferredBy,
                    fromUserName: lead.lastTransferredByName,
                    toUserId: lead.lastTransferDecisionBy,
                    toUserName: lead.lastTransferDecisionByName,
                })),
            });
        }
        catch (error) {
            logger_1.default.error('Error in getTransferNotifications controller', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to fetch transfer notifications',
                message: error.message,
            });
        }
    }
    /**
     * Search and filter leads
     * GET /api/v1/admin/caos/leads
     * ✅ ISOLATION: Qualifiers only see leads they added
     */
    static async searchLeads(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const { status, city, primarySkill, source, addedBy, pickedBy, transferPendingTo, ownerBy, search, startDate, endDate, page, limit, registrationStatus, statusChangedBy, unclaimed, claimed, locality, localArea, } = req.query;
            const role = req.admin.role;
            const filters = {
                status: status,
                city: city,
                locality: locality,
                localArea: localArea,
                primarySkill: primarySkill,
                source: source,
                addedBy: addedBy,
                pickedBy: pickedBy,
                transferPendingTo: transferPendingTo,
                ownerBy: ownerBy,
                search: search,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
                registrationStatus: registrationStatus,
                statusChangedBy: statusChangedBy,
                unclaimed: unclaimed === 'true' || unclaimed === '1',
                claimed: claimed === 'true' || claimed === '1',
            };
            // Expand single id to userId + uid for owner/picked filters.
            const scopedIds = getScopedAddedByIds(req);
            if (filters.ownerBy && scopedIds.length > 0) {
                filters.ownerByAny = Array.from(new Set([...scopedIds, filters.ownerBy]));
                delete filters.ownerBy;
            }
            if (filters.pickedBy && scopedIds.length > 0) {
                filters.pickedByAny = Array.from(new Set([...scopedIds, filters.pickedBy]));
                delete filters.pickedBy;
            }
            // Keep search generic; caller (UI/page) decides whether to scope by addedBy.
            // This is required so "All Leads" can remain truly global for allowed roles.
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
     * Get callback queue.
     * GET /api/v1/onboarding/leads/callback-queue
     * Qualifier: only own leads
     * Onboarder/Admin: all leads
     */
    static async getCallbackQueue(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const { city, primarySkill, startDate, endDate, page, limit } = req.query;
            const role = req.admin.role;
            const scopedIds = getScopedAddedByIds(req);
            const filters = {
                city: city,
                primarySkill: primarySkill,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
            };
            if (role === 'qualifier' && scopedIds.length > 0) {
                filters.ownerByAny = scopedIds;
            }
            else if (req.query.addedBy) {
                filters.ownerBy = req.query.addedBy;
            }
            const result = await LeadService_1.LeadService.getCallbackQueue(filters);
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
            logger_1.default.error('Error in getCallbackQueue controller', {
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
    static async getCallbackQueueStats(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const role = req.admin.role;
            const scopedIds = getScopedAddedByIds(req);
            const filters = {};
            if (role === 'qualifier' && scopedIds.length > 0) {
                filters.ownerByAny = scopedIds;
            }
            else if (req.query.addedBy) {
                filters.ownerBy = req.query.addedBy;
            }
            const stats = await LeadService_1.LeadService.getCallbackQueueStats(filters);
            res.json({
                success: true,
                data: stats
            });
        }
        catch (error) {
            logger_1.default.error('Error in getCallbackQueueStats controller', {
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
    static async getFollowUpQueue(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const { city, primarySkill, startDate, endDate, dueType, bucket, page, limit, pickedBy, ownerBy, } = req.query;
            const role = req.admin.role;
            const scopedIds = getScopedAddedByIds(req);
            const rawStartDate = startDate;
            const rawEndDate = endDate;
            const parsedStartDate = rawStartDate
                ? (rawStartDate.includes('T') ? new Date(rawStartDate) : parseISTDateOnly(rawStartDate))
                : undefined;
            const parsedEndDate = rawEndDate
                ? (rawEndDate.includes('T') ? new Date(rawEndDate) : parseISTDateOnly(rawEndDate, true))
                : undefined;
            const filters = {
                city: city,
                primarySkill: primarySkill,
                startDate: parsedStartDate,
                endDate: parsedEndDate,
                dueType: dueType || 'all',
                bucket: bucket || 'all',
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
            };
            if (role === 'onboarder') {
                filters.followUpOwnerBy = (getUserId(req) || '');
            }
            else if (pickedBy) {
                filters.followUpOwnerBy = pickedBy;
            }
            else if (role === 'qualifier') {
                filters.followUpOwnerBy = '__no_qualifier_followups__';
            }
            if (role === 'qualifier' && scopedIds.length > 0) {
                filters.ownerByAny = scopedIds;
            }
            else if (ownerBy) {
                filters.ownerBy = ownerBy;
            }
            else if (req.query.addedBy) {
                filters.ownerBy = req.query.addedBy;
            }
            const result = await LeadService_1.LeadService.getFollowUpQueue(filters);
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
            logger_1.default.error('Error in getFollowUpQueue controller', {
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
    static async getFollowUpQueueStats(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const role = req.admin.role;
            const scopedIds = getScopedAddedByIds(req);
            const filters = {};
            if (role === 'onboarder' && scopedIds.length > 0) {
                filters.followUpOwnerByAny = scopedIds;
            }
            else if (role === 'qualifier' && scopedIds.length > 0) {
                filters.followUpOwnerBy = '__no_qualifier_followups__';
                filters.ownerByAny = scopedIds;
            }
            else if (req.query.ownerBy) {
                filters.ownerBy = req.query.ownerBy;
            }
            else if (req.query.addedBy) {
                filters.ownerBy = req.query.addedBy;
            }
            const stats = await LeadService_1.LeadService.getFollowUpQueueStats(filters);
            res.json({
                success: true,
                data: stats
            });
        }
        catch (error) {
            logger_1.default.error('Error in getFollowUpQueueStats controller', {
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
    static async getStatusAnalytics(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const role = req.admin.role;
            const userId = getUserId(req);
            const { from, to, qualifierId, pickedBy, category, claimsScope, allTime } = req.query;
            const isAllTime = String(allTime) === 'true';
            const defaultFrom = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const defaultTo = new Date().toISOString().slice(0, 10);
            const parsedRange = isAllTime
                ? { from: undefined, to: undefined }
                : LeadService_1.LeadService.parseFilterRange(from || defaultFrom, to || defaultTo);
            if (!isAllTime &&
                (!parsedRange.from ||
                    !parsedRange.to ||
                    Number.isNaN(parsedRange.from.getTime()) ||
                    Number.isNaN(parsedRange.to.getTime()))) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid date range',
                    message: 'from/to must be valid ISO date strings'
                });
                return;
            }
            const filters = {
                from: parsedRange.from,
                to: parsedRange.to,
                category: category ? String(category) : undefined,
                claimsScope: claimsScope ? String(claimsScope) : undefined,
                allTime: isAllTime,
                gatedCommunityName: req.query.gatedCommunityName ? String(req.query.gatedCommunityName) : undefined,
                city: req.query.city ? String(req.query.city) : undefined,
                locality: req.query.locality ? String(req.query.locality) : undefined,
                localArea: req.query.localArea ? String(req.query.localArea) : undefined,
            };
            if (role === 'qualifier' && userId) {
                filters.qualifierId = userId;
            }
            else if (role === 'onboarder' && userId) {
                filters.pickedBy = userId;
            }
            else if (qualifierId && role === 'lead_access_manager') {
                filters.qualifierId = qualifierId;
            }
            else if (pickedBy && role === 'lead_access_manager') {
                filters.pickedBy = pickedBy;
            }
            const analytics = await LeadService_1.LeadService.getStatusAnalytics(filters);
            res.json({
                success: true,
                data: analytics
            });
        }
        catch (error) {
            logger_1.default.error('Error in getStatusAnalytics controller', {
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
     * GET /api/v1/onboarding/leads/performance
     */
    static async getTeamPerformance(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            if (req.admin.role !== 'lead_access_manager') {
                res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'Only Lead Access Managers can view team performance metrics'
                });
                return;
            }
            const { userId, from, to, allTime } = req.query;
            if (userId) {
                const isAllTime = String(allTime) === 'true';
                const defaultFrom = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                const defaultTo = new Date().toISOString().slice(0, 10);
                const parsedRange = isAllTime
                    ? { from: undefined, to: undefined }
                    : LeadService_1.LeadService.parseFilterRange(from || defaultFrom, to || defaultTo);
                if (!isAllTime &&
                    (!parsedRange.from ||
                        !parsedRange.to ||
                        Number.isNaN(parsedRange.from.getTime()) ||
                        Number.isNaN(parsedRange.to.getTime()))) {
                    res.status(400).json({
                        success: false,
                        error: 'Invalid date range',
                        message: 'from/to must be valid ISO date strings'
                    });
                    return;
                }
                const filters = {
                    from: parsedRange.from,
                    to: parsedRange.to,
                    allTime: isAllTime,
                };
                const details = await LeadService_1.LeadService.getPerformanceDetails(String(userId), filters);
                res.json({
                    success: true,
                    data: details
                });
            }
            else {
                const overview = await LeadService_1.LeadService.getPerformanceOverview();
                res.json({
                    success: true,
                    data: overview
                });
            }
        }
        catch (error) {
            logger_1.default.error('Error in getTeamPerformance controller', {
                error: error.message
            });
            res.status(500).json({
                success: false,
                error: 'Failed to fetch team performance metrics',
                message: error.message
            });
        }
    }
    /**
     * GET /api/v1/onboarding/leads/status-reports/export
     */
    static async exportStatusReport(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const role = req.admin.role;
            const userId = getUserId(req);
            const { from, to, qualifierId, pickedBy, format = 'csv', template = 'eod', reportCategory = 'touched_leads', includeNotes = 'false', category, exportLayout, claimsScope, allTime, } = req.query;
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
            if (!['touched_leads', 'interested', 'callback_scheduled', 'callback_overdue'].includes(String(reportCategory))) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid report category',
                    message: 'reportCategory must be touched_leads, interested, callback_scheduled, or callback_overdue'
                });
                return;
            }
            const isAllTime = String(allTime) === 'true';
            const defaultFrom = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const defaultTo = new Date().toISOString().slice(0, 10);
            const parsedRange = isAllTime
                ? { from: undefined, to: undefined }
                : LeadService_1.LeadService.parseFilterRange(from || defaultFrom, to || defaultTo);
            if (!isAllTime &&
                (!parsedRange.from ||
                    !parsedRange.to ||
                    Number.isNaN(parsedRange.from.getTime()) ||
                    Number.isNaN(parsedRange.to.getTime()))) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid date range',
                    message: 'from/to must be valid ISO date strings'
                });
                return;
            }
            const filters = {
                from: parsedRange.from,
                to: parsedRange.to,
                format: format,
                template: template,
                reportCategory: reportCategory,
                includeNotes: String(includeNotes) === 'true',
                category: category ? String(category) : undefined,
                exportLayout: exportLayout === 'qualifier' ? 'qualifier' : 'standard',
                claimsScope: claimsScope ? String(claimsScope) : undefined,
                allTime: isAllTime,
                gatedCommunityName: req.query.gatedCommunityName ? String(req.query.gatedCommunityName) : undefined,
                city: req.query.city ? String(req.query.city) : undefined,
                locality: req.query.locality ? String(req.query.locality) : undefined,
                localArea: req.query.localArea ? String(req.query.localArea) : undefined,
            };
            if (role === 'qualifier' && userId) {
                filters.qualifierId = userId;
                filters.exportLayout = 'qualifier';
            }
            else if (role === 'onboarder' && userId) {
                filters.pickedBy = userId;
            }
            else if (qualifierId && role === 'lead_access_manager') {
                filters.qualifierId = qualifierId;
            }
            else if (pickedBy && role === 'lead_access_manager') {
                filters.pickedBy = pickedBy;
            }
            const report = await LeadService_1.LeadService.exportStatusReport(filters);
            await LeadService_1.LeadService.logActivity('SYSTEM', 'report_export', `Status report export (${filters.reportCategory}, ${report.rowCount} rows)`, userId || 'unknown', req.admin.name, {
                reportType: 'lead-status-report',
                role,
                filters: {
                    from: isAllTime ? 'all-time' : filters.from?.toISOString(),
                    to: isAllTime ? 'all-time' : filters.to?.toISOString(),
                    qualifierId: filters.qualifierId,
                    format: filters.format,
                    template: filters.template,
                    reportCategory: filters.reportCategory,
                    includeNotes: filters.includeNotes,
                    category: filters.category,
                    gatedCommunityName: filters.gatedCommunityName,
                    exportLayout: filters.exportLayout,
                },
                rowCount: report.rowCount
            });
            res.setHeader('Content-Type', report.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
            res.send(report.buffer);
        }
        catch (error) {
            logger_1.default.error('Error in exportStatusReport controller', {
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
    static async updateLead(req, res) {
        try {
            const { leadId } = req.params;
            const updateData = {
                ...req.body,
                _updatedBy: getUserId(req) || req.admin?.uid || '',
                _updatedByName: req.admin?.name || '',
            };
            const existingLead = await LeadService_1.LeadService.getLeadById(leadId);
            if (!existingLead) {
                res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
                return;
            }
            if (!canMutatePickedLead(req, existingLead)) {
                res.status(403).json({
                    success: false,
                    error: 'Permission denied',
                    message: 'Only the picked qualifier can update this lead.'
                });
                return;
            }
            if ((0, leadCreatorAccess_1.updateTouchesSkills)(updateData) && !(0, leadCreatorAccess_1.isLeadCreator)(req, existingLead.addedBy)) {
                res.status(403).json({
                    success: false,
                    error: 'Permission denied',
                    message: 'Only the user who created this lead can edit skills.',
                });
                return;
            }
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
            const { status, notes, statusReasonCode, statusReasonText, callbackAt, expectedOnboardingAt } = req.body;
            if (!status) {
                res.status(400).json({
                    success: false,
                    error: 'Status is required'
                });
                return;
            }
            const existingLead = await LeadService_1.LeadService.getLeadById(leadId);
            if (!existingLead) {
                res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
                return;
            }
            if (!canMutatePickedLead(req, existingLead)) {
                res.status(403).json({
                    success: false,
                    error: 'Permission denied',
                    message: 'Only the picked qualifier can update this lead.'
                });
                return;
            }
            const role = (req.admin.role || 'qualifier');
            const statusData = {
                status,
                notes,
                statusReasonCode,
                statusReasonText,
                callbackAt,
                expectedOnboardingAt,
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
            const existingLead = await LeadService_1.LeadService.getLeadById(leadId);
            if (!existingLead) {
                res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
                return;
            }
            if (!canMutatePickedLead(req, existingLead)) {
                res.status(403).json({
                    success: false,
                    error: 'Permission denied',
                    message: 'Only the picked qualifier can update this lead.'
                });
                return;
            }
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
            const { phone, landline, name, city } = req.body;
            // At least one contact number must be provided
            if (!phone?.trim() && !landline?.trim()) {
                res.status(400).json({
                    success: false,
                    error: 'At least one contact number (phone or landline) is required'
                });
                return;
            }
            const result = await DuplicateCheckService_1.DuplicateCheckService.checkDuplicate(phone?.trim() || undefined, landline?.trim() || undefined, name, city);
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
    /**
     * Delete a lead
     * DELETE /api/v1/admin/caos/leads/:leadId
     */
    static async deleteLead(req, res) {
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
            const existingLead = await LeadService_1.LeadService.getLeadById(leadId);
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
            await LeadService_1.LeadService.deleteLead(leadId, userId || '', userName);
            res.json({
                success: true,
                message: 'Lead deleted successfully'
            });
        }
        catch (error) {
            logger_1.default.error('Error in deleteLead controller', {
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
    /**
     * Pick a lead (qualifier or onboarder)
     * POST /api/v1/onboarding/leads/:leadId/pick
     */
    static async pickLead(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({ success: false, error: 'Authentication required' });
                return;
            }
            const role = req.admin.role;
            if (role !== 'qualifier' && role !== 'onboarder') {
                res.status(403).json({ success: false, error: 'Only qualifiers and onboarders can pick leads' });
                return;
            }
            const { leadId } = req.params;
            const userId = getUserId(req) || '';
            const userName = req.admin.name;
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                res.status(404).json({ success: false, error: 'Lead not found' });
                return;
            }
            if (lead.pickedBy && lead.pickedBy !== userId) {
                res.status(409).json({
                    success: false,
                    error: 'Lead already picked',
                    message: 'This lead is already picked by another qualifier.'
                });
                return;
            }
            lead.pickedBy = userId;
            lead.pickedByName = userName;
            lead.pickedAt = new Date();
            await lead.save();
            await LeadService_1.LeadService.logActivity(leadId, 'lead_pick', `Lead picked by ${userName || userId}`, userId, userName);
            res.json({ success: true, data: lead, message: 'Lead picked successfully' });
        }
        catch (error) {
            logger_1.default.error('Error in pickLead controller', { error: error.message, leadId: req.params.leadId });
            res.status(500).json({ success: false, error: 'Failed to pick lead', message: error.message });
        }
    }
    /**
     * Request transfer of a picked lead to another admin user
     * POST /api/v1/onboarding/leads/:leadId/transfer
     */
    static async transferLead(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({ success: false, error: 'Authentication required' });
                return;
            }
            const role = req.admin.role;
            if (role !== 'qualifier' && role !== 'onboarder') {
                res.status(403).json({ success: false, error: 'Only qualifiers and onboarders can transfer leads' });
                return;
            }
            const { leadId } = req.params;
            const { targetUserId } = req.body;
            if (!targetUserId) {
                res.status(400).json({ success: false, error: 'targetUserId is required' });
                return;
            }
            const userId = getUserId(req) || '';
            const userName = req.admin.name;
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                res.status(404).json({ success: false, error: 'Lead not found' });
                return;
            }
            if (lead.pickedBy !== userId) {
                res.status(403).json({
                    success: false,
                    error: 'Permission denied',
                    message: 'Only the picked user can transfer this lead.'
                });
                return;
            }
            const target = await AdminUser_1.default.findOne({
                $or: [{ userId: targetUserId }, { uid: targetUserId }],
                status: 'active'
            }).lean();
            if (!target) {
                res.status(404).json({ success: false, error: 'Target user not found' });
                return;
            }
            const targetId = target.userId || target.uid || targetUserId;
            const targetName = target.name || target.firstName || target.lastName || target.email;
            lead.transferPendingTo = targetId;
            lead.transferPendingToName = targetName;
            lead.transferPendingAt = new Date();
            lead.lastTransferDecision = undefined;
            lead.lastTransferDecisionBy = undefined;
            lead.lastTransferDecisionByName = undefined;
            lead.lastTransferDecisionAt = undefined;
            lead.lastTransferredBy = userId;
            lead.lastTransferredByName = userName;
            lead.lastTransferredAt = new Date();
            await lead.save();
            await LeadService_1.LeadService.logActivity(leadId, 'lead_transfer_request', `Transfer requested for ${targetName || targetId}`, userId, userName, { targetUserId: targetId, targetUserName: targetName });
            res.json({ success: true, data: lead, message: 'Transfer request sent successfully' });
        }
        catch (error) {
            logger_1.default.error('Error in transferLead controller', { error: error.message, leadId: req.params.leadId });
            res.status(500).json({ success: false, error: 'Failed to transfer lead', message: error.message });
        }
    }
    /**
     * Accept a pending lead transfer
     * POST /api/v1/onboarding/leads/:leadId/accept-transfer
     */
    static async acceptTransferLead(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({ success: false, error: 'Authentication required' });
                return;
            }
            const { leadId } = req.params;
            const userId = getUserId(req) || '';
            const userName = req.admin.name;
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                res.status(404).json({ success: false, error: 'Lead not found' });
                return;
            }
            if (lead.transferPendingTo !== userId) {
                res.status(403).json({
                    success: false,
                    error: 'Permission denied',
                    message: 'Only the pending recipient can accept this transfer.'
                });
                return;
            }
            const senderId = lead.pickedBy || lead.addedBy;
            const senderName = lead.pickedByName || lead.addedByName || 'unknown';
            // Accept transfer: change owner to recipient and clear pending fields
            lead.pickedBy = userId;
            lead.pickedByName = userName;
            lead.pickedAt = new Date();
            lead.transferPendingTo = undefined;
            lead.transferPendingToName = undefined;
            lead.transferPendingAt = undefined;
            lead.lastTransferDecision = 'accepted';
            lead.lastTransferDecisionBy = userId;
            lead.lastTransferDecisionByName = userName;
            lead.lastTransferDecisionAt = new Date();
            await lead.save();
            await LeadService_1.LeadService.logActivity(leadId, 'transfer_accept', `Lead transfer accepted by ${userName}. New owner: ${userName}`, userId, userName, { fromUserId: senderId, fromUserName: senderName });
            res.json({ success: true, data: lead, message: 'Lead transfer accepted successfully' });
        }
        catch (error) {
            logger_1.default.error('Error in acceptTransferLead controller', { error: error.message, leadId: req.params.leadId });
            res.status(500).json({ success: false, error: 'Failed to accept lead transfer', message: error.message });
        }
    }
    /**
     * Reject a pending lead transfer
     * POST /api/v1/onboarding/leads/:leadId/reject-transfer
     */
    static async rejectTransferLead(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({ success: false, error: 'Authentication required' });
                return;
            }
            const { leadId } = req.params;
            const userId = getUserId(req) || '';
            const userName = req.admin.name;
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                res.status(404).json({ success: false, error: 'Lead not found' });
                return;
            }
            if (lead.transferPendingTo !== userId) {
                res.status(403).json({
                    success: false,
                    error: 'Permission denied',
                    message: 'Only the pending recipient can reject this transfer.'
                });
                return;
            }
            const senderId = lead.pickedBy || lead.addedBy;
            const senderName = lead.pickedByName || lead.addedByName || 'unknown';
            // Reject transfer: keep original owner and clear pending fields
            lead.transferPendingTo = undefined;
            lead.transferPendingToName = undefined;
            lead.transferPendingAt = undefined;
            lead.lastTransferDecision = 'rejected';
            lead.lastTransferDecisionBy = userId;
            lead.lastTransferDecisionByName = userName;
            lead.lastTransferDecisionAt = new Date();
            await lead.save();
            await LeadService_1.LeadService.logActivity(leadId, 'transfer_reject', `Lead transfer rejected by ${userName}`, userId, userName, { fromUserId: senderId, fromUserName: senderName });
            res.json({ success: true, data: lead, message: 'Lead transfer rejected successfully' });
        }
        catch (error) {
            logger_1.default.error('Error in rejectTransferLead controller', { error: error.message, leadId: req.params.leadId });
            res.status(500).json({ success: false, error: 'Failed to reject lead transfer', message: error.message });
        }
    }
}
exports.LeadController = LeadController;
//# sourceMappingURL=LeadController.js.map