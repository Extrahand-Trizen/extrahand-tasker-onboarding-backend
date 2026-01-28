import { LeadSource } from "../models/Lead";
import { IBulkImport } from "../models/BulkImport";
export interface BulkLeadImportRow {
    name: string;
    phone?: string;
    landline?: string;
    email?: string;
    city: string;
    state: string;
    address: string;
    pincode?: string;
    primaryCategory?: string;
    primarySkill?: string;
    secondaryCategory?: string;
    experienceLevel?: "beginner" | "intermediate" | "experienced";
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
    updatedLeadIds?: string[];
}
export interface ProgressCallback {
    (progress: number, message: string): void;
}
export declare class BulkLeadImportService {
    /**
     * Parse CSV file
     */
    /**
     * Map human-readable skill names to enum values
     */
    static mapSkillToEnum(skill: string): string;
    /**
     * Parse CSV file using streaming parser (memory efficient)
     * @param fileBuffer - CSV file buffer
     * @param defaultPrimaryCategory - Default primary category if not in CSV
     * @param defaultSecondaryCategory - Default secondary category if not in CSV
     * @param progressCallback - Optional callback for progress updates
     * @returns Promise resolving to array of parsed rows
     */
    static parseCSV(fileBuffer: Buffer, defaultPrimaryCategory?: string, defaultSecondaryCategory?: string, progressCallback?: ProgressCallback): Promise<BulkLeadImportRow[]>;
    /**
     * Parse Excel file (.xls, .xlsx)
     */
    static parseExcel(fileBuffer: Buffer, defaultPrimaryCategory?: string, defaultSecondaryCategory?: string, progressCallback?: ProgressCallback): Promise<BulkLeadImportRow[]>;
    /**
     * Parse file based on extension (CSV or Excel)
     */
    static parseFile(fileBuffer: Buffer, fileName: string, defaultPrimaryCategory?: string, defaultSecondaryCategory?: string, progressCallback?: ProgressCallback): Promise<BulkLeadImportRow[]>;
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
            landline?: string;
            email?: string;
            city: string;
            state: string;
            primaryCategory: string;
            secondaryCategory: string;
            experienceLevel?: string;
            status: "valid" | "invalid" | "warning";
            errors: string[];
            isDuplicateInFile: boolean;
            isDuplicateInDb: boolean;
            isDifferentCategory?: boolean;
            duplicateLeadId?: string;
            existingPrimaryCategory?: string;
            existingSecondaryCategory?: string;
        }>;
        summary: {
            total: number;
            valid: number;
            invalid: number;
            duplicatesInFile: number;
            duplicatesInDb: number;
            differentCategory: number;
        };
    }>;
    /**
     * Bulk import leads from CSV
     * ✅ Idempotent: Same file uploaded twice returns existing result
     * ✅ Concurrent-safe: Uses MongoDB transactions and atomic operations
     * ✅ Efficient: Uses bulk operations for better performance
     */
    static bulkImportLeads(fileBuffer: Buffer, fileName: string, userId: string, // Changed from adminUid to userId (works for any role)
    adminName?: string, adminEmail?: string, adminRole?: "qualifier" | "onboarder" | "lead_access_manager", source?: LeadSource, defaultPrimaryCategory?: string, defaultSecondaryCategory?: string, progressCallback?: ProgressCallback): Promise<BulkLeadImportResult>;
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
        role?: "qualifier" | "onboarder" | "lead_access_manager";
        createdByEmail?: string;
        createdByName?: string;
        from?: Date;
        to?: Date;
        status?: "pending" | "processing" | "completed" | "failed";
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
     * Get comprehensive import analytics
     */
    static getImportAnalytics(): Promise<{
        uploadsByUser: Array<{
            userId: string;
            userName: string;
            userRole: string;
            totalUploads: number;
            totalLeads: number;
            successRate: number;
            avgLeadsPerUpload: number;
        }>;
        uniqueVsDuplicate: {
            uniqueLeads: number;
            duplicateLeads: number;
            updatedLeads: number;
        };
        statusDistribution: Array<{
            status: string;
            count: number;
        }>;
        roleBreakdown: Array<{
            role: string;
            totalUploads: number;
            totalLeads: number;
            successRate: number;
        }>;
        uploadsOverTime: Array<{
            date: string;
            uploads: number;
            leads: number;
        }>;
        summaryMetrics: {
            totalImports: number;
            totalLeadsImported: number;
            totalUniqueLeads: number;
            totalDuplicates: number;
            avgSuccessRate: number;
            totalUploaders: number;
        };
        topUploaders: Array<{
            userId: string;
            userName: string;
            totalLeads: number;
            successRate: number;
        }>;
        qualityMetrics: {
            avgDuplicateRate: number;
            avgSuccessRate: number;
            avgRowsPerUpload: number;
            largestUpload: number;
        };
    }>;
    /**
     * Get import details
     */
    static getImportDetails(importId: string): Promise<IBulkImport>;
}
//# sourceMappingURL=BulkLeadImportService.d.ts.map