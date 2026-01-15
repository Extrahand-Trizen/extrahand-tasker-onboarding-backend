import { LeadSource } from '../models/Lead';
import { IBulkImport } from '../models/BulkImport';
export interface BulkLeadImportRow {
    name: string;
    phone: string;
    email?: string;
    city: string;
    state: string;
    address: string;
    pincode?: string;
    primaryCategory?: string;
    primarySkill?: string;
    secondaryCategory?: string;
    experienceLevel?: 'beginner' | 'intermediate' | 'experienced';
    yearsOfExperience?: number;
    workingDays?: string;
    preferredTimeSlot?: string;
    source: LeadSource;
    sourceDetails?: string;
}
export interface BulkLeadImportResult {
    importId: string;
    totalRows: number;
    successCount: number;
    failedCount: number;
    errors: Array<{
        row: number;
        phone?: string;
        error: string;
    }>;
    importedLeadIds: string[];
}
export declare class BulkLeadImportService {
    /**
     * Parse CSV file
     */
    /**
     * Map human-readable skill names to enum values
     */
    static mapSkillToEnum(skill: string): string;
    static parseCSV(fileBuffer: Buffer, defaultPrimaryCategory?: string, defaultSecondaryCategory?: string): BulkLeadImportRow[];
    /**
     * Validate import row
     * @param row - The row to validate
     * @param rowNumber - Row number for error reporting
     * @param defaultPrimaryCategory - Default primary category if not in CSV
     * @param defaultSecondaryCategory - Default secondary category if not in CSV
     */
    static validateRow(row: BulkLeadImportRow, rowNumber: number, defaultPrimaryCategory?: string, defaultSecondaryCategory?: string): {
        valid: boolean;
        error?: string;
    };
    /**
     * Preview bulk import (validation + duplicate check, no records created)
     */
    static previewBulkImport(fileBuffer: Buffer, fileName: string, defaultPrimaryCategory?: string, defaultSecondaryCategory?: string): Promise<{
        rows: Array<{
            rowNumber: number;
            name: string;
            phone: string;
            email?: string;
            city: string;
            state: string;
            primaryCategory: string;
            secondaryCategory: string;
            experienceLevel?: string;
            status: "valid" | "invalid";
            errors: string[];
            isDuplicateInFile: boolean;
            isDuplicateInDb: boolean;
            duplicateLeadId?: string;
        }>;
        summary: {
            total: number;
            valid: number;
            invalid: number;
            duplicatesInFile: number;
            duplicatesInDb: number;
        };
    }>;
    /**
     * Bulk import leads from CSV
     * ✅ Idempotent: Same file uploaded twice returns existing result
     * ✅ Concurrent-safe: Uses MongoDB transactions and atomic operations
     * ✅ Efficient: Uses bulk operations for better performance
     */
    static bulkImportLeads(fileBuffer: Buffer, fileName: string, userId: string, // Changed from adminUid to userId (works for any role)
    adminName?: string, adminEmail?: string, adminRole?: 'qualifier' | 'onboarder' | 'lead_access_manager', source?: LeadSource, defaultPrimaryCategory?: string, defaultSecondaryCategory?: string): Promise<BulkLeadImportResult>;
    /**
     * Generate CSV template for lead import
     * If categories are provided, they will be pre-filled in the template (or columns removed)
     */
    static generateTemplate(primaryCategory?: string, secondaryCategory?: string): string;
    /**
     * Get import history with filters
     * ✅ Efficient: Uses indexes and pagination
     * ✅ Concurrent-safe: Read-only queries
     */
    static getImportHistory(filters?: {
        userId?: string;
        role?: 'qualifier' | 'onboarder' | 'lead_access_manager';
        createdByEmail?: string;
        createdByName?: string;
        from?: Date;
        to?: Date;
        status?: 'pending' | 'processing' | 'completed' | 'failed';
        page?: number;
        limit?: number;
    }): Promise<{
        imports: IBulkImport[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    /**
     * Get import details
     */
    static getImportDetails(importId: string): Promise<IBulkImport>;
}
//# sourceMappingURL=BulkLeadImportService.d.ts.map