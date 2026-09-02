import Lead, { ILead, LeadStatus, LeadSource, ILeadDocument } from '../models/Lead';
import AdminUser from '../models/AdminUser';
import LeadActivity from '../models/LeadActivity';
import { DuplicateCheckService } from './DuplicateCheckService';
import { ApprovalService } from './ApprovalService';
import { canUpdateStatus, UserRole } from '../lib/permissions';
import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';
import { validateAndNormalizeLeadStatusUpdate } from '../validators/leadStatusValidator';
import XLSX from 'xlsx';

export interface CreateLeadData {
  name: string;
  phone?: string;
  landline?: string;
  email?: string;
  city?: string;
  state?: string;
  address?: string; // Local Area
  pincode?: string;
  isGatedCommunity?: boolean;
  gatedCommunityName?: string;
  primaryCategory?: string; // New field name
  primarySkill?: string; // Legacy field name (for backward compatibility)
  secondaryCategory?: string; // New field name
  secondarySkill?: string; // Legacy field name (for backward compatibility)
  experienceLevel?: 'beginner' | 'intermediate' | 'experienced';
  workingDays?: string;
  preferredTimeSlot?: string;
  source?: LeadSource;
  sourceDetails?: string;
  agentCampaignId?: string;
  addedBy: string;
  addedByName?: string;
  status?: LeadStatus; // optional initial status (restricted set)
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
  isGatedCommunity?: boolean | null;
  gatedCommunityName?: string | null;
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
  attempts?: string;
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
  pickedByAny?: string[];
  transferPendingTo?: string;
  ownerBy?: string;
  ownerByAny?: string[];
  search?: string; // Name or phone search
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  /** Filter by conversion/registration on main website */
  registrationStatus?: RegistrationStatusFilter;
  /** Filter by user who moved lead into current contact status */
  statusChangedBy?: string;
  /** Filter by contact attempt count */
  attempts?: string;
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

export interface DashboardSummary {
  total: number;
  myLeadsAdded: number;
  approved: number;
  interested: number;
  notInterested: number;
  notRegistered: number;
  registered: number;
  registeredVerified: number;
}

export interface StatusAnalyticsFilters {
  from?: Date;
  to?: Date;
  qualifierId?: string;
  pickedBy?: string;
  pickedByAny?: string[];
  category?: string;
  claimsScope?: 'current' | 'total';
  allTime?: boolean;
  gatedCommunityName?: string;
  city?: string;
  locality?: string;
  localArea?: string;
}

export type StatusReportCategory =
  | 'touched_leads'
  | 'interested'
  | 'callback_scheduled'
  | 'callback_overdue'
  | 'onboarded'
  | 'verified';

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

export class LeadService {
  private static readonly STATUS_REPORT_LABELS: Record<string, string> = {
    lead_added: 'New Lead',
    contacted_not_lifted: 'Contacted & Not Lifted',
    contacted_not_interested: 'Contacted & Not Interested',
    contacted_interested: 'Contacted & Interested',
    documents_submitted: 'Documents Received',
    under_verification: 'Under Verification',
    approved: 'Approved',
    inactive: 'Inactive',
    callback_requested: 'Callback Requested',
    interested_onboarding_later: 'Interested - Onboarding Later',
    not_interested: 'Not Interested',
    wrong_number: 'Wrong Number',
    other: 'Other',
  };

  private static formatIST(date?: Date): string {
    if (!date) return '';
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

  private static labelForReport(value?: string | null): string {
    if (!value) return '';
    return this.STATUS_REPORT_LABELS[value] || value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private static readonly PRIMARY_CATEGORY_LABELS: Record<string, string> = {
    cleaning: 'Cleaning',
    handyperson: 'Handyperson',
    moving: 'Moving & Delivery',
    gardening: 'Gardening',
    business: 'Business Services',
    marketing: 'Marketing & Design',
    tech: 'Tech Support',
    tutoring: 'Tutoring',
    photography: 'Photography',
    beauty: 'Beauty & Wellness',
    'pet-care': 'Pet Care',
    events: 'Events & Entertainment',
    'water-tanker': 'Water & Tanker Services',
    'ac-repair-service': 'AC Repair & Service',
    'security-services': 'Security Services',
    'senior-care': 'Senior Care / Elder Care',
    'driver-chauffeur': 'Driver / Chauffeur Services',
    'cooking-home-chef': 'Cooking / Home Chef',
    'laundry-ironing': 'Laundry & Ironing',
    other: 'Other',
  };

  private static categoryLabelForExport(value?: string | null): string {
    if (!value) return '';
    return this.PRIMARY_CATEGORY_LABELS[value] || value;
  }

  static async getDashboardSummary(role: UserRole, userId?: string): Promise<DashboardSummary> {
    const scope: Record<string, unknown> = { status: { $ne: 'inactive' } };

    if (role === 'qualifier' && userId) {
      scope.addedBy = userId;
    } else if (role === 'onboarder' && userId) {
      scope.pickedBy = userId;
    }

    const registeredQuery = {
      $or: [
        { 'conversionData.platformUid': { $exists: true, $nin: [null, ''] } },
        { 'activationData.firebaseUid': { $exists: true, $nin: [null, ''] } },
        { accountStatus: { $in: ['invited', 'activated', 'suspended'] } },
      ],
    };
    const verifiedQuery = {
      $or: [
        { 'conversionData.isAadhaarVerified': true },
        { 'verificationStatus.aadhaar.status': 'verified' },
      ],
    };

    const [total, myLeadsAdded, approved, interested, notInterested, notRegistered, registered, registeredVerified] =
      await Promise.all([
        Lead.countDocuments(scope),
        Lead.countDocuments({ ...scope, addedBy: userId || '__none__' }),
        Lead.countDocuments({ ...scope, status: 'approved' }),
        Lead.countDocuments({ ...scope, status: 'contacted_interested' }),
        Lead.countDocuments({ ...scope, status: 'contacted_not_interested' }),
        Lead.countDocuments({ ...scope, $nor: registeredQuery.$or }),
        Lead.countDocuments({ ...scope, $and: [registeredQuery, { $nor: verifiedQuery.$or }] }),
        Lead.countDocuments({ ...scope, $and: [registeredQuery, verifiedQuery] }),
      ]);

    return {
      total,
      myLeadsAdded,
      approved,
      interested,
      notInterested,
      notRegistered,
      registered,
      registeredVerified,
    };
  }

  private static contactStatusForExport(lead: {
    status?: string;
    nextCallbackAt?: Date | null;
  }): string {
    if (lead.status === 'contacted_interested' && lead.nextCallbackAt) {
      return 'Callback Scheduled';
    }
    if (lead.status === 'contacted_interested') return 'Interested';
    if (lead.status === 'contacted_not_interested') return 'Not Interested';
    if (lead.status === 'contacted_not_lifted') return 'Not Lifted';
    return '';
  }

  private static registrationStatusForExport(lead: {
    conversionData?: { platformUid?: string; isAadhaarVerified?: boolean };
  }): string {
    const conversion = lead.conversionData;
    if (!conversion?.platformUid) return 'Not Registered';
    if (conversion.isAadhaarVerified) return 'Verified';
    return 'Registered';
  }

  private static buildCategoryMatch(category: string): Record<string, unknown> {
    const label = this.PRIMARY_CATEGORY_LABELS[category];
    const matchConditions: any[] = [
      { primaryCategory: category },
      { primarySkill: category },
    ];

    if (label) {
      matchConditions.push({ primaryCategory: label });
      matchConditions.push({ primarySkill: label });
      matchConditions.push({ primaryCategory: { $regex: new RegExp(`^${label.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } });
      matchConditions.push({ primarySkill: { $regex: new RegExp(`^${label.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } });
    }

    matchConditions.push({ primaryCategory: { $regex: new RegExp(`^${category.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } });
    matchConditions.push({ primarySkill: { $regex: new RegExp(`^${category.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } });

    return {
      $or: matchConditions,
    };
  }

  private static escapeRegex(value: string): string {
    return value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  }

  private static buildExactCaseInsensitiveMatch(value: string): { $regex: RegExp } {
    return { $regex: new RegExp(`^${this.escapeRegex(value)}$`, 'i') };
  }

  private static buildRegisteredPredicate(): Record<string, unknown> {
    return {
      $or: [
        { 'conversionData.platformUid': { $exists: true, $nin: [null, ''] } },
        { 'activationData.firebaseUid': { $exists: true, $nin: [null, ''] } },
        { accountStatus: { $in: ['invited', 'activated', 'suspended'] } },
      ],
    };
  }

  private static buildVerifiedPredicate(): Record<string, unknown> {
    return {
      $or: [
        { 'conversionData.isAadhaarVerified': true },
        { 'verificationStatus.aadhaar.status': 'verified' },
      ],
    };
  }

  private static buildRegisteredOnlyPredicate(): Record<string, unknown> {
    return {
      ...this.buildRegisteredPredicate(),
      $nor: [this.buildVerifiedPredicate()],
    };
  }

  private static getAdminIdentityIds(user: { userId?: string | null; uid?: string | null }): string[] {
    return Array.from(
      new Set(
        [user.userId, user.uid].filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0
        )
      )
    );
  }

  private static buildIdSelector(field: string, ids: string[]): Record<string, unknown> {
    if (ids.length <= 1) {
      return { [field]: ids[0] };
    }

    return { [field]: { $in: ids } };
  }

  private static buildOwnerScopeClause(ownerIds: string[]): { $or: Array<Record<string, unknown>> } {
    return {
      $or: [
        this.buildIdSelector('pickedBy', ownerIds),
        this.buildIdSelector('addedBy', ownerIds),
        this.buildIdSelector('statusHistory.changedBy', ownerIds),
      ],
    };
  }

  private static textForSpreadsheet(value?: string | number | null): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private static applyWorksheetLayout(
    worksheet: XLSX.WorkSheet,
    rows: Array<Record<string, string>>
  ): void {
    if (!rows.length) {
      return;
    }

    const widthHints: Record<string, { min: number; max: number }> = {
      Date: { min: 24, max: 28 },
      'Qualifier Name': { min: 24, max: 35 },
      'Lead ID': { min: 16, max: 20 },
      'Lead Name': { min: 24, max: 40 },
      'Phone/Landline': { min: 18, max: 25 },
      City: { min: 18, max: 28 },
      State: { min: 16, max: 22 },
      'Current Status': { min: 24, max: 35 },
      'Status Reason': { min: 24, max: 45 },
      'Callback Date': { min: 24, max: 28 },
      'Expected Onboarding Date': { min: 26, max: 35 },
      'Last Updated At': { min: 24, max: 28 },
      'Last Updated By': { min: 28, max: 42 },
      'Primary Category': { min: 20, max: 32 },
      'Secondary Category': { min: 20, max: 32 },
      Source: { min: 16, max: 24 },
      'Source Details': { min: 20, max: 40 },
      'Created At': { min: 24, max: 28 },
      'Updated At': { min: 24, max: 28 },
      Notes: { min: 30, max: 55 },
      'Is Duplicate': { min: 16, max: 18 },
      Blacklisted: { min: 14, max: 16 },
    };

    const headers = Object.keys(rows[0]);

    worksheet['!cols'] = headers.map((header) => {
      const hint = widthHints[header] || { min: 16, max: 35 };
      const longestValue = rows.reduce((max, row) => {
        const cellValue = row[header] || '';
        const lineLength = cellValue
          .split('\n')
          .reduce((lineMax, line) => Math.max(lineMax, line.length), 0);
        return Math.max(max, lineLength);
      }, header.length);

      return {
        wch: Math.min(hint.max, Math.max(hint.min, longestValue + 3)),
      };
    });

    worksheet['!rows'] = [{ hpt: 28 }];

    if (worksheet['!ref']) {
      worksheet['!autofilter'] = { ref: worksheet['!ref'] };
    }

    // Apply text wrapping and formatting to all cells
    for (const cell in worksheet) {
      if (cell[0] !== '!' && worksheet[cell]) {
        if (!worksheet[cell].s) {
          worksheet[cell].s = {};
        }
        worksheet[cell].s.alignment = {
          wrap: true,
          vertical: 'top',
          horizontal: 'left',
        };
      }
    }
  }

  private static getISTDayBounds(reference = new Date()): { startOfToday: Date; endOfToday: Date } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(reference);

    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value])
    ) as { year?: string; month?: string; day?: string };

    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    const istOffsetMs = 5.5 * 60 * 60 * 1000;

    return {
      startOfToday: new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - istOffsetMs),
      endOfToday: new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - istOffsetMs),
    };
  }

