"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.generateTokenPair = generateTokenPair;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const logger_1 = __importDefault(require("../config/logger"));
/**
 * Generate access token (short-lived: 15 minutes)
 */
function generateAccessToken(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_SECRET, {
        expiresIn: '15m',
        issuer: 'extrahand-admin-service',
        audience: 'extrahand-admin',
    });
}
/**
 * Generate refresh token (long-lived: 7 days)
 */
function generateRefreshToken(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_REFRESH_SECRET, {
        expiresIn: '7d',
        issuer: 'extrahand-admin-service',
        audience: 'extrahand-admin',
    });
}
/**
 * Verify access token
 */
function verifyAccessToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET, {
            issuer: 'extrahand-admin-service',
            audience: 'extrahand-admin',
        });
        return decoded;
    }
    catch (error) {
        logger_1.default.warn('Access token verification failed', { error: error.message });
        throw new Error('Invalid or expired access token');
    }
}
/**
 * Verify refresh token
 */
function verifyRefreshToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_REFRESH_SECRET, {
            issuer: 'extrahand-admin-service',
            audience: 'extrahand-admin',
        });
        return decoded;
    }
    catch (error) {
        logger_1.default.warn('Refresh token verification failed', { error: error.message });
        throw new Error('Invalid or expired refresh token');
    }
}
/**
 * Generate token pair (access + refresh)
 */
function generateTokenPair(user) {
    const accessToken = generateAccessToken({
        userId: user.userId,
        email: user.email,
        role: user.role,
        team: user.team,
        department: user.department,
    });
    const refreshToken = generateRefreshToken({
        userId: user.userId,
    });
    return { accessToken, refreshToken };
}
//# sourceMappingURL=jwt.js.map