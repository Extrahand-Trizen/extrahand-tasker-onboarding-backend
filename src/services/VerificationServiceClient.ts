import axios from 'axios';
import { env } from '../config/env';
import logger from '../config/logger';

export interface AadhaarVerificationResult {
  success: boolean;
  refId?: string;
  transactionId?: string;
  maskedAadhaar?: string;
  testOtp?: string; // In sandbox mode
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

export class VerificationServiceClient {
  private static baseUrl = env.VERIFICATION_SERVICE_URL || 'http://localhost:4004';
  private static serviceAuthToken = env.SERVICE_AUTH_TOKEN;

  /**
   * Initiate Aadhaar verification (sends OTP to user's mobile)
   */
  static async initiateAadhaarVerification(
    userId: string,
    aadhaarNumber: string
  ): Promise<AadhaarVerificationResult> {
    try {
      // ✅ Check if verification service URL is configured
      if (!this.baseUrl || this.baseUrl === 'http://localhost:4004') {
        logger.error('VERIFICATION_SERVICE_URL not configured', {
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
        logger.error('SERVICE_AUTH_TOKEN not configured', {
          userId
        });
        return {
          success: false,
          error: 'Service authentication token is not configured.'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/api/v1/verification/aadhaar/initiate`,
        {
          userId,
          aadhaarNumber,
          consentGiven: true,
          consent: {
            given: true,
            text: 'Admin initiated Aadhaar verification',
            version: 'v1.0'
          }
        },
        {
          headers: {
            'X-Service-Auth': this.serviceAuthToken,
            'X-Service-Name': 'admin-service',
            'X-User-Id': userId,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        success: true,
        refId: response.data.data?.refId || response.data.data?.transactionId,
        transactionId: response.data.data?.transactionId || response.data.data?.refId,
        maskedAadhaar: response.data.data?.maskedAadhaar,
        testOtp: response.data.data?.testOtp // Sandbox only
      };
    } catch (error: any) {
      // ✅ Enhanced error logging
      logger.error('Failed to initiate Aadhaar verification', {
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
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Verification service request timed out. Please try again.';
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        errorMessage = 'Authentication failed with verification service. Please check SERVICE_AUTH_TOKEN.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
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
  static async verifyAadhaarOTP(
    userId: string,
    refId: string,
    otp: string
  ): Promise<AadhaarOTPVerificationResult> {
    try {
      // ✅ Check if verification service URL is configured
      if (!this.baseUrl || this.baseUrl === 'http://localhost:4004') {
        logger.error('VERIFICATION_SERVICE_URL not configured', {
          userId,
          baseUrl: this.baseUrl
        });
        return {
          success: false,
          error: 'Verification service is not configured. Please set VERIFICATION_SERVICE_URL environment variable.'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/api/v1/verification/aadhaar/verify`,
        {
          userId,
          refId,
          otp
        },
        {
          headers: {
            'X-Service-Auth': this.serviceAuthToken,
            'X-Service-Name': 'admin-service',
            'X-User-Id': userId,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        success: true,
        verified: response.data.data?.status === 'verified',
        maskedAadhaar: response.data.data?.maskedAadhaar,
        verifiedData: response.data.data?.verifiedData
      };
    } catch (error: any) {
      // ✅ Enhanced error logging
      logger.error('Failed to verify Aadhaar OTP', {
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
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Verification service request timed out. Please try again.';
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        errorMessage = 'Authentication failed with verification service. Please check SERVICE_AUTH_TOKEN.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
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
  static async verifyPAN(
    userId: string,
    panNumber: string
  ): Promise<PANVerificationResult> {
    try {
      // ✅ Check if verification service URL is configured
      if (!this.baseUrl || this.baseUrl === 'http://localhost:4004') {
        logger.error('VERIFICATION_SERVICE_URL not configured', {
          userId,
          baseUrl: this.baseUrl
        });
        return {
          success: false,
          error: 'Verification service is not configured. Please set VERIFICATION_SERVICE_URL environment variable.'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/api/v1/verification/pan/verify`,
        {
          userId,
          panNumber,
          consent: {
            given: true,
            text: 'Admin initiated PAN verification',
            version: 'v1.0'
          }
        },
        {
          headers: {
            'X-Service-Auth': this.serviceAuthToken,
            'X-Service-Name': 'admin-service',
            'X-User-Id': userId,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        success: true,
        verified: response.data.data?.status === 'verified',
        maskedPAN: response.data.data?.maskedPAN,
        verifiedData: response.data.data?.verifiedData
      };
    } catch (error: any) {
      // ✅ Enhanced error logging
      logger.error('Failed to verify PAN', {
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
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Verification service request timed out. Please try again.';
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        errorMessage = 'Authentication failed with verification service. Please check SERVICE_AUTH_TOKEN.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
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
  static async verifyBankAccount(
    userId: string,
    accountNumber: string,
    ifsc: string,
    accountHolderName: string
  ): Promise<BankVerificationResult> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/verification/bank/verify`,
        {
          userId,
          accountNumber,
          ifsc,
          accountHolderName,
          consent: {
            given: true,
            text: 'Admin initiated bank account verification',
            version: 'v1.0'
          }
        },
        {
          headers: {
            'X-Service-Auth': this.serviceAuthToken,
            'X-Service-Name': 'admin-service',
            'X-User-Id': userId,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        success: true,
        verified: response.data.data?.status === 'verified',
        maskedBankAccount: response.data.data?.maskedBankAccount,
        verifiedData: response.data.data?.verifiedData
      };
    } catch (error: any) {
      logger.error('Failed to verify bank account', {
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
  static async getAvailableFeatures(): Promise<{
    success: boolean;
    features?: {
      AADHAAR?: boolean;
      PAN?: boolean;
      BANK?: boolean;
      FACE?: boolean;
      LIVENESS?: boolean;
    };
    error?: string;
  }> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/v1/verification/features`,
        {
          headers: {
            'X-Service-Auth': this.serviceAuthToken,
            'X-Service-Name': 'admin-service',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return {
        success: true,
        features: response.data.features
      };
    } catch (error: any) {
      logger.error('Failed to get verification features', {
        error: error.message
      });
      return {
        success: false,
        error: error.message || 'Failed to get verification features'
      };
    }
  }
}
