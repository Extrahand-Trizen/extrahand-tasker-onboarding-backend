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
  messageId?: string;
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
          timeout: 10000,
        }
      );

      logger.info('Admin invite email sent successfully', {
        email,
        role,
        messageId: response.data.messageId,
      });

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
        error: error.response?.data?.error || error.message || 'Failed to send email',
      };
    }
  }

  /**
   * Send account created email
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
          timeout: 10000, // 10 second timeout
        }
      );

      logger.info('Account created email sent successfully', {
        email,
        name,
        messageId: response.data.messageId,
      });

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
        error: error.response?.data?.error || error.message || 'Failed to send email',
      };
    }
  }

  /**
   * Send generic email
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
          timeout: 10000,
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Email service error', {
        error: error.message,
        response: error.response?.data,
      });

      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to send email',
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
      const response = await axios.post(
        `${this.getBaseUrl()}/api/v1/email/password-reset`,
        { email, resetLink, name, expiresAt: expiresAt?.toISOString() },
        {
          headers: {
            'X-Service-Auth': this.serviceAuthToken,
            'X-Service-Name': 'admin-service',
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      logger.info('Password reset email sent successfully', {
        email,
        messageId: response.data.messageId,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send password reset email', {
        email,
        error: error.message,
        response: error.response?.data,
      });

      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to send password reset email',
      };
    }
  }
}
