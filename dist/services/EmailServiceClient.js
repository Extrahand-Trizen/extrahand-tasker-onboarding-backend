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
    static getBaseUrl() {
        if (!this.baseUrl) {
            throw new Error('EMAIL_SERVICE_URL environment variable is required. Please set it in your .env file.');
        }
        return this.baseUrl;
    }
    /**
     * Send admin invite email
     * Note: Email is queued and sent asynchronously - response is immediate
     */
    static async sendAdminInviteEmail(email, role, inviteLink, expiresAt, team, department) {
        try {
            const response = await axios_1.default.post(`${this.getBaseUrl()}/api/v1/email/admin-invite`, { email, role, inviteLink, expiresAt, team, department }, {
                headers: {
                    'X-Service-Auth': this.serviceAuthToken,
                    'X-Service-Name': 'admin-service',
                    'Content-Type': 'application/json',
                },
                timeout: 5000, // Reduced timeout since response is immediate
            });
            // Handle new response format (queued emails)
            if (response.data.success && response.data.message) {
                logger_1.default.info('Admin invite email queued for sending', {
                    email,
                    role,
                    message: response.data.message,
                });
            }
            else if (response.data.success && response.data.messageId) {
                // Legacy format (if still supported)
                logger_1.default.info('Admin invite email sent successfully', {
                    email,
                    role,
                    messageId: response.data.messageId,
                });
            }
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
                error: error.response?.data?.error || error.message || 'Failed to queue email',
            };
        }
    }
    /**
     * Send account created email
     * Note: Email is queued and sent asynchronously - response is immediate
     */
    static async sendAccountCreatedEmail(email, name, phone) {
        try {
            const response = await axios_1.default.post(`${this.getBaseUrl()}/api/v1/email/account-created`, { email, name, phone }, {
                headers: {
                    'X-Service-Auth': this.serviceAuthToken,
                    'X-Service-Name': 'admin-service',
                    'Content-Type': 'application/json',
                },
                timeout: 5000, // Reduced timeout since response is immediate
            });
            // Handle new response format (queued emails)
            if (response.data.success && response.data.message) {
                logger_1.default.info('Account created email queued for sending', {
                    email,
                    name,
                    message: response.data.message,
                });
            }
            else if (response.data.success && response.data.messageId) {
                // Legacy format (if still supported)
                logger_1.default.info('Account created email sent successfully', {
                    email,
                    name,
                    messageId: response.data.messageId,
                });
            }
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
                error: error.response?.data?.error || error.message || 'Failed to queue email',
            };
        }
    }
    /**
     * Send generic email
     * Note: Email is queued and sent asynchronously - response is immediate
     */
    static async sendEmail(params) {
        try {
            const response = await axios_1.default.post(`${this.getBaseUrl()}/api/v1/email/send`, params, {
                headers: {
                    'X-Service-Auth': this.serviceAuthToken,
                    'X-Service-Name': 'admin-service',
                    'Content-Type': 'application/json',
                },
                timeout: 5000, // Reduced timeout since response is immediate
            });
            // Handle new response format (queued emails)
            if (response.data.success && response.data.message) {
                logger_1.default.info('Email queued for sending', {
                    to: params.to,
                    subject: params.subject,
                    message: response.data.message,
                });
            }
            return response.data;
        }
        catch (error) {
            logger_1.default.error('Email service error', {
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
    static async sendPasswordResetEmail(email, resetLink, name, expiresAt) {
        try {
            // Validate email service URL is configured
            if (!this.baseUrl) {
                const errorMsg = 'EMAIL_SERVICE_URL is not configured. Please set it in your .env file.';
                logger_1.default.error('Email service not configured', {
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
                logger_1.default.error('Invalid email address for password reset', {
                    email,
                    error: errorMsg,
                });
                return {
                    success: false,
                    error: errorMsg,
                };
            }
            logger_1.default.info('Queuing password reset email', {
                email,
                expiresAt: expiresAt?.toISOString(),
                emailServiceUrl: this.baseUrl,
            });
            const response = await axios_1.default.post(`${this.getBaseUrl()}/api/v1/email/password-reset`, { email, resetLink, name, expiresAt: expiresAt?.toISOString() }, {
                headers: {
                    'X-Service-Auth': this.serviceAuthToken,
                    'X-Service-Name': 'admin-service',
                    'Content-Type': 'application/json',
                },
                timeout: 5000, // Reduced timeout since response is immediate
            });
            if (!response.data || !response.data.success) {
                const errorMsg = response.data?.error || 'Email service returned unsuccessful response';
                logger_1.default.error('Email service returned error', {
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
                logger_1.default.info('Password reset email queued for sending', {
                    email,
                    message: response.data.message,
                    expiresAt: expiresAt?.toISOString(),
                });
            }
            else if (response.data.messageId) {
                // Legacy format (if still supported)
                logger_1.default.info('Password reset email sent successfully', {
                    email,
                    messageId: response.data.messageId,
                    expiresAt: expiresAt?.toISOString(),
                });
            }
            return response.data;
        }
        catch (error) {
            // Handle network errors
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                const errorMsg = `Email service is unreachable at ${this.baseUrl}. Please check if the email service is running.`;
                logger_1.default.error('Email service connection failed', {
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
                logger_1.default.error('Email service HTTP error', {
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
            logger_1.default.error('Failed to send password reset email', {
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
exports.EmailServiceClient = EmailServiceClient;
EmailServiceClient.baseUrl = env_1.env.EMAIL_SERVICE_URL;
EmailServiceClient.serviceAuthToken = env_1.env.SERVICE_AUTH_TOKEN;
//# sourceMappingURL=EmailServiceClient.js.map