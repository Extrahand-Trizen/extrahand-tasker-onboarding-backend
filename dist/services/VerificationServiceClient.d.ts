export interface AadhaarVerificationResult {
    success: boolean;
    refId?: string;
    transactionId?: string;
    maskedAadhaar?: string;
    testOtp?: string;
    error?: string;
}
export interface AadhaarOTPVerificationResult {
    success: boolean;
    verified?: boolean;
    maskedAadhaar?: string;
    verifiedData?: {
        name?: string;
        gender?: string;
        yearOfBirth?: string;
        address?: {
            line1?: string;
            line2?: string;
            city?: string;
            state?: string;
            pincode?: string;
        };
        mobileHash?: string;
        photoLink?: string;
    };
    error?: string;
}
export interface PANVerificationResult {
    success: boolean;
    verified?: boolean;
    maskedPAN?: string;
    verifiedData?: {
        name?: string;
        panNumber?: string;
        status?: string;
    };
    error?: string;
}
export interface BankVerificationResult {
    success: boolean;
    verified?: boolean;
    maskedBankAccount?: string;
    verifiedData?: {
        accountHolderName?: string;
        bankName?: string;
        ifsc?: string;
        branch?: string;
        status?: string;
    };
    error?: string;
}
export declare class VerificationServiceClient {
    private static baseUrl;
    private static serviceAuthToken;
    /**
     * Initiate Aadhaar verification (sends OTP to user's mobile)
     */
    static initiateAadhaarVerification(userId: string, aadhaarNumber: string): Promise<AadhaarVerificationResult>;
    /**
     * Verify Aadhaar OTP
     */
    static verifyAadhaarOTP(userId: string, refId: string, otp: string): Promise<AadhaarOTPVerificationResult>;
    /**
     * Verify PAN (direct, no OTP)
     */
    static verifyPAN(userId: string, panNumber: string): Promise<PANVerificationResult>;
    /**
     * Verify Bank Account (direct)
     */
    static verifyBankAccount(userId: string, accountNumber: string, ifsc: string, accountHolderName: string): Promise<BankVerificationResult>;
    /**
     * Check verification features availability
     */
    static getAvailableFeatures(): Promise<{
        success: boolean;
        features?: {
            AADHAAR?: boolean;
            PAN?: boolean;
            BANK?: boolean;
            FACE?: boolean;
            LIVENESS?: boolean;
        };
        error?: string;
    }>;
}
//# sourceMappingURL=VerificationServiceClient.d.ts.map