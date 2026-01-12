"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exchangeCodeForTokens = exchangeCodeForTokens;
exports.decodeIdToken = decodeIdToken;
exports.getAuthorizationUrl = getAuthorizationUrl;
exports.isAllowedEmailDomain = isAllowedEmailDomain;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const logger_1 = __importDefault(require("../config/logger"));
/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code, redirectUri) {
    try {
        const response = await axios_1.default.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', new URLSearchParams({
            client_id: env_1.env.MICROSOFT_CLIENT_ID,
            client_secret: env_1.env.MICROSOFT_CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            scope: 'openid profile email',
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        return response.data;
    }
    catch (error) {
        logger_1.default.error('Failed to exchange code for tokens', {
            error: error.response?.data || error.message,
        });
        throw new Error('Failed to authenticate with Microsoft');
    }
}
/**
 * Decode ID token to get user info
 * Note: In production, you should verify the token signature
 */
function decodeIdToken(idToken) {
    try {
        // ID token is a JWT with 3 parts: header.payload.signature
        const parts = idToken.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid ID token format');
        }
        const payload = parts[1];
        const decodedPayload = Buffer.from(payload, 'base64').toString('utf-8');
        const userInfo = JSON.parse(decodedPayload);
        return {
            sub: userInfo.sub,
            name: userInfo.name,
            email: userInfo.email || userInfo.preferred_username,
            given_name: userInfo.given_name,
            family_name: userInfo.family_name,
            picture: userInfo.picture,
        };
    }
    catch (error) {
        logger_1.default.error('Failed to decode ID token', { error: error.message });
        throw new Error('Invalid ID token');
    }
}
/**
 * Get Microsoft OAuth authorization URL
 */
function getAuthorizationUrl(redirectUri, state) {
    const params = new URLSearchParams({
        client_id: env_1.env.MICROSOFT_CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: 'openid profile email',
        response_mode: 'query',
    });
    if (state) {
        params.append('state', state);
    }
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}
/**
 * Validate email domain
 */
function isAllowedEmailDomain(email) {
    const allowedDomains = [
        '@trizenventures.com',
        '@extrahand.in',
    ];
    return allowedDomains.some((domain) => email.toLowerCase().endsWith(domain));
}
//# sourceMappingURL=microsoftAuth.js.map