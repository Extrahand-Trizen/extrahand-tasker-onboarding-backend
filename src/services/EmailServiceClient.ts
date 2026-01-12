import axios from 'axios';
import { env } from '../config/env';
import logger from '../config/logger';

export interface EmailSendRequest {
  email: string;
  name: string;
  phone?: string;
}

export interface EmailSendResponse {
  success: boolean;
  message?: string; // New: "Email queued for sending" message
  messageId?: string; // May not be present for queued emails
  error?: string;
}

export class EmailServiceClient {
  private static baseUrl = env.EMAIL_SERVICE_URL;
  private static serviceAuthToken = env.SERVICE_AUTH_TOKEN;

  private static getBaseUrl(): string {
    if (!this.baseUrl) {
      throw new Error('EMAIL_SERVICE_URL environment variable is required. Please set it in your .env file.');
    }
    return this.baseUrl;
  }

  /**
   * Send admin invite email
   * Note: Email is queued and sent asynchronously - response is immediate
   */
  static async sendAdminInviteEmail(
    email: string,
    role: string,
    inviteLink: string,
    expiresAt: Date,
    team?: string,
    department?: string
  ): Promise<EmailSendResponse> {
    try {
      const response = await axios.post(
        `${this.getBaseUrl()}/api/v1/email/admin-invite`,
        { email, role, inviteLink, expiresAt, team, department },
        {
          headers: {
            'X-Service-Auth': this.serviceAuthToken,
            'X-Service-Name': 'admin-service',
            'Content-Type': 'application/json',
          },
          timeout: 5000, // Reduced timeout since response is immediate
        }
      );

      // Handle new response format (queued emails)
      if (response.data.success && response.data.message) {
        logger.info('Admin invite email queued for sending', {
          email,
          role,
          message: response.data.message,
        });
      } else if (response.data.success && response.data.messageId) {
        // Legacy format (if still supported)
        logger.info('Admin invite email sent successfully', {
          email,
          role,
          messageId: response.data.messageId,
        });
      }

      return response.data;
    } catch (error: any) {
      logger.error('Email service error (admin invite)', {
        email,
        role,
        error: error.message,
        response: error.response?.data,
      });

      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to queue email',
      };
    }
  }

  /**
   * Send account created email
   * Note: Email is queued and sent asynchronously - response is immediate
   */
  static async sendAccountCreatedEmail(
    email: string,
    name: string,
    phone?: string
  ): Promise<EmailSendResponse> {
    try {
      const response = await axios.post(
        `${this.getBaseUrl()}/api/v1/email/account-created`,
        { email, name, phone },
        {
          headers: {
            'X-Service-Auth': this.serviceAuthToken,
            'X-Service-Name': 'admin-service',
            'Content-Type': 'application/json',
          },
          timeout: 5000, // Reduced timeout since response is immediate
        }
      );

      // Handle new response format (queued emails)
      if (response.data.success && response.data.message) {
        logger.info('Account created email queued for sending', {
          email,
          name,
          message: response.data.message,
        });
      } else if (response.data.success && response.data.messageId) {
        // Legacy format (if still supported)
        logger.info('Account created email sent successfully', {
          email,
          name,
          messageId: response.data.messageId,
        });
      }

      return response.data;
    } catch (error: any) {
      logger.error('Email service error', {
        email,
        name,
        error: error.message,
        response: error.response?.data,
      });

      // Don't throw - email failure shouldn't block account creation
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to queue email',
      };
    }
  }

  /**
   * Send generic email
   * Note: Email is queued and sent asynchronously - response is immediate
   */
  static async sendEmail(params: {
    to: string | string[];
    subject: string;
    template?: string;
    data?: Record<string, any>;
    html?: string;
    text?: string;
  }): Promise<EmailSendResponse> {
    try {
      const response = await axios.post(
        `${this.getBaseUrl()}/api/v1/email/send`,
        params,
        {
          headers: {
            'X-Service-Auth': this.serviceAuthToken,
            'X-Service-Name': 'admin-service',
            'Content-Type': 'application/json',
          },
          timeout: 5000, // Reduced timeout since response is immediate
        }
      );

      // Handle new response format (queued emails)
      if (response.data.success && response.data.message) {
        logger.info('Email queued for sending', {
          to: params.to,
          subject: params.subject,
          message: response.data.message,
        });
      }

      return response.data;
    } catch (error: any) {
      logger.error('Email service error', {
        error: error.message,
        response: error.response?.data,
      });

      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to queue email',
      };
    }
  }

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(
    email: string,
    resetLink: string,
    name?: string,
    expiresAt?: Date
  ): Promise<EmailSendResponse> {
    try {
      // Validate email service URL is configured
      if (!this.baseUrl) {
        const errorMsg = 'EMAIL_SERVICE_URL is not configured. Please set it in your .env file.';
        logger.error('Email service not configured', {
          email,
          error: errorMsg,
        });
        return {
          success: false,
          error: errorMsg,
        };
      }

      // Validate email format
      if (!email || !email.includes('@')) {
        const errorMsg = 'Invalid email address';
        logger.error('Invalid email address for password reset', {
          email,
          error: errorMsg,
        });
        return {
          success: false,
          error: errorMsg,
        };
      }

      logger.info('Queuing password reset email', {
        email,
        expiresAt: expiresAt?.toISOString(),
        emailServiceUrl: this.baseUrl,
      });

      const response = await axios.post(
        `${this.getBaseUrl()}/api/v1/email/password-reset`,
        { email, resetLink, name, expiresAt: expiresAt?.toISOString() },
        {
          headers: {
            'X-Service-Auth': this.serviceAuthToken,
            'X-Service-Name': 'admin-service',
            'Content-Type': 'application/json',
          },
          timeout: 5000, // Reduced timeout since response is immediate
        }
      );

      if (!response.data || !response.data.success) {
        const errorMsg = response.data?.error || 'Email service returned unsuccessful response';
        logger.error('Email service returned error', {
          email,
          error: errorMsg,
          response: response.data,
        });
        return {
          success: false,
          error: errorMsg,
        };
      }

      // Handle new response format (queued emails)
      if (response.data.message) {
        logger.info('Password reset email queued for sending', {
          email,
          message: response.data.message,
          expiresAt: expiresAt?.toISOString(),
        });
      } else if (response.data.messageId) {
        // Legacy format (if still supported)
        logger.info('Password reset email sent successfully', {
          email,
          messageId: response.data.messageId,
          expiresAt: expiresAt?.toISOString(),
        });
      }

      return response.data;
    } catch (error: any) {
      // Handle network errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        const errorMsg = `Email service is unreachable at ${this.baseUrl}. Please check if the email service is running.`;
        logger.error('Email service connection failed', {
          email,
          error: errorMsg,
          code: error.code,
          url: this.baseUrl,
        });
        return {
          success: false,
          error: errorMsg,
        };
      }

      // Handle HTTP errors
      if (error.response) {
        const errorMsg = error.response?.data?.error || `Email service returned status ${error.response.status}`;
        logger.error('Email service HTTP error', {
          email,
          error: errorMsg,
          status: error.response.status,
          response: error.response.data,
        });
        return {
          success: false,
          error: errorMsg,
        };
      }

      // Handle other errors
      const errorMsg = error.message || 'Failed to send password reset email';
      logger.error('Failed to send password reset email', {
        email,
        error: errorMsg,
        stack: error.stack,
      });

      return {
        success: false,
        error: errorMsg,
      };
    }
  }
}
