import { ILead } from '../models/Lead';
export interface DuplicateCheckResult {
    isDuplicate: boolean;
    existingLead?: ILead;
    matchType?: 'phone' | 'name_city';
}
export declare class DuplicateCheckService {
    /**
     * Check if a phone number already exists in leads
     */
    static checkPhoneDuplicate(phone: string): Promise<DuplicateCheckResult>;
    /**
     * Check for duplicate by name and city (fuzzy match)
     */
    static checkNameCityDuplicate(name: string, city: string): Promise<DuplicateCheckResult>;
    /**
     * Comprehensive duplicate check
     */
    static checkDuplicate(phone: string, name?: string, city?: string): Promise<DuplicateCheckResult>;
    /**
     * Normalize phone number
     */
    static normalizePhone(phone: string): string;
    /**
     * Bulk check for duplicate phones (optimized - single query)
     * Returns a map of normalized phone -> existing lead for O(1) lookup
     */
    static checkPhonesBulk(phoneNumbers: string[]): Promise<Map<string, ILead>>;
    /**
     * Mark lead as duplicate
     */
    static markAsDuplicate(leadId: string, duplicateOf: string): Promise<void>;
}
//# sourceMappingURL=DuplicateCheckService.d.ts.map