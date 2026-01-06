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
    primarySkill: string;
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
    static parseCSV(fileBuffer: Buffer): BulkLeadImportRow[];
    /**
     * Validate import row
     */
    static validateRow(row: BulkLeadImportRow, rowNumber: number): {
        valid: boolean;
        error?: string;
    };
    /**
     * Bulk import leads from CSV
     */
    static bulkImportLeads(fileBuffer: Buffer, fileName: string, adminUid: string, adminName?: string, source?: LeadSource): Promise<BulkLeadImportResult>;
    /**
     * Generate CSV template for lead import
     */
    static generateTemplate(): string;
    /**
     * Get import history
     */
    static getImportHistory(adminUid?: string, page?: number, limit?: number): Promise<{
        imports: {
            importId: any;
            fileName: any;
            totalRows: any;
            successCount: any;
            failedCount: any;
            status: any;
            operationType: any;
            createdAt: any;
            completedAt: any;
        }[];
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