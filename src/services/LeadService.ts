import Lead, { ILead, LeadStatus, LeadSource, ILeadDocument } from '../models/Lead';
import AdminUser from '../models/AdminUser';
import LeadActivity from '../models/LeadActivity';
import { DuplicateCheckService } from './DuplicateCheckService';
import { ApprovalService } from './ApprovalService';
import { canUpdateStatus, UserRole } from '../lib/permissions';
import logger from '../config/logger';
import {
  buildFollowUpStatsCacheKey,
  getCachedFollowUpStats,
  setCachedFollowUpStats,
} from '../utils/followUpStatsCache';
import { v4 as uuidv4 } from 'uuid';
import { validateAndNormalizeLeadStatusUpdate } from '../validators/leadStatusValidator';
import XLSX from 'xlsx';

export interface CreateLeadData {
  name: string;
  phone?: string;
  landline?: string;
  email?: string;
  city?: string;
  locality?: string;
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
  locality?: string | null;
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
  /** Actor who performed the update — set by controller, not from request body */
  _updatedBy?: string;
  _updatedByName?: string;
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

export interface DashboardSummary {
  total: number;
  myLeadsAdded?: number;
  approved: number;
  interested: number;
  notInterested: number;
  notRegistered?: number;
  registered?: number;
  registeredVerified?: number;
}

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
  /** Locality filter — stored on lead.locality */
  locality?: string;
  /** Exact local area filter — stored on lead.address */
  localArea?: string;
  /** Filter by conversion/registration on main website */
  registrationStatus?: RegistrationStatusFilter;
  /** Filter by user who moved lead into current contact status */
  statusChangedBy?: string;
  /** When true, only leads with no picker (unclaimed) */
  unclaimed?: boolean;
  /** When true, only leads that have been claimed (pickedBy set) */
  claimed?: boolean;
  attempts?: string;
  /**
   * When true, owner scope uses only pickedBy OR addedBy (no statusHistory.changedBy).
   * This matches exactly how the Performance page counts outcomes.
   */
  strictOwner?: boolean;
  /**
   * When set to 'owner', the date filter (startDate/endDate) is applied to
   * (pickedAt OR createdAt) instead of just createdAt.
   * This matches the Performance page date logic for onboarder outcomes.
   */
  ownerDateMode?: 'owner';
  /**
   * Broad location search — case-insensitive substring match across city, locality,
   * address, state, and pincode fields. Applied only when user presses Enter in the UI.
   */
  locationSearch?: string;
}

export interface CallbackQueueFilters {
  city?: string;
  /** Broad location search across city/locality/address/state/pincode (Enter-triggered). */
  locationSearch?: string;
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
  /** Broad location search across city/locality/address/state/pincode (Enter-triggered). */
  locationSearch?: string;
  primarySkill?: string;
  addedBy?: string;
  addedByAny?: string[];
  ownerBy?: string;
  ownerByAny?: string[];
  pickedBy?: string;
  followUpOwnerBy?: string;
  followUpOwnerByAny?: string[];
  startDate?: Date;
  endDate?: Date;
  dueType?: FollowUpDueType;
  bucket?: FollowUpBucket;
  attempts?: string;
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
  rangeCount?: number;
}

export interface StatusAnalyticsFilters {
  from?: Date;
  to?: Date;
  qualifierId?: string;
  pickedBy?: string;
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

  /** Extra stored values matched when filtering by canonical category id */
  private static readonly CATEGORY_FILTER_ALIASES: Record<string, string[]> = {
    electrical: ['electrical', 'electrician'],
    plumbing: ['plumbing', 'plumber'],
    carpenter: ['carpenter', 'carpentry'],
    painting: ['painting', 'painter'],
  };

  private static readonly PRIMARY_CATEGORY_LABELS: Record<string, string> = {
    cleaning: 'Cleaning',
    handyperson: 'Handyperson',
    plumbing: 'Plumbing',
    electrical: 'Electrician',
    carpenter: 'Carpentry',
    painting: 'Home Painting',
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
    const keys = this.CATEGORY_FILTER_ALIASES[category] ?? [category];
    const matchConditions: any[] = [];

    for (const key of keys) {
      const label = this.PRIMARY_CATEGORY_LABELS[key];
      matchConditions.push({ primaryCategory: key }, { primarySkill: key });

      if (label) {
        matchConditions.push(
          { primaryCategory: label },
          { primarySkill: label },
          { primaryCategory: { $regex: new RegExp(`^${this.escapeRegex(label)}$`, 'i') } },
          { primarySkill: { $regex: new RegExp(`^${this.escapeRegex(label)}$`, 'i') } },
        );
      }

      const escapedKey = this.escapeRegex(key);
      matchConditions.push(
        { primaryCategory: { $regex: new RegExp(`^${escapedKey}$`, 'i') } },
        { primarySkill: { $regex: new RegExp(`^${escapedKey}$`, 'i') } },
      );
    }

    return { $or: matchConditions };
  }

  private static escapeRegex(value: string): string {
    return value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  }

  private static buildExactCaseInsensitiveMatch(value: string): { $regex: RegExp } {
    return { $regex: new RegExp(`^${this.escapeRegex(value)}$`, 'i') };
  }

