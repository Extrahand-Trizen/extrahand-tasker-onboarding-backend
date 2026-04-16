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
const leadStatusValidator_1 = require("../validators/leadStatusValidator");
const xlsx_1 = __importDefault(require("xlsx"));
class LeadService {
    static formatIST(date) {
        if (!date)
            return '';
        return new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        }).format(date);
    }
    /**
     * Generate unique lead ID
     */
    static generateLeadId() {
        return `LEAD-${Date.now()}-${(0, uuid_1.v4)().substring(0, 8).toUpperCase()}`;
    }
    /**
     * Create a new lead
     */
    static async createLead(data, options) {
        try {
            // Ensure at least one contact number is provided
            if (!data.phone?.trim() && !data.landline?.trim()) {
                throw new Error('At least one contact number (phone or landline) is required');
            }
            // Normalize phone and landline
            const normalizedPhone = data.phone ? DuplicateCheckService_1.DuplicateCheckService.normalizePhone(data.phone) : null;
            const normalizedLandline = data.landline ? DuplicateCheckService_1.DuplicateCheckService.normalizeLandline(data.landline) : null;
            // Support both new (primaryCategory) and legacy (primarySkill) field names
            const primarySkillCategory = (data.primaryCategory || data.primarySkill || '').trim();
            const secondaryCategoryValue = (data.secondaryCategory || data.secondarySkill || '').trim();
            // Check for duplicates (considering category) - check both phone and landline
            let duplicateCheck;
            if (options?.skipNameCityDuplicate) {
                // Check phone duplicates if phone provided
                if (normalizedPhone) {
                    duplicateCheck = primarySkillCategory
                        ? await DuplicateCheckService_1.DuplicateCheckService.checkPhoneCategoryDuplicate(normalizedPhone, primarySkillCategory, secondaryCategoryValue)
                        : await DuplicateCheckService_1.DuplicateCheckService.checkPhoneDuplicate(normalizedPhone);
                    if (duplicateCheck.isDuplicate && duplicateCheck.sameCategory) {
                        // Found duplicate, return it
                    }
                    else if (normalizedLandline) {
                        // Also check landline
                        const landlineCheck = primarySkillCategory
                            ? await DuplicateCheckService_1.DuplicateCheckService.checkPhoneCategoryDuplicate(normalizedLandline, primarySkillCategory, secondaryCategoryValue)
                            : await DuplicateCheckService_1.DuplicateCheckService.checkLandlineDuplicate(normalizedLandline);
                        if (landlineCheck.isDuplicate && landlineCheck.sameCategory) {
                            duplicateCheck = landlineCheck;
                        }
                    }
                }
                else if (normalizedLandline) {
                    duplicateCheck = primarySkillCategory
                        ? await DuplicateCheckService_1.DuplicateCheckService.checkPhoneCategoryDuplicate(normalizedLandline, primarySkillCategory, secondaryCategoryValue)
                        : await DuplicateCheckService_1.DuplicateCheckService.checkLandlineDuplicate(normalizedLandline);
                }
                else {
                    duplicateCheck = { isDuplicate: false };
                }
            }
            else {
                // Use comprehensive duplicate check
                duplicateCheck = primarySkillCategory
                    ? await DuplicateCheckService_1.DuplicateCheckService.checkDuplicateWithCategory(normalizedPhone || normalizedLandline || '', primarySkillCategory, secondaryCategoryValue, data.name, data.city || '')
                    : await DuplicateCheckService_1.DuplicateCheckService.checkDuplicate(normalizedPhone || undefined, normalizedLandline || undefined, data.name, data.city || undefined);
            }
            if (duplicateCheck.isDuplicate) {
                if (!primarySkillCategory) {
                    throw new Error(`This person already exists: ${duplicateCheck.existingLead?.leadId} (${duplicateCheck.matchType})`);
                }
                if (duplicateCheck.sameCategory) {
                    throw new Error(`This person with this category already exists: ${duplicateCheck.existingLead?.leadId} (${duplicateCheck.matchType})`);
                }
            }
            // For category-aware flows, same contact + different category is allowed.
            // Decide initial status (restricted set)
            const initialStatus = data.status && ['lead_added', 'contacted_not_interested', 'contacted_interested'].includes(data.status)
                ? data.status
                : 'lead_added';
            // Categories are optional.
            // Map primary skill category to human-readable name
            const primarySkillNameMap = {
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
                'water-tanker': 'Water & Tanker Services',
                'other': 'Other'
            };
            const primarySkillName = primarySkillCategory
                ? (primarySkillNameMap[primarySkillCategory] || primarySkillCategory)
                : undefined;
            // Create lead with primary skill automatically added to skills array
            const leadId = this.generateLeadId();
            const lead = new Lead_1.default({
                leadId,
                name: data.name.trim(),
                phone: normalizedPhone,
                landline: normalizedLandline || undefined,
                email: data.email?.trim().toLowerCase(),
                city: data.city?.trim() || undefined,
                state: data.state?.trim() || undefined,
                address: data.address?.trim() || undefined,
                pincode: data.pincode?.trim() || undefined,
                primarySkill: primarySkillCategory || undefined, // Legacy field
                primaryCategory: primarySkillCategory || undefined, // New field
                secondarySkill: secondaryCategoryValue || undefined, // Legacy field
                secondaryCategory: secondaryCategoryValue || undefined, // New field
                experienceLevel: data.experienceLevel,
                workingDays: data.workingDays?.trim(),
                preferredTimeSlot: data.preferredTimeSlot?.trim(),
                source: data.source || undefined,
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
                skills: primarySkillCategory && primarySkillName
                    ? [{
                            name: primarySkillName,
                            category: primarySkillCategory,
                            level: data.experienceLevel,
                            toolsAvailable: false,
                            assignedBy: data.addedBy,
                            assignedAt: new Date()
                        }]
                    : [],
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
            // Log activity for primary skill assignment only when a skill is provided.
            if (primarySkillCategory && primarySkillName) {
                await this.logActivity(leadId, 'skill_assigned', `Primary skill assigned: ${primarySkillName}`, data.addedBy, data.addedByName, { skillName: primarySkillName, category: primarySkillCategory });
            }
            logger_1.default.info('Lead created', {
                leadId,
                name: data.name,
                phone: normalizedPhone,
                landline: normalizedLandline,
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
     * Normalize lead data to ensure primaryCategory is always present
     * (fallback to primarySkill for backward compatibility)
     */
    static normalizeLeadData(lead) {
        if (!lead)
            return lead;
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
    static async getLeadById(leadId) {
        try {
            const lead = await Lead_1.default.findOne({ leadId }).lean();
            if (!lead)
                return null;
            // Normalize lead data to ensure primaryCategory is present
            return this.normalizeLeadData(lead);
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
    /**
     * Get unique users who have added leads (for filter dropdown)
     * Returns array of { userId, name } for users who have added at least one lead
     */
    static async getLeadCreators() {
        try {
            // Use aggregation to get distinct addedBy values with their names
            const creators = await Lead_1.default.aggregate([
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
        }
        catch (error) {
            logger_1.default.error('Error getting lead creators', {
                error: error.message
            });
            throw error;
        }
    }
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
            // Registration/conversion status (main website)
            if (filters.registrationStatus) {
                switch (filters.registrationStatus) {
                    case 'not_registered':
                        query.$and = query.$and || [];
                        query.$and.push({
                            $or: [
                                { conversionData: { $exists: false } },
                                { 'conversionData.platformUid': { $exists: false } },
                                { 'conversionData.platformUid': null },
                                { 'conversionData.platformUid': '' }
                            ]
                        });
                        break;
                    case 'registered':
                        query.$and = query.$and || [];
                        query.$and.push({
                            'conversionData.platformUid': { $exists: true, $nin: [null, ''] },
                            $or: [
                                { 'conversionData.isAadhaarVerified': { $ne: true } },
                                { 'conversionData.isAadhaarVerified': { $exists: false } }
                            ]
                        });
                        break;
                    case 'registered_verified':
                        query.$and = query.$and || [];
                        query.$and.push({
                            'conversionData.platformUid': { $exists: true, $nin: [null, ''] },
                            'conversionData.isAadhaarVerified': true
                        });
                        break;
                }
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
            // Normalize lead data to ensure primaryCategory is present
            const normalizedLeads = leads.map(lead => this.normalizeLeadData(lead));
            return {
                leads: normalizedLeads,
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
    static async getCallbackQueue(filters) {
        try {
            const page = filters.page || 1;
            const limit = filters.limit || 20;
            const skip = (page - 1) * limit;
            const query = {
                nextCallbackAt: { $exists: true, $ne: null },
            };
            if (filters.city) {
                query.city = { $regex: new RegExp(filters.city, 'i') };
            }
            if (filters.primarySkill) {
                query.$or = [
                    { primarySkill: { $regex: new RegExp(filters.primarySkill, 'i') } },
                    { primaryCategory: { $regex: new RegExp(filters.primarySkill, 'i') } },
                ];
            }
            if (filters.addedBy) {
                query.addedBy = filters.addedBy;
            }
            if (filters.startDate || filters.endDate) {
                query.nextCallbackAt = query.nextCallbackAt || {};
                if (filters.startDate)
                    query.nextCallbackAt.$gte = filters.startDate;
                if (filters.endDate)
                    query.nextCallbackAt.$lte = filters.endDate;
            }
            const [leads, total] = await Promise.all([
                Lead_1.default.find(query)
                    .sort({ nextCallbackAt: 1, createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Lead_1.default.countDocuments(query),
            ]);
            const normalizedLeads = leads.map((lead) => this.normalizeLeadData(lead));
            return {
                leads: normalizedLeads,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        }
        catch (error) {
            logger_1.default.error('Error fetching callback queue', {
                error: error.message,
                filters,
            });
            throw error;
        }
    }
    static async getCallbackQueueStats(filters) {
        try {
            const now = new Date();
            const startOfToday = new Date(now);
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date(now);
            endOfToday.setHours(23, 59, 59, 999);
            const baseQuery = {
                nextCallbackAt: { $exists: true, $ne: null },
            };
            if (filters.addedBy) {
                baseQuery.addedBy = filters.addedBy;
            }
            const [totalScheduled, overdue, dueToday] = await Promise.all([
                Lead_1.default.countDocuments(baseQuery),
                Lead_1.default.countDocuments({
                    ...baseQuery,
                    nextCallbackAt: { $lt: now },
                }),
                Lead_1.default.countDocuments({
                    ...baseQuery,
                    nextCallbackAt: { $gte: startOfToday, $lte: endOfToday },
                }),
            ]);
            return {
                totalScheduled,
                overdue,
                dueToday,
            };
        }
        catch (error) {
            logger_1.default.error('Error fetching callback queue stats', {
                error: error.message,
                filters,
            });
            throw error;
        }
    }
    static async getFollowUpQueue(filters) {
        try {
            const page = filters.page || 1;
            const limit = filters.limit || 20;
            const skip = (page - 1) * limit;
            const now = new Date();
            const startOfToday = new Date(now);
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date(now);
            endOfToday.setHours(23, 59, 59, 999);
            const query = {};
            if (filters.city) {
                query.city = { $regex: new RegExp(filters.city, 'i') };
            }
            if (filters.primarySkill) {
                query.$or = [
                    { primarySkill: { $regex: new RegExp(filters.primarySkill, 'i') } },
                    { primaryCategory: { $regex: new RegExp(filters.primarySkill, 'i') } },
                ];
            }
            if (filters.addedBy) {
                query.addedBy = filters.addedBy;
            }
            if (filters.dueType === 'callback') {
                query.nextCallbackAt = { $exists: true, $ne: null };
            }
            else if (filters.dueType === 'onboarding') {
                query.expectedOnboardingAt = { $exists: true, $ne: null };
            }
            else {
                query.$and = query.$and || [];
                query.$and.push({
                    $or: [
                        { nextCallbackAt: { $exists: true, $ne: null } },
                        { expectedOnboardingAt: { $exists: true, $ne: null } },
                    ],
                });
            }
            const leads = await Lead_1.default.find(query).lean();
            let items = [];
            for (const lead of leads) {
                if ((filters.dueType === 'all' || !filters.dueType || filters.dueType === 'callback') && lead.nextCallbackAt) {
                    items.push({
                        ...this.normalizeLeadData(lead),
                        dueType: 'callback',
                        dueAt: new Date(lead.nextCallbackAt),
                    });
                }
                if ((filters.dueType === 'all' || !filters.dueType || filters.dueType === 'onboarding') && lead.expectedOnboardingAt) {
                    items.push({
                        ...this.normalizeLeadData(lead),
                        dueType: 'onboarding',
                        dueAt: new Date(lead.expectedOnboardingAt),
                    });
                }
            }
            const bucket = filters.bucket || 'all';
            items = items.filter((item) => {
                if (bucket === 'today')
                    return item.dueAt >= startOfToday && item.dueAt <= endOfToday;
                if (bucket === 'overdue')
                    return item.dueAt < now;
                if (bucket === 'upcoming')
                    return item.dueAt > endOfToday;
                if (bucket === 'range') {
                    if (filters.startDate && item.dueAt < filters.startDate)
                        return false;
                    if (filters.endDate && item.dueAt > filters.endDate)
                        return false;
                    return true;
                }
                if (filters.startDate && item.dueAt < filters.startDate)
                    return false;
                if (filters.endDate && item.dueAt > filters.endDate)
                    return false;
                return true;
            });
            items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
            const total = items.length;
            const paged = items.slice(skip, skip + limit);
            return {
                leads: paged,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        }
        catch (error) {
            logger_1.default.error('Error fetching follow-up queue', {
                error: error.message,
                filters,
            });
            throw error;
        }
    }
    static async getFollowUpQueueStats(filters) {
        try {
            const now = new Date();
            const startOfToday = new Date(now);
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date(now);
            endOfToday.setHours(23, 59, 59, 999);
            const scope = {};
            if (filters.addedBy)
                scope.addedBy = filters.addedBy;
            const [callbackDueToday, callbackOverdue, onboardingDueToday, onboardingOverdue, callbackTotal, onboardingTotal,] = await Promise.all([
                Lead_1.default.countDocuments({
                    ...scope,
                    nextCallbackAt: { $gte: startOfToday, $lte: endOfToday },
                }),
                Lead_1.default.countDocuments({
                    ...scope,
                    nextCallbackAt: { $lt: now },
                }),
                Lead_1.default.countDocuments({
                    ...scope,
                    expectedOnboardingAt: { $gte: startOfToday, $lte: endOfToday },
                }),
                Lead_1.default.countDocuments({
                    ...scope,
                    expectedOnboardingAt: { $lt: now },
                }),
                Lead_1.default.countDocuments({
                    ...scope,
                    nextCallbackAt: { $exists: true, $ne: null },
                }),
                Lead_1.default.countDocuments({
                    ...scope,
                    expectedOnboardingAt: { $exists: true, $ne: null },
                }),
            ]);
            return {
                callbackTotal,
                onboardingTotal,
                callbackDueToday,
                callbackOverdue,
                onboardingDueToday,
                onboardingOverdue,
                totalFollowUps: callbackTotal + onboardingTotal,
            };
        }
        catch (error) {
            logger_1.default.error('Error fetching follow-up queue stats', {
                error: error.message,
                filters,
            });
            throw error;
        }
    }
    static async getStatusAnalytics(filters) {
        try {
            const leadMatch = {};
            if (filters.qualifierId) {
                leadMatch.addedBy = filters.qualifierId;
            }
            const dateMatch = {
                'statusHistory.changedAt': { $gte: filters.from, $lte: filters.to },
            };
            const basePipeline = [
                { $match: leadMatch },
                { $unwind: '$statusHistory' },
                { $match: dateMatch },
            ];
            const [statusCountsRaw, touchedRaw, qualifierRaw] = await Promise.all([
                Lead_1.default.aggregate([
                    ...basePipeline,
                    {
                        $group: {
                            _id: '$statusHistory.status',
                            count: { $sum: 1 },
                        },
                    },
                ]),
                Lead_1.default.aggregate([
                    ...basePipeline,
                    {
                        $group: {
                            _id: '$leadId',
                        },
                    },
                    { $count: 'count' },
                ]),
                Lead_1.default.aggregate([
                    ...basePipeline,
                    {
                        $group: {
                            _id: '$addedBy',
                            qualifierName: { $last: '$addedByName' },
                            leadIds: { $addToSet: '$leadId' },
                        },
                    },
                    {
                        $project: {
                            qualifierId: '$_id',
                            qualifierName: { $ifNull: ['$qualifierName', 'Unknown'] },
                            touchedLeads: { $size: '$leadIds' },
                        },
                    },
                    { $sort: { touchedLeads: -1 } },
                ]),
            ]);
            const statusCounts = statusCountsRaw.map((row) => ({
                status: row._id,
                count: row.count,
            }));
            const statusCountMap = new Map(statusCounts.map((row) => [row.status, row.count]));
            const callbackOverdue = await Lead_1.default.countDocuments({
                ...(filters.qualifierId ? { addedBy: filters.qualifierId } : {}),
                nextCallbackAt: { $lt: new Date() },
            });
            return {
                touchedLeads: touchedRaw[0]?.count || 0,
                interested: statusCountMap.get('contacted_interested') || 0,
                notInterested: statusCountMap.get('contacted_not_interested') || 0,
                callbackScheduled: statusCountMap.get('contacted_interested') || 0,
                callbackOverdue,
                statusCounts,
                qualifierBreakdown: qualifierRaw.map((row) => ({
                    qualifierId: row.qualifierId,
                    qualifierName: row.qualifierName,
                    touchedLeads: row.touchedLeads,
                })),
            };
        }
        catch (error) {
            logger_1.default.error('Error fetching status analytics', {
                error: error.message,
                filters,
            });
            throw error;
        }
    }
    static async exportStatusReport(filters) {
        try {
            const leadMatch = {};
            if (filters.qualifierId) {
                leadMatch.addedBy = filters.qualifierId;
            }
            const rows = await Lead_1.default.aggregate([
                { $match: leadMatch },
                { $unwind: '$statusHistory' },
                { $match: { 'statusHistory.changedAt': { $gte: filters.from, $lte: filters.to } } },
                { $sort: { 'statusHistory.changedAt': -1 } },
                {
                    $group: {
                        _id: '$leadId',
                        leadId: { $first: '$leadId' },
                        name: { $first: '$name' },
                        phone: { $first: '$phone' },
                        landline: { $first: '$landline' },
                        city: { $first: '$city' },
                        state: { $first: '$state' },
                        primaryCategory: { $first: '$primaryCategory' },
                        secondaryCategory: { $first: '$secondaryCategory' },
                        source: { $first: '$source' },
                        sourceDetails: { $first: '$sourceDetails' },
                        createdAt: { $first: '$createdAt' },
                        updatedAt: { $first: '$updatedAt' },
                        currentStatus: { $first: '$status' },
                        qualifierName: { $first: '$addedByName' },
                        qualifierId: { $first: '$addedBy' },
                        isDuplicate: { $first: '$isDuplicate' },
                        blacklisted: { $first: '$blacklisted' },
                        latestHistory: { $first: '$statusHistory' },
                    },
                },
                { $sort: { updatedAt: -1 } },
            ]);
            const reportRows = rows.map((row) => {
                const base = {
                    Date: this.formatIST(row.latestHistory?.changedAt),
                    'Qualifier Name': row.qualifierName || 'Unknown',
                    'Lead ID': row.leadId,
                    'Lead Name': row.name || '',
                    'Phone/Landline': row.phone || row.landline || '',
                    City: row.city || '',
                    'Current Status': row.currentStatus || '',
                    'Status Reason': row.latestHistory?.statusReasonText || row.latestHistory?.statusReasonCode || '',
                    'Callback Date': this.formatIST(row.latestHistory?.callbackAt),
                    'Expected Onboarding Date': this.formatIST(row.latestHistory?.expectedOnboardingAt),
                    'Last Updated At': this.formatIST(row.updatedAt),
                    'Last Updated By': row.latestHistory?.changedByName || row.latestHistory?.changedBy || '',
                };
                if (filters.template === 'detailed') {
                    base.State = row.state || '';
                    base['Primary Category'] = row.primaryCategory || '';
                    base['Secondary Category'] = row.secondaryCategory || '';
                    base.Source = row.source || '';
                    base['Source Details'] = row.sourceDetails || '';
                    base['Created At'] = this.formatIST(row.createdAt);
                    base['Updated At'] = this.formatIST(row.updatedAt);
                    if (filters.includeNotes) {
                        base.Notes = row.latestHistory?.notes || '';
                    }
                    base['Is Duplicate'] = row.isDuplicate ? 'Yes' : 'No';
                    base.Blacklisted = row.blacklisted ? 'Yes' : 'No';
                }
                return base;
            });
            const worksheet = xlsx_1.default.utils.json_to_sheet(reportRows);
            const workbook = xlsx_1.default.utils.book_new();
            xlsx_1.default.utils.book_append_sheet(workbook, worksheet, 'Status Report');
            const dateStamp = new Date().toISOString().slice(0, 10);
            const filename = `lead-status-report-${filters.template}-${dateStamp}.${filters.format}`;
            const mimeType = filters.format === 'xlsx'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'text/csv';
            const buffer = filters.format === 'xlsx'
                ? xlsx_1.default.write(workbook, { type: 'buffer', bookType: 'xlsx' })
                : Buffer.from(xlsx_1.default.utils.sheet_to_csv(worksheet), 'utf-8');
            return {
                filename,
                mimeType,
                buffer,
                rowCount: reportRows.length,
            };
        }
        catch (error) {
            logger_1.default.error('Error exporting status report', {
                error: error.message,
                filters,
            });
            throw error;
        }
    }
    /**
     * Update lead
     */
    static async updateLead(leadId, data) {
        try {
            const setData = {};
            const unsetData = {};
            const has = (key) => Object.prototype.hasOwnProperty.call(data, key);
            if (has('name') && typeof data.name === 'string' && data.name.trim()) {
                setData.name = data.name.trim();
            }
            if (has('phone')) {
                const rawPhone = typeof data.phone === 'string' ? data.phone.trim() : '';
                if (rawPhone) {
                    setData.phone = DuplicateCheckService_1.DuplicateCheckService.normalizePhone(rawPhone);
                }
                else {
                    unsetData.phone = 1;
                }
            }
            if (has('landline')) {
                const rawLandline = typeof data.landline === 'string' ? data.landline.trim() : '';
                if (rawLandline) {
                    setData.landline = DuplicateCheckService_1.DuplicateCheckService.normalizeLandline(rawLandline);
                }
                else {
                    unsetData.landline = 1;
                }
            }
            // Ensure at least one contact number remains after update.
            const existingLead = await Lead_1.default.findOne({ leadId }).lean();
            if (!existingLead) {
                throw new Error('Lead not found');
            }
            const finalPhone = Object.prototype.hasOwnProperty.call(setData, 'phone')
                ? setData.phone
                : (unsetData.phone ? undefined : existingLead.phone);
            const finalLandline = Object.prototype.hasOwnProperty.call(setData, 'landline')
                ? setData.landline
                : (unsetData.landline ? undefined : existingLead.landline);
            if (!finalPhone?.trim() && !finalLandline?.trim()) {
                throw new Error('At least one contact number (phone or landline) must be present');
            }
            if (has('email')) {
                const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
                if (email)
                    setData.email = email;
                else
                    unsetData.email = 1;
            }
            if (has('city')) {
                const city = typeof data.city === 'string' ? data.city.trim() : '';
                if (city)
                    setData.city = city;
                else
                    unsetData.city = 1;
            }
            if (has('state')) {
                const state = typeof data.state === 'string' ? data.state.trim() : '';
                if (state)
                    setData.state = state;
                else
                    unsetData.state = 1;
            }
            if (has('address')) {
                const address = typeof data.address === 'string' ? data.address.trim() : '';
                if (address)
                    setData.address = address;
                else
                    unsetData.address = 1;
            }
            if (has('pincode')) {
                const pincode = typeof data.pincode === 'string' ? data.pincode.trim() : '';
                if (pincode)
                    setData.pincode = pincode;
                else
                    unsetData.pincode = 1;
            }
            if (has('primarySkill')) {
                const primarySkill = typeof data.primarySkill === 'string' ? data.primarySkill.trim() : '';
                if (primarySkill) {
                    setData.primarySkill = primarySkill;
                    setData.primaryCategory = primarySkill;
                }
                else {
                    unsetData.primarySkill = 1;
                    unsetData.primaryCategory = 1;
                }
            }
            if (has('secondarySkill')) {
                const secondarySkill = typeof data.secondarySkill === 'string' ? data.secondarySkill.trim() : '';
                if (secondarySkill) {
                    setData.secondarySkill = secondarySkill;
                    setData.secondaryCategory = secondarySkill;
                }
                else {
                    unsetData.secondarySkill = 1;
                    unsetData.secondaryCategory = 1;
                }
            }
            if (has('source')) {
                if (data.source)
                    setData.source = data.source;
                else
                    unsetData.source = 1;
            }
            if (has('sourceDetails')) {
                const sourceDetails = typeof data.sourceDetails === 'string' ? data.sourceDetails.trim() : '';
                if (sourceDetails)
                    setData.sourceDetails = sourceDetails;
                else
                    unsetData.sourceDetails = 1;
            }
            if (has('skills') && data.skills)
                setData.skills = data.skills;
            const updateQuery = {};
            if (Object.keys(setData).length > 0)
                updateQuery.$set = setData;
            if (Object.keys(unsetData).length > 0)
                updateQuery.$unset = unsetData;
            const lead = await Lead_1.default.findOneAndUpdate({ leadId }, updateQuery, { new: true }).lean();
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
            // ✅ Auto-transition: When marketing sets status to 'documents_submitted', 
            // automatically transition to 'under_verification' so lead appears in verification queue
            let finalStatus = newStatus;
            // ✅ UPDATED: Removed 'activated' check - activation is now tracked via accountStatus, not lead status
            if (newStatus === 'documents_submitted' && currentStatus !== 'under_verification' && currentStatus !== 'approved') {
                finalStatus = 'under_verification';
                logger_1.default.info('Auto-transitioning lead from documents_submitted to under_verification', {
                    leadId,
                    changedBy: data.changedBy
                });
            }
            const normalizedStatusUpdate = (0, leadStatusValidator_1.validateAndNormalizeLeadStatusUpdate)(data);
            // Update status
            const isContactStatus = ['contacted_not_interested', 'contacted_interested'].includes(finalStatus);
            const statusReasonCode = normalizedStatusUpdate.statusReasonCode;
            const statusReasonText = normalizedStatusUpdate.statusReasonText;
            const callbackAt = normalizedStatusUpdate.callbackAt;
            const expectedOnboardingAt = normalizedStatusUpdate.expectedOnboardingAt;
            lead.status = finalStatus;
            if (isContactStatus) {
                lead.lastContactedAt = new Date();
                lead.lastContactedBy = data.changedBy;
            }
            lead.statusReasonCode = statusReasonCode || undefined;
            lead.statusReasonText = statusReasonText || undefined;
            lead.nextCallbackAt = callbackAt || undefined;
            lead.expectedOnboardingAt = expectedOnboardingAt || undefined;
            lead.statusHistory.push({
                status: finalStatus,
                changedBy: data.changedBy,
                changedByName: data.changedByName,
                changedAt: new Date(),
                statusReasonCode: statusReasonCode || undefined,
                statusReasonText: statusReasonText || undefined,
                callbackAt: callbackAt || undefined,
                expectedOnboardingAt: expectedOnboardingAt || undefined,
                notes: newStatus === 'documents_submitted' && finalStatus === 'under_verification'
                    ? (normalizedStatusUpdate.notes || '') + ' (Auto-transitioned to verification queue)'
                    : normalizedStatusUpdate.notes
            });
            const updatedLead = await lead.save();
            // Log activity
            await this.logActivity(leadId, 'status_change', `Status changed from ${currentStatus} to ${finalStatus}${finalStatus !== newStatus ? ` (requested: ${newStatus})` : ''}`, data.changedBy, data.changedByName, {
                oldStatus: currentStatus,
                newStatus: finalStatus,
                requestedStatus: newStatus,
                statusReasonCode: statusReasonCode || undefined,
                statusReasonText: statusReasonText || undefined,
                callbackAt: callbackAt || undefined,
                expectedOnboardingAt: expectedOnboardingAt || undefined
            });
            logger_1.default.info('Lead status updated', {
                leadId,
                oldStatus: currentStatus,
                newStatus: finalStatus,
                requestedStatus: newStatus,
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
            await this.logActivity(leadId, 'document_upload', `Document uploaded: ${document.type}`, document.uploadedAt ? 'system' : 'lead_access_manager', undefined, { documentType: document.type });
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
    static async verifyDocument(leadId, documentIndex, status, verifiedBy, verifiedByName, rejectionReason, exactDetails) {
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
                // Clear exact details if rejecting
                document.exactAadhaarNumber = undefined;
                document.exactPANNumber = undefined;
                document.exactAddressDetails = undefined;
            }
            else if (status === 'verified') {
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
                    logger_1.default.info('Stored exact Aadhaar number for document verification', {
                        leadId,
                        documentIndex,
                        masked: `${cleaned.slice(0, 4)} ${cleaned.slice(4, 8)} ${cleaned.slice(8)}`
                    });
                }
                else if (document.type === 'pan') {
                    if (!exactDetails || !exactDetails.exactPANNumber) {
                        throw new Error('Exact PAN number is mandatory when verifying PAN document');
                    }
                    // Validate PAN format (10 characters: 5 letters, 4 digits, 1 letter)
                    const cleaned = exactDetails.exactPANNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                    if (cleaned.length !== 10 || !/^[A-Z]{5}\d{4}[A-Z]{1}$/.test(cleaned)) {
                        throw new Error('PAN number must be in format ABCDE1234F');
                    }
                    document.exactPANNumber = cleaned;
                    logger_1.default.info('Stored exact PAN number for document verification', {
                        leadId,
                        documentIndex,
                        masked: `${cleaned.slice(0, 2)}XXXX${cleaned.slice(6)}`
                    });
                }
                else if (document.type === 'address_proof') {
                    if (!exactDetails || !exactDetails.exactAddressDetails) {
                        throw new Error('Exact address details are mandatory when verifying Address Proof document');
                    }
                    if (exactDetails.exactAddressDetails.trim().length < 10) {
                        throw new Error('Address details must be at least 10 characters long');
                    }
                    document.exactAddressDetails = exactDetails.exactAddressDetails.trim();
                    logger_1.default.info('Stored exact address details for document verification', {
                        leadId,
                        documentIndex
                    });
                }
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
            await this.logActivity(leadId, 'document_upload', `Document deleted: ${documentType}`, 'lead_access_manager', undefined, { documentType });
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
            await this.logActivity(leadId, 'skill_assigned', `Skill assigned: ${skill.name}`, skill.assignedBy || 'lead_access_manager', undefined, { skillName: skill.name, category: skill.category });
            // Check if lead should be auto-approved (refresh lead to get latest state)
            if (updatedLead) {
                // Refresh lead from database to ensure we have latest documents and skills
                const freshLead = await this.getLeadById(leadId);
                if (freshLead) {
                    const criteria = ApprovalService_1.ApprovalService.checkApprovalCriteria(freshLead);
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
            await this.logActivity(leadId, 'skill_assigned', `Skill updated: ${skill.name}`, 'lead_access_manager', undefined, { skillName: skill.name, updates: updateData });
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
            await this.logActivity(leadId, 'skill_assigned', `Skill removed: ${skillName}`, 'lead_access_manager', undefined, { skillName });
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
     * Update address from Aadhaar verification
     */
    static async updateAddressFromAadhaar(leadId, address) {
        try {
            const lead = await Lead_1.default.findOne({ leadId });
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
            await this.logActivity(leadId, 'address_update', `Address updated from Aadhaar verification: ${address.city}, ${address.state} - ${address.pincode}`, 'system', 'Aadhaar Verification', { source: 'aadhaar_verification', address });
            logger_1.default.info('Address updated from Aadhaar verification', {
                leadId,
                city: address.city,
                state: address.state,
                pincode: address.pincode
            });
            return updatedLead;
        }
        catch (error) {
            logger_1.default.error('Error updating address from Aadhaar', {
                error: error.message,
                leadId
            });
            throw error;
        }
    }
    /**
     * Mark address as verified
     */
    static async markAddressAsVerified(leadId, data) {
        try {
            const lead = await Lead_1.default.findOne({ leadId });
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
            }
            else {
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
            await this.logActivity(leadId, 'address_verification', `Address verified via ${data.source}`, data.verifiedBy, undefined, { source: data.source });
            logger_1.default.info('Address marked as verified', {
                leadId,
                source: data.source,
                verifiedBy: data.verifiedBy
            });
            return updatedLead;
        }
        catch (error) {
            logger_1.default.error('Error marking address as verified', {
                error: error.message,
                leadId
            });
            throw error;
        }
    }
    /**
     * Delete a lead
     */
    static async deleteLead(leadId, deletedBy, deletedByName) {
        try {
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                throw new Error('Lead not found');
            }
            // Log deletion activity before deleting
            await this.logActivity(leadId, 'deletion', 'Lead deleted', deletedBy, deletedByName, {
                leadName: lead.name,
                leadPhone: lead.phone,
                leadCity: lead.city,
                status: lead.status,
                accountStatus: lead.accountStatus
            });
            // Delete the lead
            await Lead_1.default.deleteOne({ leadId });
            logger_1.default.info('Lead deleted successfully', {
                leadId,
                deletedBy,
                deletedByName,
                leadName: lead.name
            });
        }
        catch (error) {
            logger_1.default.error('Error deleting lead', {
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