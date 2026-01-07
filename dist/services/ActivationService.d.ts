export interface ActivationResult {
    success: boolean;
    firebaseUid?: string;
    profileCreated?: boolean;
    error?: string;
}
export declare class ActivationService {
    /**
     * Activate a single lead (create Firebase user + Profile)
     */
    static activateLead(leadId: string, activatedBy: string, activatedByName?: string, role?: string): Promise<ActivationResult>;
    /**
     * Bulk activate leads
     */
    static bulkActivateLeads(leadIds: string[], activatedBy: string, activatedByName?: string, role?: string): Promise<{
        success: Array<{
            leadId: string;
            firebaseUid: string;
            profileCreated: boolean;
        }>;
        failed: Array<{
            leadId: string;
            error: string;
        }>;
    }>;
    /**
     * Store exact Aadhaar/PAN/Address data in verification service
     * Uses exact (unmasked) details entered during document verification
     * Made public to allow immediate updates when documents are verified for existing accounts
     */
    static storeVerificationData(uid: string, data: {
        aadhaarNumber?: string;
        panNumber?: string;
        addressDetails?: string;
    }): Promise<void>;
    /**
     * Generate temporary password for new user
     */
    private static generateTempPassword;
}
//# sourceMappingURL=ActivationService.d.ts.map