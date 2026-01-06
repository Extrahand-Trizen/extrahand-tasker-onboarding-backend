"use strict";
/**
 * Compliance utilities for handling sensitive data (Aadhaar, PAN)
 * Following Aadhaar Act 2016 and data protection best practices
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskAadhaar = maskAadhaar;
exports.validateAadhaar = validateAadhaar;
exports.maskPAN = maskPAN;
exports.validatePAN = validatePAN;
exports.sanitizeAadhaarInput = sanitizeAadhaarInput;
exports.sanitizePANInput = sanitizePANInput;
/**
 * Mask Aadhaar number - Only show last 4 digits
 * Format: XXXX XXXX 1234
 * Compliance: Aadhaar Act 2016 - Never store/display full 12-digit number
 */
function maskAadhaar(aadhaarNumber) {
    if (!aadhaarNumber)
        return '';
    // Remove all spaces and non-digits
    const cleaned = aadhaarNumber.replace(/\D/g, '');
    // Must be exactly 12 digits
    if (cleaned.length !== 12) {
        throw new Error('Aadhaar number must be exactly 12 digits');
    }
    // Mask: XXXX XXXX 1234 (show only last 4 digits)
    return `XXXX XXXX ${cleaned.slice(-4)}`;
}
/**
 * Validate Aadhaar number format
 * Must be exactly 12 digits
 */
function validateAadhaar(aadhaarNumber) {
    if (!aadhaarNumber)
        return false;
    const cleaned = aadhaarNumber.replace(/\D/g, '');
    return /^\d{12}$/.test(cleaned);
}
/**
 * Mask PAN number - Show first 2 and last 4 characters
 * Format: ABXXXX1234
 * Note: PAN is less sensitive than Aadhaar, but still PII
 */
function maskPAN(panNumber) {
    if (!panNumber)
        return '';
    // Remove spaces and convert to uppercase
    const cleaned = panNumber.replace(/\s/g, '').toUpperCase();
    // Must be exactly 10 characters (5 letters + 4 digits + 1 letter)
    if (cleaned.length !== 10) {
        throw new Error('PAN number must be exactly 10 characters');
    }
    // Mask: ABXXXX1234 (show first 2 and last 4)
    return `${cleaned.slice(0, 2)}XXXX${cleaned.slice(-4)}`;
}
/**
 * Validate PAN number format
 * Format: ABCDE1234F (5 letters, 4 digits, 1 letter)
 */
function validatePAN(panNumber) {
    if (!panNumber)
        return false;
    const cleaned = panNumber.replace(/\s/g, '').toUpperCase();
    return /^[A-Z]{5}\d{4}[A-Z]{1}$/.test(cleaned);
}
/**
 * Sanitize Aadhaar input - remove spaces and validate
 */
function sanitizeAadhaarInput(input) {
    return input.replace(/\D/g, '').slice(0, 12);
}
/**
 * Sanitize PAN input - remove spaces, uppercase, validate
 */
function sanitizePANInput(input) {
    return input.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10);
}
//# sourceMappingURL=compliance.js.map