export interface ActivationResult {
    success: boolean;
    firebaseUid?: string;
    profileCreated?: boolean;
    error?: string;
}
export declare class ActivationService {
    /**
     * Activate a single lead (create Firebase user + Profile)
     * @param skipVerificationService If true, skips storing verification data (for quick onboarding Scenario B)
     */
    static activateLead(leadId: string, activatedBy: string, activatedByName?: string, role?: string, skipVerificationService?: boolean): Promise<ActivationResult>;
    /**
     * Bulk activate leads
     * @param skipVerificationService If true, skips storing verification data (for Scenario B)
     */
    static bulkActivateLeads(leadIds: string[], activatedBy: string, activatedByName?: string, role?: string, skipVerificationService?: boolean): Promise<{
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
     *
     * @param uid Firebase UID
     * @param data Verification data (aadhaar/pan/address)
     * @param adminInfo Optional admin information for tracking who verified
     * @param options Optional provider and verificationSource (defaults to admin_manual)
     */
    static storeVerificationData(uid: string, data: {
        aadhaarNumber?: string;
        panNumber?: string;
        addressDetails?: string;
    }, adminInfo?: {
        userId: string;
        userName: string;
        role: string;
    }, options?: {
        provider?: string;
        verificationSource?: string;
    }): Promise<void>;
    /**
     * Generate temporary password for new user
     */
    private static generateTempPassword;
}
//# sourceMappingURL=ActivationService.d.ts.map