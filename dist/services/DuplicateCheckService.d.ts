import { ILead } from '../models/Lead';
export interface DuplicateCheckResult {
    isDuplicate: boolean;
    existingLead?: ILead;
    matchType?: 'phone' | 'name_city';
    sameCategory?: boolean;
}
export declare class DuplicateCheckService {
    /**
     * Check if a phone number already exists in leads
     */
    static checkPhoneDuplicate(phone: string): Promise<DuplicateCheckResult>;
    /**
     * Check if a landline number already exists in leads
     */
    static checkLandlineDuplicate(landline: string): Promise<DuplicateCheckResult>;
    /**
     * Check for duplicate by name and city (fuzzy match)
     */
    static checkNameCityDuplicate(name: string, city: string): Promise<DuplicateCheckResult>;
    /**
     * Comprehensive duplicate check (supports both phone and landline)
     */
    static checkDuplicate(phone?: string, landline?: string, name?: string, city?: string): Promise<DuplicateCheckResult>;
    /**
     * Normalize phone number
     */
    static normalizePhone(phone: string): string;
    /**
     * Normalize landline number
     */
    static normalizeLandline(landline: string): string;
    /**
     * Bulk check for duplicate phones (optimized - single query)
     * Returns a map of normalized phone -> existing lead for O(1) lookup
     */
    static checkPhonesBulk(phoneNumbers: string[]): Promise<Map<string, ILead>>;
    /**
     * Check if a phone number or landline already exists with the same category
     */
    static checkPhoneCategoryDuplicate(contact: string, primaryCategory: string, secondaryCategory?: string): Promise<DuplicateCheckResult>;
    /**
     * Check duplicate considering category (allows same person with different categories)
     * Supports both phone and landline
     */
    static checkDuplicateWithCategory(contact: string, primaryCategory: string, secondaryCategory?: string, name?: string, city?: string): Promise<DuplicateCheckResult>;
    /**
     * Bulk check for duplicate phones with categories (optimized - single query)
     * Returns a map of normalized phone -> existing leads array for O(1) lookup
     */
    static checkPhonesBulkWithCategories(contacts: string[], categories?: Map<string, {
        primary: string;
        secondary?: string;
    }>): Promise<Map<string, ILead[]>>;
    /**
     * Mark lead as duplicate
     */
    static markAsDuplicate(leadId: string, duplicateOf: string): Promise<void>;
}
//# sourceMappingURL=DuplicateCheckService.d.ts.map