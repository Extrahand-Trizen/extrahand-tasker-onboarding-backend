import { ILead, LeadStatus, LeadSource } from '../models/Lead';
import { UserRole } from '../lib/permissions';
export interface CreateLeadData {
    name: string;
    phone?: string;
    landline?: string;
    email?: string;
    city?: string;
    state?: string;
    address?: string;
    pincode?: string;
    primaryCategory?: string;
    primarySkill?: string;
    secondaryCategory?: string;
    secondarySkill?: string;
    experienceLevel?: 'beginner' | 'intermediate' | 'experienced';
    workingDays?: string;
    preferredTimeSlot?: string;
    source?: LeadSource;
    sourceDetails?: string;
    agentCampaignId?: string;
    addedBy: string;
    addedByName?: string;
    status?: LeadStatus;
}
export interface ILeadSkill {
    name: string;
    category?: string;
    level?: 'beginner' | 'intermediate' | 'experienced';
    toolsAvailable?: boolean;
    assignedBy?: string;
    assignedAt?: Date;
}
export interface UpdateLeadData {
    name?: string;
    phone?: string | null;
    landline?: string | null;
    email?: string | null;
    city?: string | null;
    state?: string | null;
    address?: string | null;
    pincode?: string | null;
    primarySkill?: string | null;
    primaryCategory?: string | null;
    secondarySkill?: string | null;
    secondaryCategory?: string | null;
    source?: LeadSource | null;
    sourceDetails?: string | null;
    skills?: ILeadSkill[];
}
export interface UpdateStatusData {
    status: LeadStatus;
    notes?: string;
    statusReasonCode?: string;
    statusReasonText?: string;
    callbackAt?: Date | string;
    expectedOnboardingAt?: Date | string;
    changedBy: string;
    changedByName?: string;
}
export type RegistrationStatusFilter = 'not_registered' | 'registered' | 'registered_verified';
export interface SearchFilters {
    status?: LeadStatus;
    city?: string;
    primarySkill?: string;
    source?: LeadSource;
    addedBy?: string;
    addedByAny?: string[];
    pickedBy?: string;
    transferPendingTo?: string;
    ownerBy?: string;
    ownerByAny?: string[];
    search?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
    /** Filter by conversion/registration on main website */
    registrationStatus?: RegistrationStatusFilter;
    /** Filter by user who moved lead into current contact status */
    statusChangedBy?: string;
}
export interface CallbackQueueFilters {
    city?: string;
    primarySkill?: string;
    addedBy?: string;
    addedByAny?: string[];
    ownerBy?: string;
    ownerByAny?: string[];
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
}
export interface CallbackQueueStats {
    totalScheduled: number;
    overdue: number;
    dueToday: number;
}
export type FollowUpDueType = 'all' | 'callback' | 'onboarding';
export type FollowUpBucket = 'all' | 'today' | 'overdue' | 'upcoming' | 'range';
export interface FollowUpQueueFilters {
    city?: string;
    primarySkill?: string;
    addedBy?: string;
    addedByAny?: string[];
    ownerBy?: string;
    ownerByAny?: string[];
    pickedBy?: string;
    startDate?: Date;
    endDate?: Date;
    dueType?: FollowUpDueType;
    bucket?: FollowUpBucket;
    page?: number;
    limit?: number;
}
export interface FollowUpQueueItem {
    [key: string]: any;
    leadId: string;
    name: string;
    status: LeadStatus;
    dueType: 'callback' | 'onboarding';
    dueAt: Date;
}
export interface FollowUpQueueStats {
    callbackTotal: number;
    onboardingTotal: number;
    callbackDueToday: number;
    callbackOverdue: number;
    onboardingDueToday: number;
    onboardingOverdue: number;
    totalFollowUps: number;
}
export interface StatusAnalyticsFilters {
    from?: Date;
    to?: Date;
    qualifierId?: string;
    pickedBy?: string;
    category?: string;
    claimsScope?: 'current' | 'total';
    allTime?: boolean;
}
export type StatusReportCategory = 'touched_leads' | 'interested' | 'callback_scheduled' | 'callback_overdue';
export interface StatusReportExportFilters extends StatusAnalyticsFilters {
    format: 'csv' | 'xlsx';
    template: 'eod' | 'detailed';
    reportCategory: StatusReportCategory;
    includeNotes?: boolean;
    /** Primary category slug filter for exports */
    category?: string;
    /** Qualifier-friendly column layout */
    exportLayout?: 'standard' | 'qualifier';
}
export declare class LeadService {
    private static readonly STATUS_REPORT_LABELS;
    private static formatIST;
    private static labelForReport;
    private static readonly PRIMARY_CATEGORY_LABELS;
    private static categoryLabelForExport;
    private static contactStatusForExport;
    private static registrationStatusForExport;
    private static buildCategoryMatch;
    private static textForSpreadsheet;
    private static applyWorksheetLayout;
    private static getISTDayBounds;
    /**
     * Generate unique lead ID
     */
    static generateLeadId(): string;
    /**
     * Create a new lead
     */
    static createLead(data: CreateLeadData, options?: {
        skipNameCityDuplicate?: boolean;
    }): Promise<ILead>;
    /**
     * Normalize lead data to ensure primaryCategory is always present
     * (fallback to primarySkill for backward compatibility)
     */
    private static normalizeLeadData;
    private static applyOwnerScope;
    /**
     * Get lead by ID
     */
    static getLeadById(leadId: string): Promise<ILead | null>;
    /**
     * Search and filter leads
     */
    /**
     * Get unique users who have added leads (for filter dropdown)
     * Returns array of { userId, name } for users who have added at least one lead
     */
    static getLeadCreators(): Promise<Array<{
        userId: string;
        name: string;
    }>>;
    static searchLeads(filters: SearchFilters): Promise<{
        leads: ILead[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    static getCallbackQueue(filters: CallbackQueueFilters): Promise<{
        leads: ILead[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    static getCallbackQueueStats(filters: Pick<CallbackQueueFilters, 'addedBy' | 'addedByAny' | 'ownerBy' | 'ownerByAny'>): Promise<CallbackQueueStats>;
    static getFollowUpQueue(filters: FollowUpQueueFilters): Promise<{
        leads: FollowUpQueueItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    static getFollowUpQueueStats(filters: Pick<FollowUpQueueFilters, 'addedBy' | 'addedByAny' | 'ownerBy' | 'ownerByAny' | 'pickedBy'>): Promise<FollowUpQueueStats>;
    static getStatusAnalytics(filters: StatusAnalyticsFilters): Promise<{
        leadsAdded: number;
        touchedLeads: number;
        interested: number;
        notInterested: number;
        callbackScheduled: number;
        callbackOverdue: number;
        statusCounts: Array<{
            status: string;
            count: number;
        }>;
        qualifierBreakdown: Array<{
            qualifierId: string;
            qualifierName: string;
            touchedLeads: number;
        }>;
        categoryBreakdown: Array<{
            category: string;
            count: number;
        }>;
    }>;
    static exportStatusReport(filters: StatusReportExportFilters): Promise<{
        filename: string;
        mimeType: string;
        buffer: Buffer;
        rowCount: number;
    }>;
    private static exportQualifierStatusReport;
    /**
     * Update lead
     */
    static updateLead(leadId: string, data: UpdateLeadData & {
        skills?: ILeadSkill[];
    }): Promise<ILead | null>;
    /**
     * Update lead status
     */
    static updateStatus(leadId: string, data: UpdateStatusData, currentRole: UserRole): Promise<ILead | null>;
    /**
     * Add internal note
     */
    static addNote(leadId: string, note: string, addedBy: string, addedByName?: string, isPrivate?: boolean): Promise<ILead | null>;
    /**
     * Add document to lead
     */
    static addDocument(leadId: string, document: ILead['documents'][0]): Promise<ILead | null>;
    /**
     * Verify or reject a document
     */
    static verifyDocument(leadId: string, documentIndex: number, status: 'verified' | 'rejected', verifiedBy: string, verifiedByName?: string, rejectionReason?: string, exactDetails?: {
        exactAadhaarNumber?: string;
        exactPANNumber?: string;
        exactAddressDetails?: string;
    }): Promise<ILead | null>;
    /**
     * Delete a document
     */
    static deleteDocument(leadId: string, documentIndex: number): Promise<ILead | null>;
    /**
     * Add skill to lead
     */
    static addSkill(leadId: string, skill: ILeadSkill): Promise<ILead | null>;
    /**
     * Update a skill
     */
    static updateSkill(leadId: string, skillIndex: number, updateData: Partial<ILeadSkill>): Promise<ILead | null>;
    /**
     * Remove a skill
     */
    static removeSkill(leadId: string, skillIndex: number): Promise<ILead | null>;
    /**
     * Update address from Aadhaar verification
     */
    static updateAddressFromAadhaar(leadId: string, address: {
        line1: string;
        line2?: string;
        city: string;
        state: string;
        pincode: string;
    }): Promise<ILead | null>;
    /**
     * Mark address as verified
     */
    static markAddressAsVerified(leadId: string, data: {
        verifiedBy: string;
        verifiedAt: Date;
        source: string;
    }): Promise<ILead | null>;
    /**
     * Delete a lead
     */
    static deleteLead(leadId: string, deletedBy: string, deletedByName?: string): Promise<void>;
    /**
     * Log activity
     */
    static logActivity(leadId: string, type: string, action: string, performedBy: string, performedByName?: string, metadata?: Record<string, any>): Promise<void>;
    static getPerformanceOverview(): Promise<any>;
    static getPerformanceDetails(userId: string, filters: {
        from?: Date;
        to?: Date;
        allTime?: boolean;
    }): Promise<any>;
}
//# sourceMappingURL=LeadService.d.ts.map