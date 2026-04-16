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
const logger_1 = __importDefault(require("../config/logger"));
const leadContactTracking_1 = require("../constants/leadContactTracking");
/**
 * Helper function to get consistent userId from req.admin
 * Handles both JWT (userId) and Firebase (uid) authentication
 */
function getUserId(req) {
    return req.admin?.userId || req.admin?.uid;
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
class LeadController {
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
            const { name, phone, landline, email, city, state, address, pincode, primaryCategory, primarySkill, // Legacy support
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
            const { status, city, primarySkill, source, addedBy, search, startDate, endDate, page, limit, registrationStatus } = req.query;
            const role = req.admin.role;
            const userId = getUserId(req);
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
                limit: limit ? parseInt(limit) : undefined,
                registrationStatus: registrationStatus
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
            const userId = getUserId(req);
            const filters = {
                city: city,
                primarySkill: primarySkill,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
            };
            if (role === 'qualifier' && userId) {
                filters.addedBy = userId;
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
            const userId = getUserId(req);
            const filters = {};
            if (role === 'qualifier' && userId) {
                filters.addedBy = userId;
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
            const { city, primarySkill, startDate, endDate, dueType, bucket, page, limit, } = req.query;
            const role = req.admin.role;
            const userId = getUserId(req);
            const filters = {
                city: city,
                primarySkill: primarySkill,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                dueType: dueType || 'all',
                bucket: bucket || 'all',
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
            };
            if (role === 'qualifier' && userId) {
                filters.addedBy = userId;
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
            const userId = getUserId(req);
            const filters = {};
            if (role === 'qualifier' && userId) {
                filters.addedBy = userId;
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
            const { from, to, qualifierId } = req.query;
            const fromDate = from ? new Date(from) : new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
            const toDate = to ? new Date(to) : new Date();
            if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid date range',
                    message: 'from/to must be valid ISO date strings'
                });
                return;
            }
            const filters = {
                from: fromDate,
                to: toDate,
            };
            if (role === 'qualifier' && userId) {
                filters.qualifierId = userId;
            }
            else if (qualifierId && (role === 'onboarder' || role === 'lead_access_manager')) {
                filters.qualifierId = qualifierId;
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
            const { from, to, qualifierId, format = 'csv', template = 'eod', includeNotes = 'false', } = req.query;
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
            const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
            const toDate = to ? new Date(to) : new Date();
            if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid date range',
                    message: 'from/to must be valid ISO date strings'
                });
                return;
            }
            const filters = {
                from: fromDate,
                to: toDate,
                format: format,
                template: template,
                includeNotes: String(includeNotes) === 'true',
            };
            if (role === 'qualifier' && userId) {
                filters.qualifierId = userId;
            }
            else if (qualifierId && (role === 'onboarder' || role === 'lead_access_manager')) {
                filters.qualifierId = qualifierId;
            }
            const report = await LeadService_1.LeadService.exportStatusReport(filters);
            await LeadService_1.LeadService.logActivity('SYSTEM', 'report_export', `Status report export (${report.rowCount} rows)`, userId || 'unknown', req.admin.name, {
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
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
                return;
            }
            const { leadId } = req.params;
            const updateData = req.body;
            const existingLead = await LeadService_1.LeadService.getLeadById(leadId);
            if (!existingLead) {
                res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
                return;
            }
            if (!canManageLead(req, existingLead.addedBy)) {
                res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'You can only update leads that you have added.'
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
     * ✅ ISOLATION: Qualifiers can only update leads they added
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
            // ✅ ISOLATION: Check if qualifier can access this lead
            const existingLead = await LeadService_1.LeadService.getLeadById(leadId);
            if (!existingLead) {
                res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
                return;
            }
            if (!canManageLead(req, existingLead.addedBy)) {
                res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'You can only update leads that you have added.'
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
}
exports.LeadController = LeadController;
//# sourceMappingURL=LeadController.js.map