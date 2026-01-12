"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailServiceClient = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const logger_1 = __importDefault(require("../config/logger"));
class EmailServiceClient {
    /**
     * Send admin invite email
     */
    static async sendAdminInviteEmail(email, role, inviteLink, expiresAt, team, department) {
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/api/v1/email/admin-invite`, { email, role, inviteLink, expiresAt, team, department }, {
                headers: {
                    'X-Service-Auth': this.serviceAuthToken,
                    'X-Service-Name': 'admin-service',
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            });
            logger_1.default.info('Admin invite email sent successfully', {
                email,
                role,
                messageId: response.data.messageId,
            });
            return response.data;
        }
        catch (error) {
            logger_1.default.error('Email service error (admin invite)', {
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
    static async sendAccountCreatedEmail(email, name, phone) {
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/api/v1/email/account-created`, { email, name, phone }, {
                headers: {
                    'X-Service-Auth': this.serviceAuthToken,
                    'X-Service-Name': 'admin-service',
                    'Content-Type': 'application/json',
                },
                timeout: 10000, // 10 second timeout
            });
            logger_1.default.info('Account created email sent successfully', {
                email,
                name,
                messageId: response.data.messageId,
            });
            return response.data;
        }
        catch (error) {
            logger_1.default.error('Email service error', {
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
    static async sendEmail(params) {
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/api/v1/email/send`, params, {
                headers: {
                    'X-Service-Auth': this.serviceAuthToken,
                    'X-Service-Name': 'admin-service',
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            });
            return response.data;
        }
        catch (error) {
            logger_1.default.error('Email service error', {
                error: error.message,
                response: error.response?.data,
            });
            return {
                success: false,
                error: error.response?.data?.error || error.message || 'Failed to send email',
            };
        }
    }
}
exports.EmailServiceClient = EmailServiceClient;
EmailServiceClient.baseUrl = process.env.EMAIL_SERVICE_URL || 'http://localhost:4007';
EmailServiceClient.serviceAuthToken = env_1.env.SERVICE_AUTH_TOKEN;
//# sourceMappingURL=EmailServiceClient.js.map