  static getISTDayBoundsPublic(reference = new Date()): { startOfToday: Date; endOfToday: Date } {
    return this.getISTDayBounds(reference);
  }

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
          duplicateCheck = primarySkillCategory
            ? await DuplicateCheckService.checkPhoneCategoryDuplicate(
                normalizedPhone,
                primarySkillCategory,
                secondaryCategoryValue
              )
            : await DuplicateCheckService.checkPhoneDuplicate(normalizedPhone);
          if (duplicateCheck.isDuplicate && duplicateCheck.sameCategory) {
            // Found duplicate, return it
          } else if (normalizedLandline) {
            // Also check landline
            const landlineCheck = primarySkillCategory
              ? await DuplicateCheckService.checkPhoneCategoryDuplicate(
                  normalizedLandline,
                  primarySkillCategory,
                  secondaryCategoryValue
                )
              : await DuplicateCheckService.checkLandlineDuplicate(normalizedLandline);
            if (landlineCheck.isDuplicate && landlineCheck.sameCategory) {
              duplicateCheck = landlineCheck;
            }
          }
        } else if (normalizedLandline) {
          duplicateCheck = primarySkillCategory
            ? await DuplicateCheckService.checkPhoneCategoryDuplicate(
                normalizedLandline,
                primarySkillCategory,
                secondaryCategoryValue
              )
            : await DuplicateCheckService.checkLandlineDuplicate(normalizedLandline);
        } else {
          duplicateCheck = { isDuplicate: false };
        }
      } else {
        // Use comprehensive duplicate check
        duplicateCheck = primarySkillCategory
          ? await DuplicateCheckService.checkDuplicateWithCategory(
              normalizedPhone || normalizedLandline || '',
              primarySkillCategory,
              secondaryCategoryValue,
              data.name,
              data.city || ''
            )
          : await DuplicateCheckService.checkDuplicate(
              normalizedPhone || undefined,
              normalizedLandline || undefined,
              data.name,
              data.city || undefined
            );
      }

      if (duplicateCheck.isDuplicate) {
        if (!primarySkillCategory) {
          throw new Error(
            `This person already exists: ${duplicateCheck.existingLead?.leadId} (${duplicateCheck.matchType})`
          );
        }
        if (duplicateCheck.sameCategory) {
          throw new Error(
            `This person with this category already exists: ${duplicateCheck.existingLead?.leadId} (${duplicateCheck.matchType})`
          );
        }
      }
      // For category-aware flows, same contact + different category is allowed.

      // Decide initial status (restricted set)
      const initialStatus: LeadStatus = data.status && ['lead_added', 'contacted_not_lifted', 'contacted_not_interested', 'contacted_interested'].includes(data.status)
        ? data.status
        : 'lead_added';

      // Categories are optional.

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
        'water-tanker': 'Water & Tanker Services',
        'other': 'Other'
      };
      const primarySkillName = primarySkillCategory
        ? (primarySkillNameMap[primarySkillCategory] || primarySkillCategory)
        : undefined;

      // Create lead with primary skill automatically added to skills array
      const leadId = this.generateLeadId();
      const lead = new Lead({
        leadId,
        name: data.name.trim(),
        phone: normalizedPhone,
        landline: normalizedLandline || undefined,
        email: data.email?.trim().toLowerCase(),
        city: data.city?.trim() || undefined,
        state: data.state?.trim() || undefined,
        address: data.address?.trim() || undefined,
        pincode: data.pincode?.trim() || undefined,
        isGatedCommunity: data.isGatedCommunity || false,
        gatedCommunityName: data.isGatedCommunity && data.gatedCommunityName?.trim()
          ? data.gatedCommunityName.trim()
          : undefined,
        primarySkill: primarySkillCategory || undefined,  // Legacy field
        primaryCategory: primarySkillCategory || undefined,  // New field
        secondarySkill: secondaryCategoryValue || undefined,  // Legacy field
        secondaryCategory: secondaryCategoryValue || undefined,  // New field
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
      await this.logActivity(
        leadId,
        'status_change',
        `Lead created with status: lead_added`,
        data.addedBy,
        data.addedByName
      );

      // Log activity for primary skill assignment only when a skill is provided.
      if (primarySkillCategory && primarySkillName) {
        await this.logActivity(
          leadId,
          'skill_assigned',
          `Primary skill assigned: ${primarySkillName}`,
          data.addedBy,
          data.addedByName,
          { skillName: primarySkillName, category: primarySkillCategory }
        );
      }

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

  private static applyOwnerScope(query: any, ownerBy?: string, ownerByAny?: string[]): void {
    const ownerIds = Array.from(
      new Set(
        (ownerByAny && ownerByAny.length > 0
          ? ownerByAny
          : ownerBy
            ? [ownerBy]
            : []
        ).filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      )
    );

    if (!ownerIds.length) {
      return;
    }

    query.$and = query.$and || [];
    query.$and.push(this.buildOwnerScopeClause(ownerIds));
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

  /**
   * Get all distinct gated community names (for dropdown/autocomplete)
   */
  static async getGatedCommunityNames(): Promise<string[]> {
    try {
      const names = await Lead.distinct('gatedCommunityName', {
        gatedCommunityName: { $exists: true, $nin: [null, ''] },
      });
      return Array.from(
        new Set(
          (names as string[])
            .map((name) => name.trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b));
    } catch (error: any) {
      logger.error('Error getting gated community names', { error: error.message });
      throw error;
    }
  }

  static async searchLeads(filters: SearchFilters): Promise<{    leads: ILead[];
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
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { primaryCategory: filters.primarySkill },
            { primarySkill: filters.primarySkill },
          ],
        });
      }

      if (filters.source) {
        query.source = filters.source;
      }

      if (filters.addedByAny && filters.addedByAny.length > 0) {
        query.addedBy = { $in: filters.addedByAny };
      } else if (filters.addedBy) {
        query.addedBy = filters.addedBy;
      }

      if (filters.pickedByAny && filters.pickedByAny.length > 0) {
        query.pickedBy = { $in: filters.pickedByAny };
      } else if (filters.pickedBy === 'none') {
        query.$or = [
          { pickedBy: { $exists: false } },
          { pickedBy: null },
          { pickedBy: '' },
        ];
      } else if (filters.pickedBy) {
        query.pickedBy = filters.pickedBy;
      }

      if (!filters.pickedBy && !filters.pickedByAny?.length) {
        this.applyOwnerScope(query, filters.ownerBy, filters.ownerByAny);
      }

      if (filters.pickedBy && filters.pickedBy !== 'none' && !filters.pickedByAny?.length) {
        query.pickedBy = filters.pickedBy;
      }

      if (filters.transferPendingTo) {
        query.transferPendingTo = filters.transferPendingTo;
      }

      this.applyOwnerScope(query, filters.ownerBy, filters.ownerByAny);

      if (filters.startDate || filters.endDate) {
        if (filters.status) {
          // When filtering by a specific status, use statusHistory.changedAt so that
          // leads moved into that status today (but created earlier) are still shown.
          const elemMatch: any = { status: filters.status };
          if (filters.startDate) {
            elemMatch.changedAt = elemMatch.changedAt || {};
            elemMatch.changedAt.$gte = filters.startDate;
          }
          if (filters.endDate) {
            elemMatch.changedAt = elemMatch.changedAt || {};
            elemMatch.changedAt.$lte = filters.endDate;
          }
          query.$and = query.$and || [];
          query.$and.push({ statusHistory: { $elemMatch: elemMatch } });
        } else {
          // No specific status filter — fall back to createdAt range
          query.createdAt = {};
          if (filters.startDate) {
            query.createdAt.$gte = filters.startDate;
          }
          if (filters.endDate) {
            query.createdAt.$lte = filters.endDate;
          }
        }
      }

      // Text search (name, phone, city, or leadId)
      if (filters.search) {
        const searchRegex = new RegExp(filters.search, 'i');
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { name: searchRegex },
            { phone: searchRegex },
            { landline: searchRegex },
            { city: searchRegex },
            { leadId: searchRegex },
          ],
        });
      }

      if (filters.statusChangedBy) {
        if (filters.status === 'contacted_interested') {
          query.lastInterestedBy = filters.statusChangedBy;
        } else if (filters.status === 'contacted_not_interested') {
          query.lastNotInterestedBy = filters.statusChangedBy;
        } else if (filters.status === 'contacted_not_lifted') {
          query.lastNotLiftedBy = filters.statusChangedBy;
        }
      }

      if (filters.attempts) {
        if (filters.attempts === 'more_than_4') {
          query.$expr = {
            $gt: [
              { $convert: { input: '$attempts', to: 'int', onError: 0, onNull: 0 } },
              4,
            ],
          };
        } else {
          query.attempts = filters.attempts;
        }
      }

      // Registration/conversion status (main website)
      if (filters.registrationStatus) {
        const registeredPredicate = {
          $or: [
            { 'conversionData.platformUid': { $exists: true, $nin: [null, ''] } },
            { 'activationData.firebaseUid': { $exists: true, $nin: [null, ''] } },
            { accountStatus: { $in: ['invited', 'activated', 'suspended'] } }
          ]
        };
        const aadhaarVerifiedPredicate = {
          $or: [
            { 'conversionData.isAadhaarVerified': true },
            { 'verificationStatus.aadhaar.status': 'verified' }
          ]
        };

        switch (filters.registrationStatus) {
          case 'not_registered':
            query.$and = query.$and || [];
            query.$and.push({
              $nor: [registeredPredicate]
            });
            break;
          case 'registered':
            query.$and = query.$and || [];
            query.$and.push({
              ...registeredPredicate,
              $nor: [aadhaarVerifiedPredicate]
            });
            break;
          case 'registered_verified':
            query.$and = query.$and || [];
            query.$and.push({
              ...registeredPredicate,
              ...aadhaarVerifiedPredicate
            });
            break;
        }
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

  static async getCallbackQueue(filters: CallbackQueueFilters): Promise<{
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

      const query: any = {
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

      if (filters.addedByAny && filters.addedByAny.length > 0) {
        query.addedBy = { $in: filters.addedByAny };
      } else if (filters.addedBy) {
        query.addedBy = filters.addedBy;
      }

      if (filters.startDate || filters.endDate) {
        query.nextCallbackAt = query.nextCallbackAt || {};
        if (filters.startDate) query.nextCallbackAt.$gte = filters.startDate;
        if (filters.endDate) query.nextCallbackAt.$lte = filters.endDate;
      }

      const [leads, total] = await Promise.all([
        Lead.find(query)
          .sort({ nextCallbackAt: 1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Lead.countDocuments(query),
      ]);

      const normalizedLeads = leads.map((lead) => this.normalizeLeadData(lead));

      return {
        leads: normalizedLeads as unknown as ILead[],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error: any) {
      logger.error('Error fetching callback queue', {
        error: error.message,
        filters,
      });
      throw error;
    }
  }

  static async getCallbackQueueStats(
    filters: Pick<CallbackQueueFilters, 'addedBy' | 'addedByAny' | 'ownerBy' | 'ownerByAny'>
  ): Promise<CallbackQueueStats> {
    try {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);

      const baseQuery: any = {
        nextCallbackAt: { $exists: true, $ne: null },
      };

      if (filters.addedByAny && filters.addedByAny.length > 0) {
        baseQuery.addedBy = { $in: filters.addedByAny };
      } else if (filters.addedBy) {
        baseQuery.addedBy = filters.addedBy;
      }

      this.applyOwnerScope(baseQuery, filters.ownerBy, filters.ownerByAny);

      const [totalScheduled, overdue, dueToday] = await Promise.all([
        Lead.countDocuments(baseQuery),
        Lead.countDocuments({
          ...baseQuery,
          nextCallbackAt: { $lt: now },
        }),
        Lead.countDocuments({
          ...baseQuery,
          nextCallbackAt: { $gte: startOfToday, $lte: endOfToday },
        }),
      ]);

      return {
        totalScheduled,
        overdue,
        dueToday,
      };
    } catch (error: any) {
      logger.error('Error fetching callback queue stats', {
        error: error.message,
        filters,
      });
      throw error;
    }
  }

  static async getFollowUpQueue(filters: FollowUpQueueFilters): Promise<{
    leads: FollowUpQueueItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const skip = (page - 1) * limit;
      const now = new Date();
      const { startOfToday, endOfToday } = this.getISTDayBounds(now);

      const query: any = {};
      if (filters.city) {
        query.city = { $regex: new RegExp(filters.city, 'i') };
      }
      if (filters.primarySkill) {
        query.$or = [
          { primarySkill: { $regex: new RegExp(filters.primarySkill, 'i') } },
          { primaryCategory: { $regex: new RegExp(filters.primarySkill, 'i') } },
        ];
      }
      if (filters.addedByAny && filters.addedByAny.length > 0) {
        query.addedBy = { $in: filters.addedByAny };
      } else if (filters.addedBy) {
        query.addedBy = filters.addedBy;
      }

      if (filters.pickedBy) {
        query.pickedBy = filters.pickedBy;
      } else {
        this.applyOwnerScope(query, filters.ownerBy, filters.ownerByAny);
      }

      if (filters.dueType === 'callback') {
        query.nextCallbackAt = { $exists: true, $ne: null };
      } else if (filters.dueType === 'onboarding') {
        query.expectedOnboardingAt = { $exists: true, $ne: null };
      } else {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { nextCallbackAt: { $exists: true, $ne: null } },
            { expectedOnboardingAt: { $exists: true, $ne: null } },
          ],
        });
      }

      const leads = await Lead.find(query).lean();

      let items: FollowUpQueueItem[] = [];
      for (const lead of leads) {
        if ((filters.dueType === 'all' || !filters.dueType || filters.dueType === 'callback') && lead.nextCallbackAt) {
          items.push({
            ...(this.normalizeLeadData(lead) as ILead),
            dueType: 'callback',
            dueAt: new Date(lead.nextCallbackAt),
          });
        }
        if ((filters.dueType === 'all' || !filters.dueType || filters.dueType === 'onboarding') && lead.expectedOnboardingAt) {
          items.push({
            ...(this.normalizeLeadData(lead) as ILead),
            dueType: 'onboarding',
            dueAt: new Date(lead.expectedOnboardingAt),
          });
        }
      }

      const bucket = filters.bucket || 'all';
      items = items.filter((item) => {
        if (bucket === 'today') return item.dueAt >= startOfToday && item.dueAt <= endOfToday;
        if (bucket === 'overdue') return item.dueAt < now;
        if (bucket === 'upcoming') return item.dueAt > endOfToday;
        if (bucket === 'range') {
          if (filters.startDate && item.dueAt < filters.startDate) return false;
          if (filters.endDate && item.dueAt > filters.endDate) return false;
          return true;
        }
        if (filters.startDate && item.dueAt < filters.startDate) return false;
        if (filters.endDate && item.dueAt > filters.endDate) return false;
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
    } catch (error: any) {
      logger.error('Error fetching follow-up queue', {
        error: error.message,
        filters,
      });
      throw error;
    }
  }

  static async getFollowUpQueueStats(
    filters: Pick<FollowUpQueueFilters, 'addedBy' | 'addedByAny' | 'ownerBy' | 'ownerByAny' | 'pickedBy'>
  ): Promise<FollowUpQueueStats> {
    try {
      const now = new Date();
      const { startOfToday, endOfToday } = this.getISTDayBounds(now);

      const scope: any = {};
      if (filters.addedByAny && filters.addedByAny.length > 0) {
        scope.addedBy = { $in: filters.addedByAny };
      } else if (filters.addedBy) {
        scope.addedBy = filters.addedBy;
      }

      if (filters.pickedBy) {
        scope.pickedBy = filters.pickedBy;
      } else {
        this.applyOwnerScope(scope, filters.ownerBy, filters.ownerByAny);
      }

      const [
        callbackDueToday,
        callbackOverdue,
        onboardingDueToday,
        onboardingOverdue,
        callbackTotal,
        onboardingTotal,
      ] = await Promise.all([
        Lead.countDocuments({
          ...scope,
          nextCallbackAt: { $gte: startOfToday, $lte: endOfToday },
        }),
        Lead.countDocuments({
          ...scope,
          nextCallbackAt: { $lt: now },
        }),
        Lead.countDocuments({
          ...scope,
          expectedOnboardingAt: { $gte: startOfToday, $lte: endOfToday },
        }),
        Lead.countDocuments({
          ...scope,
          expectedOnboardingAt: { $lt: now },
        }),
        Lead.countDocuments({
          ...scope,
          nextCallbackAt: { $exists: true, $ne: null },
        }),
        Lead.countDocuments({
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
    } catch (error: any) {
      logger.error('Error fetching follow-up queue stats', {
        error: error.message,
        filters,
      });
      throw error;
    }
  }

  static async getStatusAnalytics(filters: StatusAnalyticsFilters): Promise<{
    leadsAdded: number;
    touchedLeads: number;
    interested: number;
    notInterested: number;
    callbackScheduled: number;
    callbackOverdue: number;
    onboarded: number;
    verified: number;
    statusCounts: Array<{ status: string; count: number }>;
    qualifierBreakdown: Array<{ qualifierId: string; qualifierName: string; touchedLeads: number }>;
    categoryBreakdown: Array<{ category: string; count: number }>;
    onboardedCategoryBreakdown: Array<{ category: string; count: number }>;
    verifiedCategoryBreakdown: Array<{ category: string; count: number }>;
    interestedCategoryBreakdown: Array<{ category: string; count: number }>;
  }> {
    try {
      const leadMatch: any = {};
      const userId = filters.pickedBy || filters.qualifierId;
      const userIds = filters.pickedByAny?.length ? filters.pickedByAny : userId ? [userId] : [];
      if (userIds.length) {
        if (filters.claimsScope === 'current') {
          leadMatch.pickedBy = { $in: userIds };
        } else {
          leadMatch.$or = [
            { pickedBy: { $in: userIds } },
            { addedBy: { $in: userIds } },
            { 'statusHistory.changedBy': { $in: userIds } }
          ];
        }
      }

      if (filters.category) {
        leadMatch.$and = leadMatch.$and || [];
        leadMatch.$and.push(this.buildCategoryMatch(filters.category));
      }

      if (filters.gatedCommunityName) {
        leadMatch.gatedCommunityName = this.buildExactCaseInsensitiveMatch(filters.gatedCommunityName);
      }
      if (filters.city) leadMatch.city = this.buildExactCaseInsensitiveMatch(filters.city);
      if (filters.locality) leadMatch.locality = this.buildExactCaseInsensitiveMatch(filters.locality);
      if (filters.localArea) leadMatch.address = this.buildExactCaseInsensitiveMatch(filters.localArea);

      const basePipeline: any[] = [
        { $match: leadMatch },
        { $unwind: '$statusHistory' },
      ];

      if (!filters.allTime && filters.from && filters.to) {
        basePipeline.push({
          $match: {
            'statusHistory.changedAt': { $gte: filters.from, $lte: filters.to }
          }
        });
      }

      basePipeline.push({ $sort: { 'statusHistory.changedAt': 1 } });

      const latestStatusPipeline: any[] = [
        ...basePipeline,
        {
          $group: {
            _id: '$leadId',
            latestStatus: { $last: '$statusHistory' },
            ownerId: { $last: { $ifNull: ['$pickedBy', '$addedBy'] } },
            ownerName: { $last: { $ifNull: ['$pickedByName', '$addedByName'] } },
          },
        },
      ];

      const now = new Date();
      const registeredPredicate = this.buildRegisteredPredicate();
      const verifiedPredicate = this.buildVerifiedPredicate();
      const onboardedScopeMatch =
        Object.keys(leadMatch).length > 0
          ? { $and: [leadMatch, registeredPredicate] }
          : registeredPredicate;
      const onboardedPromise =
        filters.allTime || !filters.from || !filters.to
          ? Lead.countDocuments(onboardedScopeMatch)
          : Lead.aggregate([
              { $match: leadMatch },
              { $match: registeredPredicate },
              { $unwind: '$statusHistory' },
              {
                $match: {
                  'statusHistory.changedAt': { $gte: filters.from, $lte: filters.to },
                },
              },
              {
                $group: {
                  _id: '$leadId',
                },
              },
              { $count: 'count' },
            ]);

      const verifiedScopeMatch =
        Object.keys(leadMatch).length > 0
          ? { $and: [leadMatch, verifiedPredicate] }
          : verifiedPredicate;
      const verifiedPromise =
        filters.allTime || !filters.from || !filters.to
          ? Lead.countDocuments(verifiedScopeMatch)
          : Lead.aggregate([
              { $match: leadMatch },
              { $match: verifiedPredicate },
              { $unwind: '$statusHistory' },
              { $match: { 'statusHistory.changedAt': { $gte: filters.from, $lte: filters.to } } },
              { $group: { _id: '$leadId' } },
              { $count: 'count' },
            ]);

      const categoryBreakdownPromise = (predicate?: Record<string, unknown>) =>
        Lead.aggregate([
          { $match: predicate ? { $and: [leadMatch, predicate] } : leadMatch },
          {
            $group: {
              _id: { $ifNull: ['$primaryCategory', { $ifNull: ['$primarySkill', 'other'] }] },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ]);

      const [statusCountsRaw, touchedRaw, qualifierRaw, callbackScheduledRaw, callbackOverdueRaw, onboardedRaw, verifiedRaw, onboardedCategoryRaw, verifiedCategoryRaw, interestedCategoryRaw] = await Promise.all([
        Lead.aggregate([
          ...latestStatusPipeline,
          {
            $group: {
              _id: '$latestStatus.status',
              count: { $sum: 1 },
            },
          },
        ]),
        Lead.aggregate([
          ...latestStatusPipeline,
          { $count: 'count' },
        ]),
        Lead.aggregate([
          ...latestStatusPipeline,
          {
            $group: {
              _id: '$ownerId',
              qualifierName: { $last: '$ownerName' },
              leadIds: { $addToSet: '$_id' },
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
        Lead.aggregate([
          ...latestStatusPipeline,
          {
            $match: {
              'latestStatus.status': 'contacted_interested',
              'latestStatus.callbackAt': { $exists: true, $ne: null, $gte: now },
            },
          },
          { $count: 'count' },
        ]),
        Lead.aggregate([
          ...latestStatusPipeline,
          {
            $match: {
              'latestStatus.status': 'contacted_interested',
              'latestStatus.callbackAt': { $exists: true, $ne: null, $lt: now },
            },
          },
          { $count: 'count' },
        ]),
        onboardedPromise,
        verifiedPromise,
        categoryBreakdownPromise(registeredPredicate),
        categoryBreakdownPromise(verifiedPredicate),
        categoryBreakdownPromise({ status: 'contacted_interested' }),
      ]);

      const statusCounts = statusCountsRaw.map((row: any) => ({
        status: row._id,
        count: row.count,
      }));
      const statusCountMap = new Map(statusCounts.map((row) => [row.status, row.count]));

      const callbackOverdue = callbackOverdueRaw[0]?.count || 0;
      const onboarded =
        typeof onboardedRaw === 'number'
          ? onboardedRaw
          : onboardedRaw[0]?.count || 0;
      const verified =
        typeof verifiedRaw === 'number'
          ? verifiedRaw
          : verifiedRaw[0]?.count || 0;

      const leadsAddedMatch: any = {};
      if (userId) {
        leadsAddedMatch.addedBy = userId;
      }

      if (!filters.allTime && filters.from && filters.to) {
        leadsAddedMatch.createdAt = { $gte: filters.from, $lte: filters.to };
      }

      if (filters.category) {
        leadsAddedMatch.$and = leadsAddedMatch.$and || [];
        leadsAddedMatch.$and.push(this.buildCategoryMatch(filters.category));
      }

      if (filters.gatedCommunityName) {
        leadsAddedMatch.gatedCommunityName = this.buildExactCaseInsensitiveMatch(filters.gatedCommunityName);
      }

      const categoryBreakdownRaw = await Lead.aggregate([
        { $match: leadsAddedMatch },
        {
          $group: {
            _id: { $ifNull: ['$primaryCategory', { $ifNull: ['$primarySkill', 'other'] }] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]);

      const categoryBreakdown = categoryBreakdownRaw.map((row: any) => ({
        category: row._id,
        count: row.count,
      }));

      const mapCategoryBreakdown = (rows: any[]) => rows.map((row) => ({
        category: row._id,
        count: row.count,
      }));

      const leadsAdded = await Lead.countDocuments(leadsAddedMatch);

      return {
        leadsAdded,
        touchedLeads: touchedRaw[0]?.count || 0,
        interested: statusCountMap.get('contacted_interested') || 0,
        notInterested: statusCountMap.get('contacted_not_interested') || 0,
        callbackScheduled: callbackScheduledRaw[0]?.count || 0,
        callbackOverdue,
        onboarded,
        verified,
        statusCounts,
        qualifierBreakdown: qualifierRaw.map((row: any) => ({
          qualifierId: row.qualifierId,
          qualifierName: row.qualifierName,
          touchedLeads: row.touchedLeads,
        })),
        categoryBreakdown,
        onboardedCategoryBreakdown: mapCategoryBreakdown(onboardedCategoryRaw),
        verifiedCategoryBreakdown: mapCategoryBreakdown(verifiedCategoryRaw),
        interestedCategoryBreakdown: mapCategoryBreakdown(interestedCategoryRaw),
      };
    } catch (error: any) {
      logger.error('Error fetching status analytics', {
        error: error.message,
        filters,
      });
      throw error;
    }
  }

  static async exportStatusReport(filters: StatusReportExportFilters): Promise<{
    filename: string;
    mimeType: string;
    buffer: Buffer;
    rowCount: number;
  }> {
    try {
      if (filters.exportLayout === 'qualifier' && filters.qualifierId) {
        return this.exportQualifierStatusReport(filters);
      }

      const leadMatch: any = {};
      const userId = filters.pickedBy || filters.qualifierId;
      const userIds = filters.pickedByAny?.length ? filters.pickedByAny : userId ? [userId] : [];
      if (userIds.length) {
        if (filters.claimsScope === 'current') {
          leadMatch.pickedBy = { $in: userIds };
        } else {
          leadMatch.$or = [
            { pickedBy: { $in: userIds } },
            { addedBy: { $in: userIds } },
            { 'statusHistory.changedBy': { $in: userIds } }
          ];
        }
      }

      if (filters.category) {
        leadMatch.$and = leadMatch.$and || [];
        leadMatch.$and.push(this.buildCategoryMatch(filters.category));
      }

      if (filters.gatedCommunityName) {
        leadMatch.gatedCommunityName = this.buildExactCaseInsensitiveMatch(filters.gatedCommunityName);
      }

      const now = new Date();

      const rows = await Lead.aggregate([
        { $match: leadMatch },
        { $unwind: '$statusHistory' },
        ...(filters.allTime || !filters.from || !filters.to
          ? []
          : [{ $match: { 'statusHistory.changedAt': { $gte: filters.from, $lte: filters.to } } }]),
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
            isGatedCommunity: { $first: '$isGatedCommunity' },
            gatedCommunityName: { $first: '$gatedCommunityName' },
            createdAt: { $first: '$createdAt' },
            updatedAt: { $first: '$updatedAt' },
            currentStatus: { $first: '$status' },
            nextCallbackAt: { $first: '$nextCallbackAt' },
            qualifierName: { $first: { $ifNull: ['$pickedByName', '$addedByName'] } },
            qualifierId: { $first: { $ifNull: ['$pickedBy', '$addedBy'] } },
            isDuplicate: { $first: '$isDuplicate' },
            blacklisted: { $first: '$blacklisted' },
            platformUid: { $first: '$conversionData.platformUid' },
            activationUid: { $first: '$activationData.firebaseUid' },
            accountStatus: { $first: '$accountStatus' },
            isAadhaarVerified: { $first: '$conversionData.isAadhaarVerified' },
            aadhaarStatus: { $first: '$verificationStatus.aadhaar.status' },
            latestHistory: { $first: '$statusHistory' },
          },
        },
        ...(filters.reportCategory === 'interested'
          ? [{ $match: { 'latestHistory.status': 'contacted_interested' } }]
          : []),
        ...(filters.reportCategory === 'callback_scheduled'
          ? [{
              $match: {
                'latestHistory.status': 'contacted_interested',
                'latestHistory.callbackAt': { $exists: true, $ne: null, $gte: now },
              },
            }]
          : []),
        ...(filters.reportCategory === 'callback_overdue'
          ? [{
              $match: {
                'latestHistory.status': 'contacted_interested',
                'latestHistory.callbackAt': { $exists: true, $ne: null, $lt: now },
              },
            }]
          : []),
        ...(filters.reportCategory === 'onboarded'
          ? [{
              $match: {
                $or: [
                  { platformUid: { $exists: true, $nin: [null, ''] } },
                  { activationUid: { $exists: true, $nin: [null, ''] } },
                  { accountStatus: { $in: ['invited', 'activated', 'suspended'] } },
                ],
                $nor: [
                  { isAadhaarVerified: true },
                  { aadhaarStatus: 'verified' },
                ],
              },
            }]
          : []),
        ...(filters.reportCategory === 'verified'
          ? [{
              $match: {
                $or: [
                  { isAadhaarVerified: true },
                  { aadhaarStatus: 'verified' },
                ],
              },
            }]
          : []),
        { $sort: { updatedAt: -1 } },
      ]);

      const reportRows = rows.map((row: any) => {
        const base: Record<string, string> = {
          Date: this.formatIST(row.latestHistory?.changedAt),
          'Qualifier Name': this.textForSpreadsheet(row.qualifierName || 'Unknown'),
          'Lead ID': this.textForSpreadsheet(row.leadId),
          'Lead Name': this.textForSpreadsheet(row.name),
          'Phone/Landline': this.textForSpreadsheet(row.phone || row.landline || ''),
          City: this.textForSpreadsheet(row.city),
          'Current Status': this.labelForReport(row.latestHistory?.status || row.currentStatus),
          'Status Reason': this.textForSpreadsheet(
            row.latestHistory?.statusReasonText || this.labelForReport(row.latestHistory?.statusReasonCode)
          ),
          'Callback Date': this.formatIST(row.latestHistory?.callbackAt),
          'Expected Onboarding Date': this.formatIST(row.latestHistory?.expectedOnboardingAt),
          'Last Updated At': this.formatIST(row.updatedAt),
          'Last Updated By': this.textForSpreadsheet(row.latestHistory?.changedByName || row.latestHistory?.changedBy || ''),
        };

        if (filters.template === 'detailed') {
          base.State = this.textForSpreadsheet(row.state);
          base['Primary Category'] = this.textForSpreadsheet(row.primaryCategory);
          base['Secondary Category'] = this.textForSpreadsheet(row.secondaryCategory);
          base.Source = this.textForSpreadsheet(row.source);
          base['Source Details'] = this.textForSpreadsheet(row.sourceDetails);
          base['Gated Community'] = row.isGatedCommunity ? 'Yes' : 'No';
          base['Gated Community Name'] = this.textForSpreadsheet(row.gatedCommunityName);
          base['Created At'] = this.formatIST(row.createdAt);
          base['Updated At'] = this.formatIST(row.updatedAt);
          if (filters.includeNotes) {
            base.Notes = this.textForSpreadsheet(row.latestHistory?.notes);
          }
          base['Is Duplicate'] = row.isDuplicate ? 'Yes' : 'No';
          base.Blacklisted = row.blacklisted ? 'Yes' : 'No';
        }
        return base;
      });

      const worksheet = XLSX.utils.json_to_sheet(reportRows);
      this.applyWorksheetLayout(worksheet, reportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Status Report');

      const dateStamp = new Date().toISOString().slice(0, 10);
      const categorySlug = filters.reportCategory.replace(/_/g, '-');
      const filename = `lead-status-report-${filters.template}-${categorySlug}-${dateStamp}.${filters.format}`;
      const mimeType =
        filters.format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv';

      const buffer =
        filters.format === 'xlsx'
          ? XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
          : Buffer.from(XLSX.utils.sheet_to_csv(worksheet), 'utf-8');

      return {
        filename,
        mimeType,
        buffer,
        rowCount: reportRows.length,
      };
    } catch (error: any) {
      logger.error('Error exporting status report', {
        error: error.message,
        filters,
      });
      throw error;
    }
  }

  private static async exportQualifierStatusReport(
    filters: StatusReportExportFilters
  ): Promise<{ filename: string; mimeType: string; buffer: Buffer; rowCount: number }> {
    const conditions: any[] = [];
    const userId = filters.qualifierId;

    if (filters.claimsScope === 'total') {
      if (userId) {
        conditions.push({
          $or: [
            { pickedBy: userId },
            { addedBy: userId },
            { 'statusHistory.changedBy': userId },
            { 'internalNotes.addedBy': userId },
            { lastTransferredBy: userId }
          ]
        });
      }
    } else {
      if (userId) {
        conditions.push({ addedBy: userId });
      }
    }

    if (!filters.allTime && filters.from && filters.to) {
      conditions.push({ createdAt: { $gte: filters.from, $lte: filters.to } });
    }

    if (filters.category) {
      conditions.push(this.buildCategoryMatch(filters.category));
    }

    if (filters.gatedCommunityName) {
      conditions.push({ gatedCommunityName: this.buildExactCaseInsensitiveMatch(filters.gatedCommunityName) });
    }

    const leadMatch = conditions.length > 0 ? { $and: conditions } : {};

    const leads = await Lead.find(leadMatch)
      .sort({ createdAt: -1 })
      .lean();

    const reportRows = leads.map((lead) => {
      const row: Record<string, string> = {
        Name: this.textForSpreadsheet(lead.name),
        Phone: this.textForSpreadsheet(lead.phone || lead.landline || ''),
        Category: this.categoryLabelForExport(lead.primaryCategory || lead.primarySkill),
        'Sub Category': this.textForSpreadsheet(lead.secondaryCategory || lead.secondarySkill),
        City: this.textForSpreadsheet(lead.city),
        'Added Date': this.formatIST(lead.createdAt),
        'Picked By': this.textForSpreadsheet(lead.pickedByName || ''),
        'Contact Status': this.contactStatusForExport(lead),
        'Registration Status': this.registrationStatusForExport(lead),
      };

      if (lead.email) row.Email = this.textForSpreadsheet(lead.email);
      if (lead.state) row.State = this.textForSpreadsheet(lead.state);
      if (lead.address) row['Local Area'] = this.textForSpreadsheet(lead.address);
      if (lead.pincode) row.Pincode = this.textForSpreadsheet(lead.pincode);
      if (lead.isGatedCommunity) {
        row['Gated Community'] = 'Yes';
        row['Gated Community Name'] = this.textForSpreadsheet(lead.gatedCommunityName);
      }

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(reportRows);
    this.applyWorksheetLayout(worksheet, reportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads Report');

    const dateStamp = new Date().toISOString().slice(0, 10);
    const categorySlug = filters.category ? `-${filters.category}` : '';
    const filename = `leads-report${categorySlug}-${dateStamp}.${filters.format}`;
    const mimeType =
      filters.format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv';

    const buffer =
      filters.format === 'xlsx'
        ? XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
        : Buffer.from(XLSX.utils.sheet_to_csv(worksheet), 'utf-8');

    return {
      filename,
      mimeType,
      buffer,
      rowCount: reportRows.length,
    };
  }

  /**
   * Update lead
   */
  static async updateLead(leadId: string, data: UpdateLeadData & { skills?: ILeadSkill[] }): Promise<ILead | null> {
    try {
      const setData: any = {};
      const unsetData: Record<string, 1> = {};

      const has = (key: keyof UpdateLeadData): boolean =>
        Object.prototype.hasOwnProperty.call(data, key);

      if (has('name') && typeof data.name === 'string' && data.name.trim()) {
        setData.name = data.name.trim();
      }

      if (has('phone')) {
        const rawPhone = typeof data.phone === 'string' ? data.phone.trim() : '';
        if (rawPhone) {
          setData.phone = DuplicateCheckService.normalizePhone(rawPhone);
        } else {
          unsetData.phone = 1;
        }
      }

      if (has('landline')) {
        const rawLandline = typeof data.landline === 'string' ? data.landline.trim() : '';
        if (rawLandline) {
          setData.landline = DuplicateCheckService.normalizeLandline(rawLandline);
        } else {
          unsetData.landline = 1;
        }
      }

      // Ensure at least one contact number remains after update.
      const existingLead = await Lead.findOne({ leadId }).lean();
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
        if (email) setData.email = email;
        else unsetData.email = 1;
      }
      if (has('city')) {
        const city = typeof data.city === 'string' ? data.city.trim() : '';
        if (city) setData.city = city;
        else unsetData.city = 1;
      }
      if (has('state')) {
        const state = typeof data.state === 'string' ? data.state.trim() : '';
        if (state) setData.state = state;
        else unsetData.state = 1;
      }
      if (has('address')) {
        const address = typeof data.address === 'string' ? data.address.trim() : '';
        if (address) setData.address = address;
        else unsetData.address = 1;
      }
      if (has('pincode')) {
        const pincode = typeof data.pincode === 'string' ? data.pincode.trim() : '';
        if (pincode) setData.pincode = pincode;
        else unsetData.pincode = 1;
      }
      if (has('isGatedCommunity')) {
        setData.isGatedCommunity = !!data.isGatedCommunity;
        // If turning off gated community, clear the name too
        if (!data.isGatedCommunity) {
          unsetData.gatedCommunityName = 1;
        }
      }
      if (has('gatedCommunityName')) {
        const gcName = typeof data.gatedCommunityName === 'string' ? data.gatedCommunityName.trim() : '';
        if (gcName) setData.gatedCommunityName = gcName;
        else unsetData.gatedCommunityName = 1;
      }
      if (has('primarySkill')) {
        const primarySkill = typeof data.primarySkill === 'string' ? data.primarySkill.trim() : '';
        if (primarySkill) {
          setData.primarySkill = primarySkill;
          setData.primaryCategory = primarySkill;
        } else {
          unsetData.primarySkill = 1;
          unsetData.primaryCategory = 1;
        }
      }
      if (has('secondarySkill')) {
        const secondarySkill = typeof data.secondarySkill === 'string' ? data.secondarySkill.trim() : '';
        if (secondarySkill) {
          setData.secondarySkill = secondarySkill;
          setData.secondaryCategory = secondarySkill;
        } else {
          unsetData.secondarySkill = 1;
          unsetData.secondaryCategory = 1;
        }
      }
      if (has('source')) {
        if (data.source) setData.source = data.source;
        else unsetData.source = 1;
      }
      if (has('sourceDetails')) {
        const sourceDetails = typeof data.sourceDetails === 'string' ? data.sourceDetails.trim() : '';
        if (sourceDetails) setData.sourceDetails = sourceDetails;
        else unsetData.sourceDetails = 1;
      }
      if (has('skills') && data.skills) setData.skills = data.skills;

      const updateQuery: any = {};
      if (Object.keys(setData).length > 0) updateQuery.$set = setData;
      if (Object.keys(unsetData).length > 0) updateQuery.$unset = unsetData;

      const lead = await Lead.findOneAndUpdate(
        { leadId },
        updateQuery,
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

      const normalizedStatusUpdate = validateAndNormalizeLeadStatusUpdate(data);

      // Update status
      const isContactStatus = ['contacted_not_lifted', 'contacted_not_interested', 'contacted_interested'].includes(finalStatus);
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
      if (finalStatus === 'contacted_interested') {
        lead.lastInterestedBy = data.changedBy;
      } else if (finalStatus === 'contacted_not_interested') {
        lead.lastNotInterestedBy = data.changedBy;
      } else if (finalStatus === 'contacted_not_lifted') {
        lead.lastNotLiftedBy = data.changedBy;
        const previousAttempts = Number(lead.attempts);
        lead.attempts = String(
          Number.isFinite(previousAttempts) && previousAttempts >= 0
            ? previousAttempts + 1
            : lead.attempts === 'max_reached'
              ? 5
              : 1
        );
      }

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
      await this.logActivity(
        leadId,
        'status_change',
        `Status changed from ${currentStatus} to ${finalStatus}${finalStatus !== newStatus ? ` (requested: ${newStatus})` : ''}`,
        data.changedBy,
        data.changedByName,
        {
          oldStatus: currentStatus,
          newStatus: finalStatus,
          requestedStatus: newStatus,
          statusReasonCode: statusReasonCode || undefined,
          statusReasonText: statusReasonText || undefined,
          callbackAt: callbackAt || undefined,
          expectedOnboardingAt: expectedOnboardingAt || undefined
        }
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

  static async getPerformanceOverview(): Promise<any> {
    const users = await AdminUser.find({ role: { $in: ['qualifier', 'onboarder'] } }).lean();
    const now = new Date();

    const userLocations: Record<string, string> = {
      "Rahul Mehta": "Mumbai",
      "Priya Sharma": "Pune",
      "Anjali Nair": "Chennai",
      "Arjun Das": "Hyderabad",
      "Vikram Iyer": "Bangalore",
    };

    const registeredOnlyQuery = this.buildRegisteredOnlyPredicate();

    const performanceList = await Promise.all(
      users.map(async (user) => {
        const userId = user.userId;
        const identityIds = this.getAdminIdentityIds(user);
        const name = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
        const location = userLocations[name] || user.team || user.department || 'Headquarters';

        // Claims Count (Only leads added by them)
        const claims = await Lead.countDocuments(this.buildIdSelector('addedBy', identityIds));

        if (user.role === 'qualifier') {
          const qualifierScope: any = {};
          this.applyOwnerScope(qualifierScope, undefined, identityIds);

          const [callbackOverdue, onboardingOverdue] = await Promise.all([
            Lead.countDocuments({
              ...qualifierScope,
              nextCallbackAt: { $lt: now },
            }),
            Lead.countDocuments({
              ...qualifierScope,
              expectedOnboardingAt: { $lt: now },
            }),
          ]);

          const overdue = callbackOverdue + onboardingOverdue;

          return {
            userId,
            name,
            role: 'qualifier',
            location,
            claims,
            totalLeads: claims,
            overdue,
          };
        } else {
          // Onboarder: Current Claims
          const currentClaims = await Lead.countDocuments(this.buildIdSelector('pickedBy', identityIds));

          const onboarderMatch = {
            ...this.buildOwnerScopeClause(identityIds),
          };

          const followUpScope = this.buildIdSelector('pickedBy', identityIds);

          const [callbackTotal, onboardingTotal, callbackOverdue, onboardingOverdue] = await Promise.all([
            Lead.countDocuments({
              ...followUpScope,
              nextCallbackAt: { $exists: true, $ne: null },
            }),
            Lead.countDocuments({
              ...followUpScope,
              expectedOnboardingAt: { $exists: true, $ne: null },
            }),
            Lead.countDocuments({
              ...followUpScope,
              nextCallbackAt: { $lt: now },
            }),
            Lead.countDocuments({
              ...followUpScope,
              expectedOnboardingAt: { $lt: now },
            }),
          ]);

          const followUps = callbackTotal + onboardingTotal;

          // Onboarder: Registered (but not verified, touched leads)
          const registered = await Lead.countDocuments({
            $and: [
              onboarderMatch,
              registeredOnlyQuery,
            ]
          });

          // Onboarder: Overdue follow-ups (align with follow-up queue stats)
          const overdue = callbackOverdue + onboardingOverdue;

          return {
            userId,
            name,
            role: 'onboarder',
            location,
            claims,
            totalLeads: claims,
            currentClaims,
            followUps,
            registered,
            overdue,
          };
        }
      })
    );

    // Calculate Top KPI Cards
    const totalTeam = users.length;
    const qualifiersCount = users.filter((u) => u.role === 'qualifier').length;
    const onboardersCount = users.filter((u) => u.role === 'onboarder').length;

    const totalLeadsCount = await Lead.countDocuments({});
    const totalRegisteredCount = await Lead.countDocuments(registeredOnlyQuery);
    const totalOverdueCount = performanceList.reduce((sum, user) => sum + (user.overdue || 0), 0);

    return {
      kpis: {
        totalTeam,
        qualifiersCount,
        onboardersCount,
        totalClaims: totalLeadsCount,
        totalLeads: totalLeadsCount,
        totalOverdue: totalOverdueCount,
        totalRegistered: totalRegisteredCount,
      },
      users: performanceList,
    };
  }

  static async getPerformanceDetails(
    userId: string,
    filters: { from?: Date; to?: Date; allTime?: boolean }
  ): Promise<any> {
    const user = await AdminUser.findOne({
      $or: [{ userId }, { uid: userId }],
    }).lean();
    if (!user) {
      throw new Error('User not found');
    }

    const identityIds = this.getAdminIdentityIds(user);
    const name = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
    const userLocations: Record<string, string> = {
      "Rahul Mehta": "Mumbai",
      "Priya Sharma": "Pune",
      "Anjali Nair": "Chennai",
      "Arjun Das": "Hyderabad",
      "Vikram Iyer": "Bangalore",
    };
    const location = userLocations[name] || user.team || user.department || 'Headquarters';

    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { startOfToday: todayStartIST, endOfToday: todayEndIST } = LeadService.getISTDayBoundsPublic();

    const baseMatch: any = this.buildOwnerScopeClause(identityIds);
    // NOTE: Do NOT add createdAt to baseMatch here. Status-based outcome queries
    // (interested, notInterested, etc.) must filter by statusHistory.changedAt, not createdAt.
    // Each query applies its own date filter via statusDateFilter().

    const registeredQuery = {
      $or: [
        { 'conversionData.platformUid': { $exists: true, $nin: [null, ''] } },
        { 'activationData.firebaseUid': { $exists: true, $nin: [null, ''] } },
        { accountStatus: { $in: ['invited', 'activated', 'suspended'] } }
      ]
    };

    const isVerifiedQuery = {
      $or: [
        { 'conversionData.isAadhaarVerified': true },
        { 'verificationStatus.aadhaar.status': 'verified' }
      ]
    };

    const claims = await Lead.countDocuments(this.buildIdSelector('addedBy', identityIds));
    const currentClaims = await Lead.countDocuments(this.buildIdSelector('pickedBy', identityIds));

    // Get ranking on team by claims (currentClaims for onboarder, claims for qualifier)
    const allUsers = await AdminUser.find({ role: user.role }).lean();
    const allUsersClaims = await Promise.all(
      allUsers.map(async (u) => {
        const scopedIds = this.getAdminIdentityIds(u);
        const uClaims = await Lead.countDocuments(
          user.role === 'onboarder'
            ? this.buildIdSelector('pickedBy', scopedIds)
            : this.buildIdSelector('addedBy', scopedIds)
        );
        return { userId: u.userId, claims: uClaims };
      })
    );
    allUsersClaims.sort((a, b) => b.claims - a.claims);
    const rankIndex = allUsersClaims.findIndex((u) => u.userId === userId);
    
    const getRankSuffix = (rank: number) => {
      const j = rank % 10;
      const k = rank % 100;
      if (j === 1 && k !== 11) return "st";
      if (j === 2 && k !== 12) return "nd";
      if (j === 3 && k !== 13) return "rd";
      return "th";
    };
    
    const rankLabel = rankIndex !== -1 ? `#${rankIndex + 1}${getRankSuffix(rankIndex + 1)} on team` : 'N/A';

    if (user.role === 'qualifier') {
      const qualifierOwnerMatch = this.buildOwnerScopeClause(identityIds);

      // For status-based outcome counts, filter by when that status was entered
      // (statusHistory.changedAt), not when the lead was created.
      const statusDateFilter = (status: string) => {
        if (!filters.allTime && filters.from && filters.to) {
          return {
            statusHistory: {
              $elemMatch: {
                status,
                changedAt: { $gte: filters.from, $lte: filters.to },
              },
            },
          };
        }
        return {};
      };

      const dueDateRange = !filters.allTime && filters.from && filters.to
        ? { $gte: filters.from, $lte: filters.to }
        : undefined;

      const [callbackTotal, onboardingTotal, callbackOverdue, onboardingOverdue, callbackDueToday, onboardingDueToday] = await Promise.all([
        Lead.countDocuments({
          ...qualifierOwnerMatch,
          nextCallbackAt: { $exists: true, $ne: null, ...(dueDateRange ?? {}) },
        }),
        Lead.countDocuments({
          ...qualifierOwnerMatch,
          expectedOnboardingAt: { $exists: true, $ne: null, ...(dueDateRange ?? {}) },
        }),
        Lead.countDocuments({
          ...qualifierOwnerMatch,
          nextCallbackAt: { $lt: now, ...(dueDateRange ?? {}) },
        }),
        Lead.countDocuments({
          ...qualifierOwnerMatch,
          expectedOnboardingAt: { $lt: now, ...(dueDateRange ?? {}) },
        }),
        Lead.countDocuments({
          ...qualifierOwnerMatch,
          nextCallbackAt: { $gte: todayStartIST, $lte: todayEndIST },
        }),
        Lead.countDocuments({
          ...qualifierOwnerMatch,
          expectedOnboardingAt: { $gte: todayStartIST, $lte: todayEndIST },
        }),
      ]);

      const totalFollowUps = callbackTotal + onboardingTotal;
      const overdue = callbackOverdue + onboardingOverdue;
      const dueToday = callbackDueToday + onboardingDueToday;

      const interested = await Lead.countDocuments({
        ...qualifierOwnerMatch,
        status: 'contacted_interested',
        ...statusDateFilter('contacted_interested'),
      });

      const notInterested = await Lead.countDocuments({
        ...qualifierOwnerMatch,
        status: 'contacted_not_interested',
        ...statusDateFilter('contacted_not_interested'),
      });

      const notLifted = await Lead.countDocuments({
        ...qualifierOwnerMatch,
        status: 'contacted_not_lifted',
        ...statusDateFilter('contacted_not_lifted'),
      });

      return {
        user: {
          userId,
          name,
          role: 'qualifier',
          location,
        },
        claims,
        totalLeads: claims,
        rankLabel,
        followUps: {
          total: totalFollowUps,
          overdue,
          dueToday,
        },
        outcomes: {
          interested,
          notInterested,
          notLifted,
        }
      };
    } else {
      const dateQuery: any = {};
      if (!filters.allTime && filters.from && filters.to) {
        dateQuery.createdAt = { $gte: filters.from, $lte: filters.to };
      }

      const dueDateRange = !filters.allTime && filters.from && filters.to
        ? { $gte: filters.from, $lte: filters.to }
        : undefined;

      const followUpScope = this.buildIdSelector('pickedBy', identityIds);

      const [callbackTotal, onboardingTotal, callbackOverdue, onboardingOverdue, callbackDueToday, onboardingDueToday] = await Promise.all([
        Lead.countDocuments({
          ...followUpScope,
          nextCallbackAt: {
            $exists: true,
            $ne: null,
            ...(dueDateRange ? { $gte: dueDateRange.$gte, $lte: dueDateRange.$lte } : {}),
          },
        }),
        Lead.countDocuments({
          ...followUpScope,
          expectedOnboardingAt: {
            $exists: true,
            $ne: null,
            ...(dueDateRange ? { $gte: dueDateRange.$gte, $lte: dueDateRange.$lte } : {}),
          },
        }),
        Lead.countDocuments({
          ...followUpScope,
          nextCallbackAt: {
            $lt: now,
            ...(dueDateRange ? { $gte: dueDateRange.$gte, $lte: dueDateRange.$lte } : {}),
          },
        }),
        Lead.countDocuments({
          ...followUpScope,
          expectedOnboardingAt: {
            $lt: now,
            ...(dueDateRange ? { $gte: dueDateRange.$gte, $lte: dueDateRange.$lte } : {}),
          },
        }),
        Lead.countDocuments({
          ...followUpScope,
          nextCallbackAt: {
            $gte: todayStartIST,
            $lte: todayEndIST,
            ...(dueDateRange ? { $gte: dueDateRange.$gte, $lte: dueDateRange.$lte } : {}),
          },
        }),
        Lead.countDocuments({
          ...followUpScope,
          expectedOnboardingAt: {
            $gte: todayStartIST,
            $lte: todayEndIST,
            ...(dueDateRange ? { $gte: dueDateRange.$gte, $lte: dueDateRange.$lte } : {}),
          },
        }),
      ]);

      const totalFollowUps = callbackTotal + onboardingTotal;
      const overdue = callbackOverdue + onboardingOverdue;
      const dueToday = callbackDueToday + onboardingDueToday;

      // For status-based outcome counts, filter by when the status was entered,
      // not when the lead was created.
      const statusDateFilter = (status: string) => {
        if (!filters.allTime && filters.from && filters.to) {
          return {
            statusHistory: {
              $elemMatch: {
                status,
                changedAt: { $gte: filters.from, $lte: filters.to },
              },
            },
          };
        }
        return {};
      };

      const interested = await Lead.countDocuments({
        ...baseMatch,
        status: 'contacted_interested',
        ...statusDateFilter('contacted_interested'),
      });

      const notInterested = await Lead.countDocuments({
        ...baseMatch,
        status: 'contacted_not_interested',
        ...statusDateFilter('contacted_not_interested'),
      });

      const registered = await Lead.countDocuments({
        $and: [
          baseMatch,
          registeredQuery
        ],
        ...dateQuery,
        $nor: [
          { 'conversionData.isAadhaarVerified': true },
          { 'verificationStatus.aadhaar.status': 'verified' }
        ]
      });

      const notRegistered = await Lead.countDocuments({
        ...baseMatch,
        ...this.buildIdSelector('statusHistory.changedBy', identityIds),
        ...dateQuery,
        status: { $ne: 'inactive' },
        $nor: [
          { 'conversionData.platformUid': { $exists: true, $nin: [null, ''] } },
          { 'activationData.firebaseUid': { $exists: true, $nin: [null, ''] } },
          { accountStatus: { $in: ['invited', 'activated', 'suspended'] } }
        ]
      });

      const verified = await Lead.countDocuments({
        $and: [
          baseMatch,
          registeredQuery,
          isVerifiedQuery
        ],
        ...dateQuery
      });

      const totalRegistered = registered + verified;

      return {
        user: {
          userId,
          name,
          role: 'onboarder',
          location,
        },
        claims,
        totalLeads: claims,
        currentClaims,
        rankLabel,
        followUps: {
          total: totalFollowUps,
          overdue,
          dueToday,
        },
        outcomes: {
          interested,
          notInterested,
          notRegistered,
          registered,
          verified,
          totalRegistered,
        }
      };
    }
  }
}