  private static normalizeDistinctLocationValues(values: unknown[]): string[] {
    return this.collectLocationDropdownValues(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  /** Dropdown options must be place names — not pin codes, plot numbers, or numeric-only text. */
  private static isValidLocationDropdownValue(value: string): boolean {
    const v = value.trim();
    if (!v || v.length < 2) return false;
    if (!/[A-Za-z]/.test(v)) return false;
    if (/^\d+$/.test(v)) return false;
    if (/^\d{6}$/.test(v)) return false;
    if (/^[A-Z0-9]+\+[A-Z0-9]+$/i.test(v)) return false;
    if (/^[\d\s\-#./]+$/.test(v)) return false;
    if (/^(plot\s*(no\.?|number)?|no\.?|#)\s*\d+$/i.test(v)) return false;
    if (/^(first floor|floor|door\s*no\.?)\b/i.test(v)) return false;
    if (/mangalagiri|tadepalligudem|tadepalli/i.test(v)) return false;
    return true;
  }

  /** Case-insensitive dedupe; dropdown labels shown in uppercase. */
  private static collectLocationDropdownValues(values: Iterable<string>): string[] {
    const byKey = new Map<string, string>();
    for (const raw of values) {
      const v = raw.trim();
      if (!this.isValidLocationDropdownValue(v)) continue;
      const key = v.toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, v.toUpperCase());
      }
    }
    return Array.from(byKey.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
  }

  /** Full Google-style address stored in city field by mistake. */
  private static isFullAddressLike(value: string): boolean {
    const v = value.trim();
    if (!v) return false;
    if (v.includes(',')) return true;
    if (v.length > 60) return true;
    if (/[A-Z0-9]+\+[A-Z0-9]+/i.test(v)) return true;
    return false;
  }

  /** Parse city name from plain city or comma-separated address text. */
  private static extractCityFromStoredValue(raw: string): string | null {
    const v = raw.trim();
    if (!v) return null;

    if (!this.isFullAddressLike(v)) {
      return this.isValidLocationDropdownValue(v) ? v : null;
    }

    const parts = v.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return null;

    const last = parts[parts.length - 1];
    const stateWithPin = last.match(/^(.+?)\s+(\d{6})$/);
    if (stateWithPin && parts.length >= 2) {
      const city = parts[parts.length - 2];
      return this.isValidLocationDropdownValue(city) ? city : null;
    }

    if (parts.length === 2 && parts[1].length <= 40) {
      const city = parts[1];
      return this.isValidLocationDropdownValue(city) ? city : null;
    }

    return null;
  }

  private static isSkippableAddressPart(part: string): boolean {
    const v = part.trim();
    if (!v) return true;
    if (!this.isValidLocationDropdownValue(v)) return true;
    if (/[A-Z0-9]+\+[A-Z0-9]+/i.test(v)) return true;
    if (/^\d{6}$/.test(v)) return true;
    if (/^(Telangana|Andhra Pradesh|Karnataka|Maharashtra|Tamil Nadu|Delhi)$/i.test(v)) {
      return true;
    }
    if (/^(first floor|plot no|floor)/i.test(v)) return true;
    return false;
  }

  /** Parse local area from plain text or comma-separated address (not full address in dropdown). */
  private static extractLocalAreasFromStoredValue(raw: string): string[] {
    const v = raw.trim();
    if (!v) return [];

    if (!this.isFullAddressLike(v)) {
      return this.isValidLocationDropdownValue(v) ? [v] : [];
    }

    const parts = v.split(',').map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return [];

    const city = this.extractCityFromStoredValue(v);
    const candidates: string[] = [];

    if (city) {
      const cityIndex = parts.findIndex(
        (part) => part.toLowerCase() === city.toLowerCase(),
      );
      if (cityIndex > 0) {
        const beforeCity = parts[cityIndex - 1];
        if (beforeCity && !this.isSkippableAddressPart(beforeCity)) {
          candidates.push(beforeCity);
        }
      }
      if (parts.length === 2 && parts[0].toLowerCase() !== city.toLowerCase()) {
        candidates.push(parts[0]);
      }
    }

    return this.collectLocationDropdownValues(candidates);
  }

  private static pushLocationFilterClause(
    match: Record<string, unknown>,
    clause: Record<string, unknown>,
  ): void {
    if (match.$and) {
      (match.$and as Record<string, unknown>[]).push(clause);
      return;
    }
    if (match.$or) {
      match.$and = [{ $or: match.$or }, clause];
      delete match.$or;
      return;
    }
    Object.assign(match, clause);
  }

  /** City filter: match city (prefix), address, and locality so partial/embedded place names still match. */
  private static buildCityFilterMatch(city: string): Record<string, unknown> {
    const trimmed = city.trim();
    if (!trimmed) return {};
    const escaped = this.escapeRegex(trimmed);
    const substringRx = new RegExp(escaped, 'i');
    return {
      $or: [
        { city: { $regex: new RegExp(`^${escaped}`, 'i') } },
        { address: { $regex: substringRx } },
        { locality: { $regex: substringRx } },
      ],
    };
  }

  private static buildLocalAreaFilterMatch(localArea: string): Record<string, unknown> {
    const escaped = this.escapeRegex(localArea.trim());
    return {
      $or: [
        { address: { $regex: new RegExp(escaped, 'i') } },
        { city: { $regex: new RegExp(escaped, 'i') } },
        { locality: { $regex: new RegExp(escaped, 'i') } },
      ],
    };
  }

  private static buildLocalityFilterMatch(locality: string): Record<string, unknown> {
    const escaped = this.escapeRegex(locality.trim());
    return {
      $or: [
        { locality: { $regex: new RegExp(escaped, 'i') } },
        { address: { $regex: new RegExp(escaped, 'i') } },
        { city: { $regex: new RegExp(escaped, 'i') } },
      ],
    };
  }

  private static buildLocationSearchMatch(term: string): Record<string, unknown> {
    const escaped = this.escapeRegex(term.trim());
    const rx = new RegExp(escaped, 'i');
    return {
      $or: [
        { city: { $regex: rx } },
        { locality: { $regex: rx } },
        { address: { $regex: rx } },
        { state: { $regex: rx } },
        { pincode: { $regex: rx } },
      ],
    };
  }

  private static applyLeadLocationFilters(
    match: Record<string, unknown>,
    filters: { city?: string; locality?: string; localArea?: string; locationSearch?: string },
  ): void {
    if (filters.locationSearch) {
      // Broad Enter-triggered search across all location fields — takes precedence over city
      this.pushLocationFilterClause(match, this.buildLocationSearchMatch(filters.locationSearch));
      return;
    }

    const locationConditions: Record<string, unknown>[] = [];

    if (filters.city) {
      locationConditions.push(this.buildCityFilterMatch(filters.city));
    }
    if (filters.locality) {
      locationConditions.push(this.buildLocalityFilterMatch(filters.locality));
    }
    if (filters.localArea) {
      locationConditions.push(this.buildLocalAreaFilterMatch(filters.localArea));
    }

    if (locationConditions.length === 0) return;

    if (locationConditions.length === 1) {
      this.pushLocationFilterClause(match, locationConditions[0]);
    } else {
      const existingAnd = match.$and as Record<string, unknown>[] | undefined;
      match.$and = [...(existingAnd || []), ...locationConditions];
    }
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

  /**
   * Strict owner scope — only pickedBy OR addedBy.
   * Used when matching the Performance page counting logic exactly.
   */
  private static buildStrictOwnerScopeClause(ownerIds: string[]): { $or: Array<Record<string, unknown>> } {
    return {
      $or: [
        this.buildIdSelector('pickedBy', ownerIds),
        this.buildIdSelector('addedBy', ownerIds),
      ],
    };
  }

  private static textForSpreadsheet(value?: string | number | null): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  /** City column — prefer plain city name; parse legacy full addresses stored in city. */
  private static cityForExport(city?: string | null, address?: string | null): string {
    const cityVal = (city || '').trim();
    const addressVal = (address || '').trim();

    if (cityVal && !this.isFullAddressLike(cityVal)) {
      return cityVal;
    }

    return (
      this.extractCityFromStoredValue(cityVal) ||
      this.extractCityFromStoredValue(addressVal) ||
      cityVal
    );
  }

  /**
   * Local Area column — matches lead detail UI (`lead.address`).
   * Falls back to city only when address is empty and city is a short label.
   * Legacy full Google-style addresses stored in city are not used as fallback
   * (dashboard shows "—" for Local Area in that case).
   */
  private static localAreaForExport(city?: string | null, address?: string | null): string {
    const addressVal = (address || '').trim();
    if (addressVal) {
      return addressVal;
    }

    const cityVal = (city || '').trim();
    if (!cityVal || this.isFullAddressLike(cityVal)) {
      return '';
    }

    return cityVal;
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
      Locality: { min: 16, max: 28 },
      'Local Area': { min: 28, max: 55 },
      'Gated Community': { min: 18, max: 32 },
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

  /**
   * Parse from/to query params into IST day bounds (inclusive).
   * Accepts YYYY-MM-DD or full ISO timestamps.
   */
  static parseFilterRange(
    from?: string | Date,
    to?: string | Date
  ): { from?: Date; to?: Date } {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;

    const toISTBound = (value: string | Date, end: boolean): Date => {
      if (value instanceof Date) {
        return value;
      }

      const str = String(value).trim();
      const dateOnly = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateOnly) {
        const year = Number(dateOnly[1]);
        const month = Number(dateOnly[2]);
        const day = Number(dateOnly[3]);
        if (end) {
          return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - istOffsetMs);
        }
        return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - istOffsetMs);
      }

      return new Date(str);
    };

    return {
      from: from ? toISTBound(from, false) : undefined,
      to: to ? toISTBound(to, true) : undefined,
    };
  }

  private static buildBoundedDateRange(startDate?: Date, endDate?: Date): Record<string, Date> | null {
    if (!startDate && !endDate) return null;
    const dateRange: Record<string, Date> = {};
    if (startDate) dateRange.$gte = startDate;
    if (endDate) dateRange.$lte = endDate;
    return dateRange;
  }

  private static isContactOutcomeStatus(status?: LeadStatus): boolean {
    return (
      status === 'contacted_interested' ||
      status === 'contacted_not_interested' ||
      status === 'contacted_not_lifted'
    );
  }

  /** Date filter for registered-candidate list pages. */
  private static buildRegistrationDateFilterClause(
    registrationStatus: RegistrationStatusFilter,
    startDate?: Date,
    endDate?: Date
  ): Record<string, unknown> | null {
    const dateRange = this.buildBoundedDateRange(startDate, endDate);
    if (!dateRange) return null;
    const field = registrationStatus === 'registered_verified'
      ? 'conversionData.registeredVerifiedAt'
      : 'conversionData.registeredAt';
    return { [field]: dateRange };
  }

  /** Date filter for interested / not interested / not lifted queues. */
  private static buildStatusTransitionDateFilterClause(
    status: LeadStatus,
    startDate?: Date,
    endDate?: Date
  ): Record<string, unknown> | null {
    const dateRange = this.buildBoundedDateRange(startDate, endDate);
    if (!dateRange) return null;
    return {
      statusHistory: {
        $elemMatch: {
          status,
          changedAt: dateRange,
        },
      },
    };
  }

  private static buildOwnerActivityDateFilterClause(
    startDate?: Date,
    endDate?: Date
  ): Record<string, unknown> | null {
    const dateRange = this.buildBoundedDateRange(startDate, endDate);
    if (!dateRange) return null;
    return {
      $or: [{ pickedAt: dateRange }, { createdAt: dateRange }],
    };
  }

  private static buildSearchDateFilterClause(filters: SearchFilters): Record<string, unknown> | null {
    if (!filters.startDate && !filters.endDate) return null;

    if (
      filters.registrationStatus === 'registered' ||
      filters.registrationStatus === 'registered_verified'
    ) {
      return this.buildRegistrationDateFilterClause(filters.registrationStatus, filters.startDate, filters.endDate);
    }

    if (filters.status && this.isContactOutcomeStatus(filters.status)) {
      return this.buildStatusTransitionDateFilterClause(
        filters.status,
        filters.startDate,
        filters.endDate
      );
    }

    if (filters.ownerDateMode === 'owner') {
      return this.buildOwnerActivityDateFilterClause(filters.startDate, filters.endDate);
    }

    const dateRange = this.buildBoundedDateRange(filters.startDate, filters.endDate);
    return dateRange ? { createdAt: dateRange } : null;
  }

  private static isDateInFilterRange(
    value: Date | string | null | undefined,
    filters: { from?: Date; to?: Date; allTime?: boolean }
  ): boolean {
    if (filters.allTime || !filters.from || !filters.to) return true;
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return false;
    return timestamp >= filters.from.getTime() && timestamp <= filters.to.getTime();
  }

  private static getLatestStatusTransitionAt(lead: any, status: LeadStatus): Date | undefined {
    const history = Array.isArray(lead.statusHistory) ? lead.statusHistory : [];
    const latest = history
      .filter((entry: any) => entry?.status === status && entry?.changedAt)
      .sort(
        (a: any, b: any) =>
          new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
      )[0];
    return latest?.changedAt ? new Date(latest.changedAt) : undefined;
  }

  private static getRegistrationActivityAt(lead: any): Date | undefined {
    const candidates = [
      lead.conversionData?.lastCheckedAt,
      lead.updatedAt,
      lead.pickedAt,
      lead.createdAt,
    ];
    for (const candidate of candidates) {
      if (candidate) return new Date(candidate);
    }
    return undefined;
  }

  private static leadIsRegistered(lead: any): boolean {
    const platformUid = lead.conversionData?.platformUid;
    const firebaseUid = lead.activationData?.firebaseUid;
    const status = lead.accountStatus;
    return (
      (platformUid !== undefined && platformUid !== null && platformUid !== '') ||
      (firebaseUid !== undefined && firebaseUid !== null && firebaseUid !== '') ||
      ['invited', 'activated', 'suspended'].includes(status)
    );
  }

  private static leadIsVerified(lead: any): boolean {
    return (
      lead.conversionData?.isAadhaarVerified === true ||
      lead.verificationStatus?.aadhaar?.status === 'verified'
    );
  }

  static normalizeLeadForResponse(lead: any): any {
    return this.normalizeLeadData(lead);
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
        'plumbing': 'Plumbing',
        'electrical': 'Electrician',
        'carpenter': 'Carpentry',
        'painting': 'Home Painting',
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
        locality: data.locality?.trim() || undefined,
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

  private static applyOwnerScope(query: any, ownerBy?: string, ownerByAny?: string[], strictOwner?: boolean): void {
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
    if (strictOwner) {
      query.$and.push(this.buildStrictOwnerScopeClause(ownerIds));
    } else {
      query.$and.push(this.buildOwnerScopeClause(ownerIds));
    }
  }

  private static applyPrioritizedOwnerScope(query: any, ownerBy?: string, ownerByAny?: string[]): void {
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
    query.$and.push({
      $or: [
        this.buildIdSelector('pickedBy', ownerIds),
        {
          $and: [
            {
              $or: [
                { pickedBy: null },
                { pickedBy: { $exists: false } },
                { pickedBy: '' }
              ]
            },
            this.buildIdSelector('addedBy', ownerIds)
          ]
        }
      ]
    });
  }

  private static latestFollowUpHistoryEntry(
    lead: { statusHistory?: Array<Record<string, any>> },
    dueType: 'callback' | 'onboarding'
  ): Record<string, any> | undefined {
    const history = Array.isArray(lead.statusHistory) ? lead.statusHistory : [];
    void dueType;
    return [...history].sort(
      (a, b) =>
        new Date(b?.changedAt || 0).getTime() - new Date(a?.changedAt || 0).getTime()
    )[0];
  }

  private static filterFollowUpsByOwner<T extends FollowUpQueueItem>(
    items: T[],
    filters: Pick<FollowUpQueueFilters, 'followUpOwnerBy' | 'followUpOwnerByAny'>
  ): T[] {
    const ownerIds = Array.from(
      new Set(
        (filters.followUpOwnerByAny && filters.followUpOwnerByAny.length > 0
          ? filters.followUpOwnerByAny
          : filters.followUpOwnerBy
            ? [filters.followUpOwnerBy]
            : []
        ).filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      )
    );

    if (!ownerIds.length) {
      return items;
    }

    const ownerSet = new Set(ownerIds);
    return items.filter((item) => {
      const owner = this.latestFollowUpHistoryEntry(item as T & { statusHistory?: Array<Record<string, any>> }, item.dueType);
      return owner?.changedBy ? ownerSet.has(owner.changedBy) : false;
    });
  }

  private static buildFollowUpStatsDocumentMatch(
    filters: Pick<FollowUpQueueFilters, 'addedBy' | 'addedByAny' | 'ownerBy' | 'ownerByAny' | 'pickedBy'>,
  ): Record<string, unknown> {
    const scope: Record<string, unknown> = {};
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

    const existingScopeAnd = Array.isArray(scope.$and) ? scope.$and : [];
    delete scope.$and;

    return {
      ...scope,
      $and: [
        ...existingScopeAnd,
        {
          $or: [
            { nextCallbackAt: { $exists: true, $ne: null } },
            { expectedOnboardingAt: { $exists: true, $ne: null } },
          ],
        },
      ],
    };
  }

  private static buildFollowUpStatsOwnerStage(
    filters: Pick<FollowUpQueueFilters, 'followUpOwnerBy' | 'followUpOwnerByAny'>,
  ): Record<string, unknown>[] {
    const ownerIds = Array.from(
      new Set(
        (filters.followUpOwnerByAny && filters.followUpOwnerByAny.length > 0
          ? filters.followUpOwnerByAny
          : filters.followUpOwnerBy
            ? [filters.followUpOwnerBy]
            : []
        ).filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
      ),
    );

    if (!ownerIds.length) {
      return [];
    }

    return [{ $match: { latestChangedBy: { $in: ownerIds } } }];
  }

  private static buildFollowUpQueueLeadMatch(filters: FollowUpQueueFilters): Record<string, unknown> {
    const query: Record<string, unknown> = {};

    if (filters.city) {
      this.pushLocationFilterClause(query, this.buildCityFilterMatch(filters.city));
    }
    if (filters.primarySkill) {
      query.$and = query.$and || [];
      (query.$and as Record<string, unknown>[]).push(this.buildCategoryMatch(filters.primarySkill));
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

    if (filters.attempts) {
      query.attempts = filters.attempts;
    }

    const dueType = filters.dueType || 'all';
    if (dueType === 'callback') {
      query.nextCallbackAt = { $exists: true, $ne: null };
    } else if (dueType === 'onboarding') {
      query.expectedOnboardingAt = { $exists: true, $ne: null };
    } else {
      query.$and = query.$and || [];
      (query.$and as Record<string, unknown>[]).push({
        $or: [
          { nextCallbackAt: { $exists: true, $ne: null } },
          { expectedOnboardingAt: { $exists: true, $ne: null } },
        ],
      });
    }

    return query;
  }

  private static buildFollowUpBucketMatch(
    filters: FollowUpQueueFilters,
    startOfToday: Date,
    endOfToday: Date,
    now: Date,
  ): Record<string, unknown> {
    const bucket = filters.bucket || 'all';

    if (bucket === 'today') {
      return { dueAt: { $gte: startOfToday, $lte: endOfToday } };
    }
    if (bucket === 'overdue') {
      return {
        $and: [
          { dueAt: { $lt: now } },
          { attempts: { $ne: 'max_reached' } },
        ],
      };
    }
    if (bucket === 'upcoming') {
      return { dueAt: { $gt: endOfToday } };
    }

    const dueAt: Record<string, unknown> = {};
    if (filters.startDate) {
      dueAt.$gte = filters.startDate;
    }
    if (filters.endDate) {
      dueAt.$lte = filters.endDate;
    }
    if (Object.keys(dueAt).length > 0) {
      return { dueAt };
    }

    return {};
  }

  private static buildFollowUpDueTodayAccumulator(field: string, startOfToday: Date, endOfToday: Date) {
    return {
      $sum: {
        $cond: [
          {
            $and: [
              { $gte: [`$${field}`, startOfToday] },
              { $lte: [`$${field}`, endOfToday] },
            ],
          },
          1,
          0,
        ],
      },
    };
  }

  private static buildFollowUpOverdueAccumulator(field: string, now: Date) {
    return {
      $sum: {
        $cond: [
          {
            $and: [
              { $lt: [`$${field}`, now] },
              { $ne: ['$attempts', 'max_reached'] },
            ],
          },
          1,
          0,
        ],
      },
    };
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
      return this.normalizeDistinctLocationValues(names);
    } catch (error: any) {
      logger.error('Error getting gated community names', { error: error.message });
      throw error;
    }
  }

  static async getLeadCities(): Promise<string[]> {
    try {
      const cities = await Lead.distinct('city', {
        city: { $exists: true, $nin: [null, ''] },
      });

      const cityNames: string[] = [];
      for (const value of cities) {
        if (typeof value !== 'string') continue;
        const extracted = this.extractCityFromStoredValue(value);
        if (extracted) {
          cityNames.push(extracted);
        }
      }

      return this.collectLocationDropdownValues(cityNames);
    } catch (error: any) {
      logger.error('Error getting lead cities', { error: error.message });
      throw error;
    }
  }

  static async getLeadLocalAreas(): Promise<string[]> {
    try {
      const [addresses, cityValues] = await Promise.all([
        Lead.distinct('address', {
          address: { $exists: true, $nin: [null, ''] },
        }),
        Lead.distinct('city', {
          city: { $exists: true, $nin: [null, ''] },
        }),
      ]);

      const localAreas: string[] = [];
      for (const value of [...addresses, ...cityValues]) {
        if (typeof value !== 'string') continue;
        localAreas.push(...this.extractLocalAreasFromStoredValue(value));
      }

      return this.collectLocationDropdownValues(localAreas);
    } catch (error: any) {
      logger.error('Error getting lead local areas', { error: error.message });
      throw error;
    }
  }

  static async getLeadLocalities(): Promise<string[]> {
    try {
      const localities = await Lead.distinct('locality', {
        locality: { $exists: true, $nin: [null, ''] },
      });

      const names: string[] = [];
      for (const value of localities) {
        if (typeof value !== 'string') continue;
        const trimmed = value.trim();
        if (trimmed) names.push(trimmed);
      }

      return this.collectLocationDropdownValues(names);
    } catch (error: any) {
      logger.error('Error getting lead localities', { error: error.message });
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

      if (filters.attempts) {
        query.attempts = filters.attempts;
      }

      this.applyLeadLocationFilters(query, {
        city: filters.city,
        locality: filters.locality,
        localArea: filters.localArea,
      });

      if (filters.primarySkill) {
        query.$and = query.$and || [];
        query.$and.push(this.buildCategoryMatch(filters.primarySkill));
      }

      if (filters.source) {
        query.source = filters.source;
      }

      if (filters.addedByAny && filters.addedByAny.length > 0) {
        query.addedBy = { $in: filters.addedByAny };
      } else if (filters.addedBy) {
        query.addedBy = filters.addedBy;
      }

      if (filters.unclaimed) {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { pickedBy: null },
            { pickedBy: { $exists: false } },
            { pickedBy: '' },
          ],
        });
      } else if (filters.claimed) {
        query.$and = query.$and || [];
        query.$and.push({
          pickedBy: { $exists: true, $nin: [null, ''] },
        });
      } else if (filters.pickedByAny && filters.pickedByAny.length > 0) {
        query.pickedBy = { $in: filters.pickedByAny };
      } else if (filters.pickedBy) {
        query.pickedBy = filters.pickedBy;
      }

      if (filters.transferPendingTo) {
        query.transferPendingTo = filters.transferPendingTo;
      }

      const hasPickedFilter =
        !!filters.pickedBy || (filters.pickedByAny && filters.pickedByAny.length > 0);
      if (!hasPickedFilter && !filters.unclaimed && !filters.claimed) {
        if (filters.registrationStatus) {
          this.applyPrioritizedOwnerScope(query, filters.ownerBy, filters.ownerByAny);
        } else {
          this.applyOwnerScope(query, filters.ownerBy, filters.ownerByAny, filters.strictOwner);
        }
      }

      if (filters.startDate || filters.endDate) {
        const dateClause = this.buildSearchDateFilterClause(filters);
        if (dateClause) {
          query.$and = query.$and || [];
          query.$and.push(dateClause);
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
        this.pushLocationFilterClause(query, this.buildCityFilterMatch(filters.city));
      }

      if (filters.primarySkill) {
        query.$and = query.$and || [];
        query.$and.push(this.buildCategoryMatch(filters.primarySkill));
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
          attempts: { $ne: 'max_reached' },
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

      const leadMatch = this.buildFollowUpQueueLeadMatch(filters);
      const bucketMatch = this.buildFollowUpBucketMatch(filters, startOfToday, endOfToday, now);
      const dueType = filters.dueType || 'all';
      const includeCallback = dueType === 'all' || dueType === 'callback';
      const includeOnboarding = dueType === 'all' || dueType === 'onboarding';

      const expandFacet: Record<string, object[]> = {};
      if (includeCallback) {
        expandFacet.callbacks = [
          { $match: { nextCallbackAt: { $exists: true, $ne: null } } },
          { $addFields: { dueType: 'callback', dueAt: '$nextCallbackAt' } },
        ];
      }
      if (includeOnboarding) {
        expandFacet.onboardings = [
          { $match: { expectedOnboardingAt: { $exists: true, $ne: null } } },
          { $addFields: { dueType: 'onboarding', dueAt: '$expectedOnboardingAt' } },
        ];
      }

      const pipeline: Record<string, unknown>[] = [
        { $match: leadMatch },
        {
          $addFields: {
            latestChangedBy: {
              $let: {
                vars: {
                  latestEntry: {
                    $arrayElemAt: [
                      {
                        $sortArray: {
                          input: { $ifNull: ['$statusHistory', []] },
                          sortBy: { changedAt: -1 },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: '$$latestEntry.changedBy',
              },
            },
          },
        },
        ...this.buildFollowUpStatsOwnerStage({
          followUpOwnerBy: filters.followUpOwnerBy,
          followUpOwnerByAny: filters.followUpOwnerByAny,
        }),
        { $facet: expandFacet },
        {
          $project: {
            items: {
              $concatArrays: [
                { $ifNull: ['$callbacks', []] },
                { $ifNull: ['$onboardings', []] },
              ],
            },
          },
        },
        { $unwind: '$items' },
        { $replaceRoot: { newRoot: '$items' } },
      ];

      if (Object.keys(bucketMatch).length > 0) {
        pipeline.push({ $match: bucketMatch });
      }

      pipeline.push({
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $sort: { dueAt: 1 } },
            { $skip: skip },
            { $limit: limit },
          ],
        },
      });

      const [aggregated] = await Lead.aggregate(pipeline as any[]);
      const total = aggregated?.metadata?.[0]?.total || 0;
      const leads = (aggregated?.data || []).map((lead: Record<string, unknown>) =>
        this.normalizeLeadData(lead) as FollowUpQueueItem,
      );

      return {
        leads,
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
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
    filters: Pick<FollowUpQueueFilters, 'addedBy' | 'addedByAny' | 'ownerBy' | 'ownerByAny' | 'pickedBy' | 'followUpOwnerBy' | 'followUpOwnerByAny'>,
    dateRange?: { from?: Date; to?: Date }
  ): Promise<FollowUpQueueStats> {
    try {
      const cacheKey = buildFollowUpStatsCacheKey(filters, dateRange);
      const cached = getCachedFollowUpStats(cacheKey);
      if (cached) {
        return cached;
      }

      const now = new Date();
      const { startOfToday, endOfToday } = this.getISTDayBounds(now);
      const baseMatch = this.buildFollowUpStatsDocumentMatch(filters);

      const facet: Record<string, object[]> = {
        callbacks: [
          { $match: { nextCallbackAt: { $exists: true, $ne: null } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              dueToday: this.buildFollowUpDueTodayAccumulator('nextCallbackAt', startOfToday, endOfToday),
              overdue: this.buildFollowUpOverdueAccumulator('nextCallbackAt', now),
            },
          },
        ],
        onboarding: [
          { $match: { expectedOnboardingAt: { $exists: true, $ne: null } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              dueToday: this.buildFollowUpDueTodayAccumulator('expectedOnboardingAt', startOfToday, endOfToday),
              overdue: this.buildFollowUpOverdueAccumulator('expectedOnboardingAt', now),
            },
          },
        ],
      };

      if (dateRange?.from && dateRange?.to) {
        facet.rangeCallbacks = [
          {
            $match: {
              nextCallbackAt: { $gte: dateRange.from, $lte: dateRange.to },
            },
          },
          { $count: 'count' },
        ];
        facet.rangeOnboarding = [
          {
            $match: {
              expectedOnboardingAt: { $gte: dateRange.from, $lte: dateRange.to },
            },
          },
          { $count: 'count' },
        ];
      }

      const pipeline: Record<string, unknown>[] = [
        { $match: baseMatch },
        {
          $addFields: {
            latestChangedBy: {
              $let: {
                vars: {
                  latestEntry: {
                    $arrayElemAt: [
                      {
                        $sortArray: {
                          input: { $ifNull: ['$statusHistory', []] },
                          sortBy: { changedAt: -1 },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: '$$latestEntry.changedBy',
              },
            },
          },
        },
        ...this.buildFollowUpStatsOwnerStage(filters),
        { $facet: facet },
      ];

      const [aggregated] = await Lead.aggregate(pipeline as any[]);

      const callbackGroup = aggregated?.callbacks?.[0] || {};
      const onboardingGroup = aggregated?.onboarding?.[0] || {};
      const callbackTotal = callbackGroup.total || 0;
      const onboardingTotal = onboardingGroup.total || 0;

      const rangeCount =
        dateRange?.from && dateRange?.to
          ? (aggregated?.rangeCallbacks?.[0]?.count || 0) +
            (aggregated?.rangeOnboarding?.[0]?.count || 0)
          : undefined;

      const stats: FollowUpQueueStats = {
        callbackTotal,
        onboardingTotal,
        callbackDueToday: callbackGroup.dueToday || 0,
        callbackOverdue: callbackGroup.overdue || 0,
        onboardingDueToday: onboardingGroup.dueToday || 0,
        onboardingOverdue: onboardingGroup.overdue || 0,
        totalFollowUps: callbackTotal + onboardingTotal,
        rangeCount,
      };

      setCachedFollowUpStats(cacheKey, stats);
      return stats;
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
    onboardedCategoryBreakdown?: Array<{ category: string; count: number }>;
    verifiedCategoryBreakdown?: Array<{ category: string; count: number }>;
    interestedCategoryBreakdown?: Array<{ category: string; count: number }>;
  }> {
    try {
      const leadMatch: any = {};
      const userId = filters.pickedBy || filters.qualifierId;
      if (userId) {
        if (filters.claimsScope === 'current') {
          leadMatch.pickedBy = userId;
        } else {
          leadMatch.$or = [
            { pickedBy: userId },
            { addedBy: userId },
            { 'statusHistory.changedBy': userId }
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
      this.applyLeadLocationFilters(leadMatch, filters);

      // Scope all stat cards to leads created in the selected date range,
      // keeping parity with the leadsAdded count which also uses createdAt.
      if (!filters.allTime && filters.from && filters.to) {
        leadMatch.createdAt = { $gte: filters.from, $lte: filters.to };
      }

      const basePipeline: any[] = [
        { $match: leadMatch },
        { $unwind: '$statusHistory' },
      ];

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
      const registeredOnlyPredicate = this.buildRegisteredOnlyPredicate();
      const onboardedScopeMatch =
        Object.keys(leadMatch).length > 0
          ? { $and: [leadMatch, registeredOnlyPredicate] }
          : registeredOnlyPredicate;
      const verifiedPredicate = this.buildVerifiedPredicate();
      const verifiedScopeMatch =
        Object.keys(leadMatch).length > 0
          ? { $and: [leadMatch, verifiedPredicate] }
          : verifiedPredicate;
      const onboardedPromise =
        filters.allTime || !filters.from || !filters.to
          ? Lead.countDocuments(onboardedScopeMatch)
          : Lead.aggregate([
              { $match: leadMatch },
              { $match: registeredOnlyPredicate },
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

      const onboardedCategoryBreakdownPromise =
        filters.allTime || !filters.from || !filters.to
          ? Lead.aggregate([
              { $match: onboardedScopeMatch },
              {
                $group: {
                  _id: { $ifNull: ['$primaryCategory', { $ifNull: ['$primarySkill', 'other'] }] },
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1 } },
            ])
          : Lead.aggregate([
              { $match: leadMatch },
              { $match: registeredOnlyPredicate },
              { $unwind: '$statusHistory' },
              {
                $match: {
                  'statusHistory.changedAt': { $gte: filters.from, $lte: filters.to },
                },
              },
              {
                $group: {
                  _id: '$leadId',
                  primaryCategory: { $first: '$primaryCategory' },
                  primarySkill: { $first: '$primarySkill' },
                },
              },
              {
                $group: {
                  _id: { $ifNull: ['$primaryCategory', { $ifNull: ['$primarySkill', 'other'] }] },
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1 } },
            ]);

      const verifiedPromise =
        filters.allTime || !filters.from || !filters.to
          ? Lead.countDocuments(verifiedScopeMatch)
          : Lead.aggregate([
              { $match: leadMatch },
              { $match: verifiedPredicate },
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

      const verifiedCategoryBreakdownPromise =
        filters.allTime || !filters.from || !filters.to
          ? Lead.aggregate([
              { $match: verifiedScopeMatch },
              {
                $group: {
                  _id: { $ifNull: ['$primaryCategory', { $ifNull: ['$primarySkill', 'other'] }] },
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1 } },
            ])
          : Lead.aggregate([
              { $match: leadMatch },
              { $match: verifiedPredicate },
              { $unwind: '$statusHistory' },
              {
                $match: {
                  'statusHistory.changedAt': { $gte: filters.from, $lte: filters.to },
                },
              },
              {
                $group: {
                  _id: '$leadId',
                  primaryCategory: { $first: '$primaryCategory' },
                  primarySkill: { $first: '$primarySkill' },
                },
              },
              {
                $group: {
                  _id: { $ifNull: ['$primaryCategory', { $ifNull: ['$primarySkill', 'other'] }] },
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1 } },
            ]);

      const [
        statusCountsRaw,
        touchedRaw,
        qualifierRaw,
        callbackScheduledRaw,
        callbackOverdueRaw,
        onboardedRaw,
        onboardedCategoryBreakdownRaw,
        verifiedRaw,
        verifiedCategoryBreakdownRaw,
        interestedCategoryBreakdownRaw,
      ] = await Promise.all([
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
        onboardedCategoryBreakdownPromise,
        verifiedPromise,
        verifiedCategoryBreakdownPromise,
        // Interested category breakdown — self-contained pipeline that keeps primaryCategory
        Lead.aggregate([
          { $match: leadMatch },
          { $unwind: '$statusHistory' },
          { $sort: { 'statusHistory.changedAt': 1 } },
          {
            $group: {
              _id: '$leadId',
              latestStatus: { $last: '$statusHistory' },
              primaryCategory: { $last: '$primaryCategory' },
              primarySkill: { $last: '$primarySkill' },
            },
          },
          { $match: { 'latestStatus.status': 'contacted_interested' } },
          {
            $group: {
              _id: {
                $ifNull: [
                  '$primaryCategory',
                  { $ifNull: ['$primarySkill', 'other'] },
                ],
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ]),
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

      const onboardedCategoryBreakdown = (onboardedCategoryBreakdownRaw || []).map((row: any) => ({
        category: row._id,
        count: row.count,
      }));

      const verified =
        typeof verifiedRaw === 'number'
          ? verifiedRaw
          : verifiedRaw[0]?.count || 0;

      const verifiedCategoryBreakdown = (verifiedCategoryBreakdownRaw || []).map((row: any) => ({
        category: row._id,
        count: row.count,
      }));

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
      this.applyLeadLocationFilters(leadsAddedMatch, filters);

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
        onboardedCategoryBreakdown,
        verifiedCategoryBreakdown,
        interestedCategoryBreakdown: (interestedCategoryBreakdownRaw || []).map((row: any) => ({
          category: row._id,
          count: row.count,
        })),
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

      // "Leads Added" / claims-by-creation export (matches leadsAdded analytics card)
      if (filters.reportCategory === 'touched_leads' && !filters.pickedBy) {
        return this.exportLeadsAddedStandardReport(filters);
      }

      const leadMatch: any = {};
      const userId = filters.pickedBy || filters.qualifierId;
      if (userId) {
        if (filters.claimsScope === 'current') {
          leadMatch.pickedBy = userId;
        } else {
          leadMatch.$or = [
            { pickedBy: userId },
            { addedBy: userId },
            { 'statusHistory.changedBy': userId }
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
      this.applyLeadLocationFilters(leadMatch, filters);

      // "Onboarded" export: matches the analytics card — filter by createdAt + registeredOnlyPredicate
      if (filters.reportCategory === 'onboarded') {
        return this.exportOnboardedReport(filters);
      }

      // "Verified" export: matches the analytics card — filter by createdAt + verifiedPredicate
      if (filters.reportCategory === 'verified') {
        return this.exportVerifiedReport(filters);
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
            locality: { $first: '$locality' },
            address: { $first: '$address' },
            state: { $first: '$state' },
            primaryCategory: { $first: '$primaryCategory' },
            primarySkill: { $first: '$primarySkill' },
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
        { $sort: { updatedAt: -1 } },
      ]);

      const reportRows = rows.map((row: any) => {
        const base: Record<string, string> = {
          Date: this.formatIST(row.latestHistory?.changedAt),
          'Qualifier Name': this.textForSpreadsheet(row.qualifierName || 'Unknown'),
          'Lead ID': this.textForSpreadsheet(row.leadId),
          'Lead Name': this.textForSpreadsheet(row.name),
          'Phone/Landline': this.textForSpreadsheet(row.phone || row.landline || ''),
          City: this.textForSpreadsheet(this.cityForExport(row.city, row.address)),
          Locality: this.textForSpreadsheet(row.locality || ''),
          'Local Area': this.textForSpreadsheet(this.localAreaForExport(row.city, row.address)),
          'Gated Community': this.textForSpreadsheet(row.gatedCommunityName || ''),
          Category: this.categoryLabelForExport(row.primaryCategory || row.primarySkill),
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
          base['Is Gated Community'] = row.isGatedCommunity ? 'Yes' : 'No';
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

  private static async exportLeadsAddedStandardReport(
    filters: StatusReportExportFilters
  ): Promise<{ filename: string; mimeType: string; buffer: Buffer; rowCount: number }> {
    const leadMatch: any = {};

    if (filters.qualifierId) {
      leadMatch.addedBy = filters.qualifierId;
    }

    if (!filters.allTime && filters.from && filters.to) {
      leadMatch.createdAt = { $gte: filters.from, $lte: filters.to };
    }

    if (filters.category) {
      leadMatch.$and = leadMatch.$and || [];
      leadMatch.$and.push(this.buildCategoryMatch(filters.category));
    }

    if (filters.gatedCommunityName) {
      leadMatch.gatedCommunityName = this.buildExactCaseInsensitiveMatch(filters.gatedCommunityName);
    }

    this.applyLeadLocationFilters(leadMatch, filters);

    const leads = await Lead.find(leadMatch).sort({ createdAt: -1 }).lean();

    const reportRows = leads.map((lead) => {
      const latestHistory = [...(lead.statusHistory || [])].sort(
        (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
      )[0];

      const base: Record<string, string> = {
        Date: this.formatIST(lead.createdAt),
        'Qualifier Name': this.textForSpreadsheet(lead.addedByName || lead.pickedByName || 'Unknown'),
        'Lead ID': this.textForSpreadsheet(lead.leadId),
        'Lead Name': this.textForSpreadsheet(lead.name),
        'Phone/Landline': this.textForSpreadsheet(lead.phone || lead.landline || ''),
        City: this.textForSpreadsheet(this.cityForExport(lead.city, lead.address)),
        Locality: this.textForSpreadsheet(lead.locality || ''),
        'Local Area': this.textForSpreadsheet(this.localAreaForExport(lead.city, lead.address)),
        'Gated Community': this.textForSpreadsheet(lead.gatedCommunityName || ''),
        Category: this.categoryLabelForExport(lead.primaryCategory || lead.primarySkill),
        'Current Status': this.labelForReport(latestHistory?.status || lead.status),
        'Status Reason': this.textForSpreadsheet(
          latestHistory?.statusReasonText || this.labelForReport(latestHistory?.statusReasonCode)
        ),
        'Callback Date': this.formatIST(latestHistory?.callbackAt),
        'Expected Onboarding Date': this.formatIST(latestHistory?.expectedOnboardingAt),
        'Last Updated At': this.formatIST(lead.updatedAt),
        'Last Updated By': this.textForSpreadsheet(
          lead.lastUpdatedByName || lead.lastUpdatedBy || latestHistory?.changedByName || latestHistory?.changedBy || ''
        ),
      };

      if (filters.template === 'detailed') {
        base.State = this.textForSpreadsheet(lead.state);
        base['Primary Category'] = this.textForSpreadsheet(lead.primaryCategory || lead.primarySkill);
        base['Secondary Category'] = this.textForSpreadsheet(lead.secondaryCategory || lead.secondarySkill);
        base.Source = this.textForSpreadsheet(lead.source);
        base['Source Details'] = this.textForSpreadsheet(lead.sourceDetails);
        base['Is Gated Community'] = lead.isGatedCommunity ? 'Yes' : 'No';
        base['Gated Community Name'] = this.textForSpreadsheet(lead.gatedCommunityName);
        base['Created At'] = this.formatIST(lead.createdAt);
        base['Updated At'] = this.formatIST(lead.updatedAt);
        if (filters.includeNotes) {
          base.Notes = this.textForSpreadsheet(latestHistory?.notes);
        }
        base['Is Duplicate'] = lead.isDuplicate ? 'Yes' : 'No';
        base.Blacklisted = lead.blacklisted ? 'Yes' : 'No';
      }

      return base;
    });

    const worksheet = XLSX.utils.json_to_sheet(reportRows);
    this.applyWorksheetLayout(worksheet, reportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads Added');

    const dateStamp = new Date().toISOString().slice(0, 10);
    const categorySlug = filters.category ? `-${filters.category}` : '';
    const filename = `leads-added-report-${filters.template}${categorySlug}-${dateStamp}.${filters.format}`;
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

  private static async exportOnboardedReport(
    filters: StatusReportExportFilters
  ): Promise<{ filename: string; mimeType: string; buffer: Buffer; rowCount: number }> {
    const registeredOnlyPredicate = this.buildRegisteredOnlyPredicate();

    // Start with the user/scope/location match (same as analytics leadMatch)
    const conditions: any[] = [];

    const userId = filters.pickedBy || filters.qualifierId;
    if (userId) {
      if (filters.claimsScope === 'current') {
        conditions.push({ pickedBy: userId });
      } else {
        conditions.push({
          $or: [
            { pickedBy: userId },
            { addedBy: userId },
            { 'statusHistory.changedBy': userId },
          ],
        });
      }
    }

    if (filters.category) {
      conditions.push(this.buildCategoryMatch(filters.category));
    }

    if (filters.gatedCommunityName) {
      conditions.push({ gatedCommunityName: this.buildExactCaseInsensitiveMatch(filters.gatedCommunityName) });
    }

    // Apply location filters via a temporary match object
    const locationMatch: any = {};
    this.applyLeadLocationFilters(locationMatch, filters);
    if (Object.keys(locationMatch).length > 0) {
      conditions.push(locationMatch);
    }

    // Date range: filter by createdAt, matching the analytics card exactly
    if (!filters.allTime && filters.from && filters.to) {
      conditions.push({ createdAt: { $gte: filters.from, $lte: filters.to } });
    }

    // Always require the registered-only predicate
    conditions.push(registeredOnlyPredicate);

    const matchQuery = conditions.length === 1 ? conditions[0] : { $and: conditions };

    const leads = await Lead.find(matchQuery).sort({ createdAt: -1 }).lean();

    const reportRows = leads.map((lead) => {
      const latestHistory = [...(lead.statusHistory || [])].sort(
        (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
      )[0];

      const base: Record<string, string> = {
        Date: this.formatIST(lead.createdAt),
        'Qualifier Name': this.textForSpreadsheet(lead.addedByName || lead.pickedByName || 'Unknown'),
        'Lead ID': this.textForSpreadsheet(lead.leadId),
        'Lead Name': this.textForSpreadsheet(lead.name),
        'Phone/Landline': this.textForSpreadsheet(lead.phone || lead.landline || ''),
        City: this.textForSpreadsheet(this.cityForExport(lead.city, lead.address)),
        Locality: this.textForSpreadsheet(lead.locality || ''),
        'Local Area': this.textForSpreadsheet(this.localAreaForExport(lead.city, lead.address)),
        'Gated Community': this.textForSpreadsheet(lead.gatedCommunityName || ''),
        Category: this.categoryLabelForExport(lead.primaryCategory || lead.primarySkill),
        'Current Status': this.labelForReport(latestHistory?.status || lead.status),
        'Status Reason': this.textForSpreadsheet(
          latestHistory?.statusReasonText || this.labelForReport(latestHistory?.statusReasonCode)
        ),
        'Callback Date': this.formatIST(latestHistory?.callbackAt),
        'Expected Onboarding Date': this.formatIST(latestHistory?.expectedOnboardingAt),
        'Last Updated At': this.formatIST(lead.updatedAt),
        'Last Updated By': this.textForSpreadsheet(
          lead.lastUpdatedByName || lead.lastUpdatedBy || latestHistory?.changedByName || latestHistory?.changedBy || ''
        ),
      };

      if (filters.template === 'detailed') {
        base.State = this.textForSpreadsheet(lead.state);
        base['Primary Category'] = this.textForSpreadsheet(lead.primaryCategory || lead.primarySkill);
        base['Secondary Category'] = this.textForSpreadsheet(lead.secondaryCategory || lead.secondarySkill);
        base.Source = this.textForSpreadsheet(lead.source);
        base['Source Details'] = this.textForSpreadsheet(lead.sourceDetails);
        base['Is Gated Community'] = lead.isGatedCommunity ? 'Yes' : 'No';
        base['Gated Community Name'] = this.textForSpreadsheet(lead.gatedCommunityName);
        base['Created At'] = this.formatIST(lead.createdAt);
        base['Updated At'] = this.formatIST(lead.updatedAt);
        if (filters.includeNotes) {
          base.Notes = this.textForSpreadsheet(latestHistory?.notes);
        }
        base['Is Duplicate'] = lead.isDuplicate ? 'Yes' : 'No';
        base.Blacklisted = lead.blacklisted ? 'Yes' : 'No';
      }

      return base;
    });

    const worksheet = XLSX.utils.json_to_sheet(reportRows);
    this.applyWorksheetLayout(worksheet, reportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Onboarded');

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `onboarded-report-${filters.template}-${dateStamp}.${filters.format}`;
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

  private static async exportVerifiedReport(
    filters: StatusReportExportFilters
  ): Promise<{ filename: string; mimeType: string; buffer: Buffer; rowCount: number }> {
    const verifiedPredicate = this.buildVerifiedPredicate();

    const conditions: any[] = [];

    const userId = filters.pickedBy || filters.qualifierId;
    if (userId) {
      if (filters.claimsScope === 'current') {
        conditions.push({ pickedBy: userId });
      } else {
        conditions.push({
          $or: [
            { pickedBy: userId },
            { addedBy: userId },
            { 'statusHistory.changedBy': userId },
          ],
        });
      }
    }

    if (filters.category) {
      conditions.push(this.buildCategoryMatch(filters.category));
    }

    if (filters.gatedCommunityName) {
      conditions.push({ gatedCommunityName: this.buildExactCaseInsensitiveMatch(filters.gatedCommunityName) });
    }

    const locationMatch: any = {};
    this.applyLeadLocationFilters(locationMatch, filters);
    if (Object.keys(locationMatch).length > 0) {
      conditions.push(locationMatch);
    }

    if (!filters.allTime && filters.from && filters.to) {
      conditions.push({ createdAt: { $gte: filters.from, $lte: filters.to } });
    }

    conditions.push(verifiedPredicate);

    const matchQuery = conditions.length === 1 ? conditions[0] : { $and: conditions };

    const leads = await Lead.find(matchQuery).sort({ createdAt: -1 }).lean();

    const reportRows = leads.map((lead) => {
      const latestHistory = [...(lead.statusHistory || [])].sort(
        (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
      )[0];

      const base: Record<string, string> = {
        Date: this.formatIST(lead.createdAt),
        'Qualifier Name': this.textForSpreadsheet(lead.addedByName || lead.pickedByName || 'Unknown'),
        'Lead ID': this.textForSpreadsheet(lead.leadId),
        'Lead Name': this.textForSpreadsheet(lead.name),
        'Phone/Landline': this.textForSpreadsheet(lead.phone || lead.landline || ''),
        City: this.textForSpreadsheet(this.cityForExport(lead.city, lead.address)),
        Locality: this.textForSpreadsheet(lead.locality || ''),
        'Local Area': this.textForSpreadsheet(this.localAreaForExport(lead.city, lead.address)),
        'Gated Community': this.textForSpreadsheet(lead.gatedCommunityName || ''),
        Category: this.categoryLabelForExport(lead.primaryCategory || lead.primarySkill),
        'Current Status': this.labelForReport(latestHistory?.status || lead.status),
        'Status Reason': this.textForSpreadsheet(
          latestHistory?.statusReasonText || this.labelForReport(latestHistory?.statusReasonCode)
        ),
        'Callback Date': this.formatIST(latestHistory?.callbackAt),
        'Expected Onboarding Date': this.formatIST(latestHistory?.expectedOnboardingAt),
        'Last Updated At': this.formatIST(lead.updatedAt),
        'Last Updated By': this.textForSpreadsheet(
          lead.lastUpdatedByName || lead.lastUpdatedBy || latestHistory?.changedByName || latestHistory?.changedBy || ''
        ),
      };

      if (filters.template === 'detailed') {
        base.State = this.textForSpreadsheet(lead.state);
        base['Primary Category'] = this.textForSpreadsheet(lead.primaryCategory || lead.primarySkill);
        base['Secondary Category'] = this.textForSpreadsheet(lead.secondaryCategory || lead.secondarySkill);
        base.Source = this.textForSpreadsheet(lead.source);
        base['Source Details'] = this.textForSpreadsheet(lead.sourceDetails);
        base['Is Gated Community'] = lead.isGatedCommunity ? 'Yes' : 'No';
        base['Gated Community Name'] = this.textForSpreadsheet(lead.gatedCommunityName);
        base['Created At'] = this.formatIST(lead.createdAt);
        base['Updated At'] = this.formatIST(lead.updatedAt);
        if (filters.includeNotes) {
          base.Notes = this.textForSpreadsheet(latestHistory?.notes);
        }
        base['Is Duplicate'] = lead.isDuplicate ? 'Yes' : 'No';
        base.Blacklisted = lead.blacklisted ? 'Yes' : 'No';
      }

      return base;
    });

    const worksheet = XLSX.utils.json_to_sheet(reportRows);
    this.applyWorksheetLayout(worksheet, reportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Verified');

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `verified-report-${filters.template}-${dateStamp}.${filters.format}`;
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
    if (filters.city) {
      conditions.push(this.buildCityFilterMatch(filters.city));
    }
    if (filters.locality) {
      conditions.push(this.buildLocalityFilterMatch(filters.locality));
    }
    if (filters.localArea) {
      conditions.push(this.buildLocalAreaFilterMatch(filters.localArea));
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
        City: this.textForSpreadsheet(this.cityForExport(lead.city, lead.address)),
        Locality: this.textForSpreadsheet(lead.locality || ''),
        'Local Area': this.textForSpreadsheet(this.localAreaForExport(lead.city, lead.address)),
        'Gated Community': this.textForSpreadsheet(lead.gatedCommunityName || ''),
        'Added Date': this.formatIST(lead.createdAt),
        'Picked By': this.textForSpreadsheet(lead.pickedByName || ''),
        'Contact Status': this.contactStatusForExport(lead),
        'Registration Status': this.registrationStatusForExport(lead),
      };

      if (lead.email) row.Email = this.textForSpreadsheet(lead.email);
      if (lead.state) row.State = this.textForSpreadsheet(lead.state);
      if (lead.pincode) row.Pincode = this.textForSpreadsheet(lead.pincode);
      if (lead.isGatedCommunity) {
        row['Is Gated Community'] = 'Yes';
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
      if (has('locality')) {
        const locality = typeof data.locality === 'string' ? data.locality.trim() : '';
        if (locality) setData.locality = locality;
        else unsetData.locality = 1;
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
      if (has('primarySkill') || has('primaryCategory')) {
        const primarySkill = (
          typeof data.primaryCategory === 'string' ? data.primaryCategory : typeof data.primarySkill === 'string' ? data.primarySkill : ''
        ).trim();
        if (primarySkill) {
          setData.primarySkill = primarySkill;
          setData.primaryCategory = primarySkill;
        } else {
          unsetData.primarySkill = 1;
          unsetData.primaryCategory = 1;
        }
      }
      if (has('secondarySkill') || has('secondaryCategory')) {
        const secondarySkill = (
          typeof data.secondaryCategory === 'string'
            ? data.secondaryCategory
            : typeof data.secondarySkill === 'string'
              ? data.secondarySkill
              : ''
        ).trim();
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

      // Track who last edited this lead's fields
      if (data._updatedBy) {
        setData.lastUpdatedBy = data._updatedBy;
      }
      if (data._updatedByName) {
        setData.lastUpdatedByName = data._updatedByName;
      }

      const profileFieldKeys = new Set([
        'name',
        'phone',
        'landline',
        'email',
        'city',
        'locality',
        'state',
        'address',
        'pincode',
        'isGatedCommunity',
        'gatedCommunityName',
        'primarySkill',
        'primaryCategory',
        'secondarySkill',
        'secondaryCategory',
        'source',
        'sourceDetails',
        'skills',
      ]);
      const hasProfileFieldChange =
        Object.keys(setData).some((key) => profileFieldKeys.has(key)) || Object.keys(unsetData).length > 0;

      const buildFieldChanges = () => {
        const fieldsToTrack = [
          'name',
          'phone',
          'landline',
          'email',
          'city',
          'locality',
          'state',
          'address',
          'pincode',
          'isGatedCommunity',
          'gatedCommunityName',
          'primarySkill',
          'secondarySkill',
          'source',
          'sourceDetails',
          'skills',
        ];

        return fieldsToTrack.reduce((changes: Array<{ field: string; previous: any; current: any }>, field) => {
          const hasSet = Object.prototype.hasOwnProperty.call(setData, field);
          const hasUnset = Object.prototype.hasOwnProperty.call(unsetData, field);

          if (!hasSet && !hasUnset) return changes;

          const previous = (existingLead as any)[field];
          const current = hasSet ? (setData as any)[field] : undefined;
          const changed = hasSet
            ? JSON.stringify(previous) !== JSON.stringify(current)
            : previous !== undefined;

          if (changed) {
            changes.push({ field, previous, current });
          }

          return changes;
        }, []);
      };

      if (hasProfileFieldChange && data._updatedBy) {
        const editedAt = new Date();
        setData.lastFieldEditedAt = editedAt;
      }

      const fieldChanges = hasProfileFieldChange ? buildFieldChanges() : undefined;

      const updateQuery: any = {};
      if (Object.keys(setData).length > 0) updateQuery.$set = setData;
      if (Object.keys(unsetData).length > 0) updateQuery.$unset = unsetData;

      if (hasProfileFieldChange && data._updatedBy) {
        updateQuery.$push = {
          statusHistory: {
            status: existingLead.status,
            changedBy: data._updatedBy,
            changedByName: data._updatedByName,
            changedAt: new Date(),
            notes: 'Lead details updated',
            fieldChanges: fieldChanges?.length ? fieldChanges : undefined,
          },
        };
      }

      const lead = await Lead.findOneAndUpdate(
        { leadId },
        updateQuery,
        { new: true }
      ).lean();

      if (lead && hasProfileFieldChange && data._updatedBy) {
        await this.logActivity(
          leadId,
          'lead_update',
          'Lead profile details updated',
          data._updatedBy,
          data._updatedByName
        );
      }

      return lead ? (this.normalizeLeadData(lead) as ILead) : null;
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
      }

      if (finalStatus === 'contacted_not_lifted') {
        lead.attempts = data.attempts || undefined;
      } else {
        lead.attempts = undefined;
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
    const users = await AdminUser.find({ role: { $in: ['qualifier', 'onboarder'] }, status: 'active' }).lean();
    const now = new Date();

    const userLocations: Record<string, string> = {
      "Rahul Mehta": "Mumbai",
      "Priya Sharma": "Pune",
      "Anjali Nair": "Chennai",
      "Arjun Das": "Hyderabad",
      "Vikram Iyer": "Bangalore",
    };

    const registeredOnlyQuery = this.buildRegisteredOnlyPredicate();

    const userIds = users.flatMap(u => this.getAdminIdentityIds(u));

    // 1. Bulk aggregate addedBy (claims) - scoped to active user IDs for index scan
    const addedByAgg = await Lead.aggregate([
      { $match: { addedBy: { $in: userIds } } },
      { $group: { _id: '$addedBy', count: { $sum: 1 } } }
    ]);
    const addedByMap = new Map<string, number>();
    for (const item of addedByAgg) {
      if (item._id) addedByMap.set(String(item._id), item.count);
    }

    // 2. Bulk aggregate pickedBy (currentClaims) - scoped to active user IDs for index scan
    const pickedByAgg = await Lead.aggregate([
      { $match: { pickedBy: { $in: userIds } } },
      { $group: { _id: '$pickedBy', count: { $sum: 1 } } }
    ]);
    const pickedByMap = new Map<string, number>();
    for (const item of pickedByAgg) {
      if (item._id) pickedByMap.set(String(item._id), item.count);
    }

    // 3. Bulk fetch follow-up leads and aggregate stats in memory to avoid N+1 queries
    const followUpLeads = await Lead.find({
      $or: [
        { nextCallbackAt: { $exists: true, $ne: null } },
        { expectedOnboardingAt: { $exists: true, $ne: null } },
      ],
    }).lean();

    const followUpItems = followUpLeads.flatMap((lead) => {
      const itemsList: Array<{ dueType: 'callback' | 'onboarding'; dueAt: Date; changedBy?: string; attempts?: string }> = [];
      const history = Array.isArray(lead.statusHistory) ? lead.statusHistory : [];
      const latestHistoryEntry = [...history].sort(
        (a, b) => new Date(b?.changedAt || 0).getTime() - new Date(a?.changedAt || 0).getTime()
      )[0];
      const changedBy = latestHistoryEntry?.changedBy;

      if (lead.nextCallbackAt) {
        itemsList.push({
          dueType: 'callback',
          dueAt: new Date(lead.nextCallbackAt),
          changedBy,
          attempts: lead.attempts,
        });
      }
      if (lead.expectedOnboardingAt) {
        itemsList.push({
          dueType: 'onboarding',
          dueAt: new Date(lead.expectedOnboardingAt),
          changedBy,
          attempts: lead.attempts,
        });
      }
      return itemsList;
    });

    const followUpStatsMap = new Map<string, { total: number; overdue: number }>();
    for (const item of followUpItems) {
      if (!item.changedBy) continue;
      const key = item.changedBy;
      const current = followUpStatsMap.get(key) || { total: 0, overdue: 0 };
      current.total += 1;
      const isOverdue = item.dueAt < now && item.attempts !== 'max_reached';
      if (isOverdue) {
        current.overdue += 1;
      }
      followUpStatsMap.set(key, current);
    }

    // 4. Bulk fetch registered leads (scoped to active users) and calculate in memory to avoid N+1 queries
    const registeredLeads = await Lead.find({
      $and: [
        registeredOnlyQuery,
        {
          $or: [
            { pickedBy: { $in: userIds } },
            { addedBy: { $in: userIds } },
            { 'statusHistory.changedBy': { $in: userIds } },
          ],
        },
      ],
    }, { pickedBy: 1, addedBy: 1, statusHistory: 1 }).lean();

    const performanceList = users.map((user) => {
      const userId = user.userId;
      const identityIds = this.getAdminIdentityIds(user);
      const name = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
      const location = userLocations[name] || user.team || user.department || 'Headquarters';

      // Claims Count (Only leads added by them)
      let claims = 0;
      for (const id of identityIds) {
        claims += addedByMap.get(id) || 0;
      }

      if (user.role === 'qualifier') {
        return {
          userId,
          name,
          role: 'qualifier',
          location,
          claims,
          totalLeads: claims,
          overdue: 0,
        };
      } else {
        // Onboarder: Current Claims
        let currentClaims = 0;
        for (const id of identityIds) {
          currentClaims += pickedByMap.get(id) || 0;
        }

        // Onboarder: Follow-up stats
        let followUps = 0;
        let overdue = 0;
        for (const id of identityIds) {
          const stats = followUpStatsMap.get(id);
          if (stats) {
            followUps += stats.total;
            overdue += stats.overdue;
          }
        }

        // Onboarder: Registered (owned leads, not just touched)
        const idSet = new Set(identityIds);
        let registered = 0;
        for (const lead of registeredLeads) {
          const ownerId = lead.pickedBy || lead.addedBy;
          const isMatched = ownerId && idSet.has(String(ownerId));
          if (isMatched) {
            registered++;
          }
        }

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
    });

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

  /** Role-scoped lead counts for the dashboard — mirrors frontend searchLeads filters. */
  static async getDashboardSummary(params: {
    role: UserRole;
    userId?: string;
  }): Promise<DashboardSummary> {
    const { role, userId } = params;
    const isQualifier = role === 'qualifier';
    const isOnboarder = role === 'onboarder';
    const canViewRegistration =
      isOnboarder || role === 'lead_access_manager' || (isQualifier && !!userId);

    const totalFilters: SearchFilters = {};
    if (isQualifier && userId) totalFilters.addedBy = userId;
    if (isOnboarder && userId) totalFilters.pickedBy = userId;

    const interestedFilters: SearchFilters = { status: 'contacted_interested' };
    if (isQualifier && userId) interestedFilters.addedBy = userId;
    if (isOnboarder && userId) interestedFilters.pickedBy = userId;

    const notInterestedFilters: SearchFilters = { status: 'contacted_not_interested' };
    if (isQualifier && userId) notInterestedFilters.addedBy = userId;
    if (isOnboarder && userId) notInterestedFilters.pickedBy = userId;

    const approvedFilters: SearchFilters = { status: 'approved' };
    if (isOnboarder && userId) approvedFilters.pickedBy = userId;

    const registrationScopeOwner: SearchFilters = {};
    if (isOnboarder && userId) {
      registrationScopeOwner.ownerBy = userId;
    } else if (isQualifier && userId) {
      registrationScopeOwner.addedBy = userId;
    }

    const registrationScopeRegisteredCard: SearchFilters = {};
    if (isOnboarder && userId) {
      registrationScopeRegisteredCard.pickedBy = userId;
    } else if (isQualifier && userId) {
      registrationScopeRegisteredCard.addedBy = userId;
    }

    const countTasks: Array<Promise<void>> = [];
    const summary: DashboardSummary = {
      total: 0,
      approved: 0,
      interested: 0,
      notInterested: 0,
    };

    countTasks.push(
      this.countSearchLeads(totalFilters).then((n) => {
        summary.total = n;
      }),
      this.countSearchLeads(approvedFilters).then((n) => {
        summary.approved = n;
      }),
      this.countSearchLeads(interestedFilters).then((n) => {
        summary.interested = n;
      }),
      this.countSearchLeads(notInterestedFilters).then((n) => {
        summary.notInterested = n;
      }),
    );

    if (isOnboarder && userId) {
      countTasks.push(
        this.countSearchLeads({ addedBy: userId }).then((n) => {
          summary.myLeadsAdded = n;
        }),
      );
    }

    if (canViewRegistration) {
      countTasks.push(
        this.countSearchLeads({
          ...registrationScopeOwner,
          registrationStatus: 'not_registered',
        }).then((n) => {
          summary.notRegistered = n;
        }),
        this.countSearchLeads({
          ...registrationScopeRegisteredCard,
          registrationStatus: 'registered',
        }).then((n) => {
          summary.registered = n;
        }),
        this.countSearchLeads({
          ...registrationScopeOwner,
          registrationStatus: 'registered_verified',
        }).then((n) => {
          summary.registeredVerified = n;
        }),
      );
    }

    await Promise.all(countTasks);
    return summary;
  }

  /** Count-only variant of searchLeads — aligns performance metrics with list pages. */
  private static async countSearchLeads(filters: SearchFilters): Promise<number> {
    const { total } = await this.searchLeads({
      ...filters,
      page: 1,
      limit: 1,
    });
    return total;
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
    const currentClaims = await Lead.countDocuments({
      ...this.buildIdSelector('pickedBy', identityIds),
      ...(!filters.allTime && filters.from && filters.to ? { pickedAt: { $gte: filters.from, $lte: filters.to } } : {})
    });

    // Get ranking on team by claims (currentClaims for onboarder, claims for qualifier)
    const allUsers = await AdminUser.find({ role: user.role, status: 'active' }).lean();

    const fieldName = user.role === 'onboarder' ? 'pickedBy' : 'addedBy';
    const dateField = user.role === 'onboarder' ? 'pickedAt' : 'createdAt';

    const allUserIds = allUsers.flatMap(u => this.getAdminIdentityIds(u));

    const matchStage: any = {
      [fieldName]: { $in: allUserIds }
    };
    if (!filters.allTime && filters.from && filters.to) {
      matchStage[dateField] = { $gte: filters.from, $lte: filters.to };
    }

    const aggregations = await Lead.aggregate([
      { $match: matchStage },
      { $group: { _id: `$${fieldName}`, count: { $sum: 1 } } }
    ]);

    const claimsMap = new Map<string, number>();
    for (const item of aggregations) {
      if (item._id) {
        claimsMap.set(String(item._id), item.count);
      }
    }

    const allUsersClaims = allUsers.map((u) => {
      const scopedIds = this.getAdminIdentityIds(u);
      let totalClaims = 0;
      for (const id of scopedIds) {
        totalClaims += claimsMap.get(id) || 0;
      }
      return { userId: u.userId, claims: totalClaims };
    });
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
      const qualifierOwnerMatch = this.buildIdSelector('addedBy', identityIds);

      const editedDateFilter =
        !filters.allTime && filters.from && filters.to
          ? {
              $or: [
                { lastFieldEditedAt: { $gte: filters.from, $lte: filters.to } },
                {
                  lastFieldEditedAt: { $exists: false },
                  updatedAt: { $gte: filters.from, $lte: filters.to },
                },
              ],
            }
          : {};

      const editedLeads = await Lead.countDocuments({
        lastUpdatedBy: { $in: identityIds },
        ...editedDateFilter,
      });

      const totalLeadsInRange = filters.allTime
        ? claims
        : await Lead.countDocuments({
            ...qualifierOwnerMatch,
            createdAt: { $gte: filters.from!, $lte: filters.to! },
          });

      return {
        user: {
          userId,
          name,
          role: 'qualifier',
          location,
        },
        claims,
        totalLeads: filters.allTime ? claims : totalLeadsInRange,
        totalLeadsInRange,
        editedLeads,
        rankLabel,
        followUps: {
          total: 0,
          overdue: 0,
          dueToday: 0,
        },
        // Qualifier outcomes intentionally omitted — not shown on the UI
        outcomes: {}
      };
    } else {
      const followUpStats = await this.getFollowUpQueueStats(
        { followUpOwnerByAny: identityIds },
        !filters.allTime ? { from: filters.from, to: filters.to } : undefined
      );
      const totalFollowUps = !filters.allTime && followUpStats.rangeCount !== undefined
        ? followUpStats.rangeCount
        : followUpStats.totalFollowUps;
      const overdue = followUpStats.callbackOverdue + followUpStats.onboardingOverdue;
      const dueToday = followUpStats.callbackDueToday + followUpStats.onboardingDueToday;

      const ownerDateRange =
        !filters.allTime && filters.from && filters.to
          ? { startDate: filters.from, endDate: filters.to }
          : {};

      const ownerScopeFilters: SearchFilters = {
        ownerByAny: identityIds,
        strictOwner: false,
        ...ownerDateRange,
      };

      const interested = await this.countSearchLeads({
        ...ownerScopeFilters,
        status: 'contacted_interested',
      });

      const notInterested = await this.countSearchLeads({
        ...ownerScopeFilters,
        status: 'contacted_not_interested',
      });

      const registered = await this.countSearchLeads({
        ...ownerScopeFilters,
        registrationStatus: 'registered',
      });

      const verified = await this.countSearchLeads({
        ...ownerScopeFilters,
        registrationStatus: 'registered_verified',
      });

      const notRegistered = await this.countSearchLeads({
        ...ownerScopeFilters,
        registrationStatus: 'not_registered',
        ownerDateMode: 'owner',
      });

      const totalRegistered = registered + verified;
      const totalLeadsInRange = filters.allTime
        ? claims
        : await this.countSearchLeads({
            ...ownerScopeFilters,
            ownerDateMode: 'owner',
          });

      const editedDateFilter =
        !filters.allTime && filters.from && filters.to
          ? {
              $or: [
                { lastFieldEditedAt: { $gte: filters.from, $lte: filters.to } },
                {
                  lastFieldEditedAt: { $exists: false },
                  updatedAt: { $gte: filters.from, $lte: filters.to },
                },
              ],
            }
          : {};

      const editedLeads = await Lead.countDocuments({
        lastUpdatedBy: { $in: identityIds },
        ...editedDateFilter,
      });

      return {
        user: {
          userId,
          name,
          role: 'onboarder',
          location,
        },
        claims,
        totalLeads: filters.allTime ? claims : totalLeadsInRange,
        totalLeadsInRange,
        editedLeads,
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

