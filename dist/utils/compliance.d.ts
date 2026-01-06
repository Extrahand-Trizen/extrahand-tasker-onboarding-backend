/**
 * Compliance utilities for handling sensitive data (Aadhaar, PAN)
 * Following Aadhaar Act 2016 and data protection best practices
 */
/**
 * Mask Aadhaar number - Only show last 4 digits
 * Format: XXXX XXXX 1234
 * Compliance: Aadhaar Act 2016 - Never store/display full 12-digit number
 */
export declare function maskAadhaar(aadhaarNumber: string): string;
/**
 * Validate Aadhaar number format
 * Must be exactly 12 digits
 */
export declare function validateAadhaar(aadhaarNumber: string): boolean;
/**
 * Mask PAN number - Show first 2 and last 4 characters
 * Format: ABXXXX1234
 * Note: PAN is less sensitive than Aadhaar, but still PII
 */
export declare function maskPAN(panNumber: string): string;
/**
 * Validate PAN number format
 * Format: ABCDE1234F (5 letters, 4 digits, 1 letter)
 */
export declare function validatePAN(panNumber: string): boolean;
/**
 * Sanitize Aadhaar input - remove spaces and validate
 */
export declare function sanitizeAadhaarInput(input: string): string;
/**
 * Sanitize PAN input - remove spaces, uppercase, validate
 */
export declare function sanitizePANInput(input: string): string;
//# sourceMappingURL=compliance.d.ts.map