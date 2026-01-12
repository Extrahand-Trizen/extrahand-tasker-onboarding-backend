"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationServiceClient = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const logger_1 = __importDefault(require("../config/logger"));
class VerificationServiceClient {
    /**
     * Initiate Aadhaar verification (sends OTP to user's mobile)
     */
    static async initiateAadhaarVerification(userId, aadhaarNumber) {
        try {
            // ✅ Check if verification service URL is configured
            if (!this.baseUrl || this.baseUrl === 'http://localhost:4004') {
                logger_1.default.error('VERIFICATION_SERVICE_URL not configured', {
                    userId,
                    baseUrl: this.baseUrl
                });
                return {
                    success: false,
                    error: 'Verification service is not configured. Please set VERIFICATION_SERVICE_URL environment variable.'
                };
            }
            // ✅ Check if service auth token is configured
            if (!this.serviceAuthToken) {
                logger_1.default.error('SERVICE_AUTH_TOKEN not configured', {
                    userId
                });
                return {
                    success: false,
                    error: 'Service authentication token is not configured.'
                };
            }
            const response = await axios_1.default.post(`${this.baseUrl}/api/v1/verification/aadhaar/initiate`, {
                userId,
                aadhaarNumber,
                consentGiven: true,
                consent: {
                    given: true,
                    text: 'Admin initiated Aadhaar verification',
                    version: 'v1.0'
                }
            }, {
                headers: {
                    'X-Service-Auth': this.serviceAuthToken,
                    'X-Service-Name': 'admin-service',
                    'X-User-Id': userId,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            return {
                success: true,
                refId: response.data.data?.refId || response.data.data?.transactionId,
                transactionId: response.data.data?.transactionId || response.data.data?.refId,
                maskedAadhaar: response.data.data?.maskedAadhaar,
                testOtp: response.data.data?.testOtp // Sandbox only
            };
        }
        catch (error) {
            // ✅ Enhanced error logging
            logger_1.default.error('Failed to initiate Aadhaar verification', {
                userId,
                aadhaarNumber: aadhaarNumber ? `${aadhaarNumber.slice(0, 4)}****` : 'missing',
                baseUrl: this.baseUrl,
                error: error.message,
                errorCode: error.code,
                responseStatus: error.response?.status,
                responseData: error.response?.data,
                stack: error.stack
            });
            // ✅ Better error message extraction
            let errorMessage = 'Failed to initiate Aadhaar verification';
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                errorMessage = `Cannot connect to verification service at ${this.baseUrl}. Please check VERIFICATION_SERVICE_URL configuration.`;
            }
            else if (error.code === 'ETIMEDOUT') {
                errorMessage = 'Verification service request timed out. Please try again.';
            }
            else if (error.response?.status === 401 || error.response?.status === 403) {
                errorMessage = 'Authentication failed with verification service. Please check SERVICE_AUTH_TOKEN.';
            }
            else if (error.response?.data?.error) {
                errorMessage = error.response.data.error;
            }
            else if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            }
            else if (error.message) {
                errorMessage = error.message;
            }
            return {
                success: false,
                error: errorMessage
            };
        }
    }
    /**
     * Verify Aadhaar OTP
     */
    static async verifyAadhaarOTP(userId, refId, otp) {
        try {
            // ✅ Check if verification service URL is configured
            if (!this.baseUrl || this.baseUrl === 'http://localhost:4004') {
                logger_1.default.error('VERIFICATION_SERVICE_URL not configured', {
                    userId,
                    baseUrl: this.baseUrl
                });
                return {
                    success: false,
                    error: 'Verification service is not configured. Please set VERIFICATION_SERVICE_URL environment variable.'
                };
            }
            const response = await axios_1.default.post(`${this.baseUrl}/api/v1/verification/aadhaar/verify`, {
                userId,
                refId,
                otp
            }, {
                headers: {
                    'X-Service-Auth': this.serviceAuthToken,
                    'X-Service-Name': 'admin-service',
                    'X-User-Id': userId,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            return {
                success: true,
                verified: response.data.data?.status === 'verified',
                maskedAadhaar: response.data.data?.maskedAadhaar,
                verifiedData: response.data.data?.verifiedData
            };
        }
        catch (error) {
            // ✅ Enhanced error logging
            logger_1.default.error('Failed to verify Aadhaar OTP', {
                userId,
                refId,
                baseUrl: this.baseUrl,
                error: error.message,
                errorCode: error.code,
                responseStatus: error.response?.status,
                responseData: error.response?.data,
                stack: error.stack
            });
            // ✅ Better error message extraction
            let errorMessage = 'Failed to verify Aadhaar OTP';
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                errorMessage = `Cannot connect to verification service at ${this.baseUrl}. Please check VERIFICATION_SERVICE_URL configuration.`;
            }
            else if (error.code === 'ETIMEDOUT') {
                errorMessage = 'Verification service request timed out. Please try again.';
            }
            else if (error.response?.status === 401 || error.response?.status === 403) {
                errorMessage = 'Authentication failed with verification service. Please check SERVICE_AUTH_TOKEN.';
            }
            else if (error.response?.data?.error) {
                errorMessage = error.response.data.error;
            }
            else if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            }
            else if (error.message) {
                errorMessage = error.message;
            }
            return {
                success: false,
                error: errorMessage
            };
        }
    }
    /**
     * Verify PAN (direct, no OTP)
     */
    static async verifyPAN(userId, panNumber) {
        try {
            // ✅ Check if verification service URL is configured
            if (!this.baseUrl || this.baseUrl === 'http://localhost:4004') {
                logger_1.default.error('VERIFICATION_SERVICE_URL not configured', {
                    userId,
                    baseUrl: this.baseUrl
                });
                return {
                    success: false,
                    error: 'Verification service is not configured. Please set VERIFICATION_SERVICE_URL environment variable.'
                };
            }
            const response = await axios_1.default.post(`${this.baseUrl}/api/v1/verification/pan/verify`, {
                userId,
                panNumber,
                consent: {
                    given: true,
                    text: 'Admin initiated PAN verification',
                    version: 'v1.0'
                }
            }, {
                headers: {
                    'X-Service-Auth': this.serviceAuthToken,
                    'X-Service-Name': 'admin-service',
                    'X-User-Id': userId,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            return {
                success: true,
                verified: response.data.data?.status === 'verified',
                maskedPAN: response.data.data?.maskedPAN,
                verifiedData: response.data.data?.verifiedData
            };
        }
        catch (error) {
            // ✅ Enhanced error logging
            logger_1.default.error('Failed to verify PAN', {
                userId,
                panNumber: panNumber ? `${panNumber.slice(0, 2)}****${panNumber.slice(6)}` : 'missing',
                baseUrl: this.baseUrl,
                error: error.message,
                errorCode: error.code,
                responseStatus: error.response?.status,
                responseData: error.response?.data,
                stack: error.stack
            });
            // ✅ Better error message extraction
            let errorMessage = 'Failed to verify PAN';
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                errorMessage = `Cannot connect to verification service at ${this.baseUrl}. Please check VERIFICATION_SERVICE_URL configuration.`;
            }
            else if (error.code === 'ETIMEDOUT') {
                errorMessage = 'Verification service request timed out. Please try again.';
            }
            else if (error.response?.status === 401 || error.response?.status === 403) {
                errorMessage = 'Authentication failed with verification service. Please check SERVICE_AUTH_TOKEN.';
            }
            else if (error.response?.data?.error) {
                errorMessage = error.response.data.error;
            }
            else if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            }
            else if (error.message) {
                errorMessage = error.message;
            }
            return {
                success: false,
                error: errorMessage
            };
        }
    }
    /**
     * Verify Bank Account (direct)
     */
    static async verifyBankAccount(userId, accountNumber, ifsc, accountHolderName) {
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/api/v1/verification/bank/verify`, {
                userId,
                accountNumber,
                ifsc,
                accountHolderName,
                consent: {
                    given: true,
                    text: 'Admin initiated bank account verification',
                    version: 'v1.0'
                }
            }, {
                headers: {
                    'X-Service-Auth': this.serviceAuthToken,
                    'X-Service-Name': 'admin-service',
                    'X-User-Id': userId,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            return {
                success: true,
                verified: response.data.data?.status === 'verified',
                maskedBankAccount: response.data.data?.maskedBankAccount,
                verifiedData: response.data.data?.verifiedData
            };
        }
        catch (error) {
            logger_1.default.error('Failed to verify bank account', {
                userId,
                error: error.message,
                response: error.response?.data
            });
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to verify bank account'
            };
        }
    }
    /**
     * Check verification features availability
     */
    static async getAvailableFeatures() {
        try {
            const response = await axios_1.default.get(`${this.baseUrl}/api/v1/verification/features`, {
                headers: {
                    'X-Service-Auth': this.serviceAuthToken,
                    'X-Service-Name': 'admin-service',
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            return {
                success: true,
                features: response.data.features
            };
        }
        catch (error) {
            logger_1.default.error('Failed to get verification features', {
                error: error.message
            });
            return {
                success: false,
                error: error.message || 'Failed to get verification features'
            };
        }
    }
}
exports.VerificationServiceClient = VerificationServiceClient;
VerificationServiceClient.baseUrl = env_1.env.VERIFICATION_SERVICE_URL || 'http://localhost:4004';
VerificationServiceClient.serviceAuthToken = env_1.env.SERVICE_AUTH_TOKEN;
//# sourceMappingURL=VerificationServiceClient.js.map