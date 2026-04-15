export interface ConversionStatus {
    converted: boolean;
    platformUid?: string;
    isAadhaarVerified?: boolean;
    name?: string;
}
/**
 * Look up platform user by phone (for onboarding conversion status).
 * Calls user-service POST /api/v1/auth/user-by-phone with service auth.
 */
export declare function getConversionStatusByPhone(phone: string | undefined): Promise<ConversionStatus>;
//# sourceMappingURL=UserLookupService.d.ts.map