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
      logger.error('Failed to initiate Aadhaar verification', {
        userId,
        error: error.message,
        response: error.response?.data
      });
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to initiate Aadhaar verification'
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
      logger.error('Failed to verify Aadhaar OTP', {
        userId,
        refId,
        error: error.message,
        response: error.response?.data
      });
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to verify Aadhaar OTP'
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
      logger.error('Failed to verify PAN', {
        userId,
        error: error.message,
        response: error.response?.data
      });
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to verify PAN'
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
