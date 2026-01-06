export interface ParsedUser {
    operation?: "create" | "update" | "delete";
    uid?: string;
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    primaryCategory?: string;
    primarySkill?: string;
    secondaryCategory?: string;
    secondarySkill?: string;
    experienceLevel?: string;
    yearsOfExperience?: number;
    workingDays?: string;
    preferredTimeSlot?: string;
    source?: string;
    agentCampaignId?: string;
    skillsList?: string;
    isActive?: boolean;
    reason?: string;
}
export interface BulkUploadResult {
    importId: string;
    operation: "create" | "update" | "delete" | "mixed";
    success: number;
    failed: number;
    errors: Array<{
        row: number;
        uid?: string;
        phone?: string;
        error: string;
    }>;
    importedLeadIds: string[];
    importedUserIds: string[];
    updatedUserIds?: string[];
    deletedUserIds?: string[];
}
export declare class BulkUploadService {
    /**
     * Parse CSV/Excel file
     */
    static parseFile(buffer: Buffer, fileName: string, defaultPrimaryCategory?: string, defaultSecondaryCategory?: string): ParsedUser[];
    /**
     * Normalize records to ParsedUser format
     */
    private static normalizeRecords;
    /**
     * Validate parsed users based on operation type
     */
    static validateUsers(users: ParsedUser[]): {
        isValid: boolean;
        errors: string[];
    };
    /**
     * Process bulk operations (create, update, delete) - Optimized with Firebase and MongoDB bulk operations
     */
    static processBulkUpload(fileBuffer: Buffer, fileName: string, adminUid: string, defaultPrimaryCategory?: string, defaultSecondaryCategory?: string): Promise<BulkUploadResult>;
    /**
     * Process bulk creates - Creates leads + Firebase users + MongoDB profiles
     * OPTIMIZED: Uses bulk duplicate checks to minimize database queries and API calls
     */
    private static processCreates;
    /**
     * Process bulk updates
     */
    private static processUpdates;
    /**
     * Process bulk deletes
     */
    private static processDeletes;
    private static isValidPhone;
}
//# sourceMappingURL=BulkUploadService.d.ts.map