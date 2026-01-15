"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordAuthController = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const AdminUser_1 = __importDefault(require("../models/AdminUser"));
const AdminInvite_1 = __importDefault(require("../models/AdminInvite"));
const jwt_1 = require("../utils/jwt");
const logger_1 = __importDefault(require("../config/logger"));
const env_1 = require("../config/env");
class PasswordAuthController {
    /**
     * Login with email and password
     * POST /api/v1/auth/login
     */
    static async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Email and password are required'
                });
            }
            // Find user by email
            const user = await AdminUser_1.default.findOne({
                email: email.toLowerCase(),
                status: 'active'
            });
            if (!user || !user.passwordHash) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }
            // Verify password
            const isValid = await bcrypt_1.default.compare(password, user.passwordHash);
            if (!isValid) {
                logger_1.default.warn('Failed login attempt', { email });
                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }
            // Update login tracking
            user.lastLoginAt = new Date();
            user.loginCount += 1;
            user.cleanupExpiredTokens();
            // Generate JWT tokens
            const { accessToken, refreshToken } = (0, jwt_1.generateTokenPair)({
                userId: user.userId,
                email: user.email,
                role: user.role,
                team: user.team,
                department: user.department,
            });
            // Store refresh token
            user.addRefreshToken(refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), req.headers['user-agent'], req.ip);
            await user.save();
            logger_1.default.info('Admin user logged in with password', {
                userId: user.userId,
                email: user.email,
            });
            return res.json({
                success: true,
                data: {
                    accessToken,
                    refreshToken,
                    user: {
                        userId: user.userId,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        team: user.team,
                        department: user.department,
                    },
                },
            });
        }
        catch (error) {
            logger_1.default.error('Login error', { error: error.message });
            return res.status(500).json({
                success: false,
                error: 'Login failed. Please try again.'
            });
        }
    }
    /**
     * Set password for invited user (accept invite)
     * POST /api/v1/auth/set-password
     */
    static async setPassword(req, res) {
        try {
            const { inviteToken, password, name } = req.body;
            if (!inviteToken || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Invite token and password are required'
                });
            }
            // Validate password strength
            if (password.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 8 characters'
                });
            }
            // Find invite
            const invite = await AdminInvite_1.default.findOne({
                token: inviteToken,
                status: 'pending'
            });
            if (!invite) {
                return res.status(404).json({
                    success: false,
                    error: 'Invalid or expired invite'
                });
            }
            // Check if expired
            if (invite.expiresAt < new Date()) {
                invite.status = 'expired';
                await invite.save();
                return res.status(400).json({
                    success: false,
                    error: 'Invite has expired. Please request a new invite.'
                });
            }
            // Check if user already exists
            const existingUser = await AdminUser_1.default.findOne({
                email: invite.email.toLowerCase()
            });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    error: 'An account with this email already exists'
                });
            }
            // Hash password
            const passwordHash = await bcrypt_1.default.hash(password, 10);
            // Create admin user
            // Explicitly exclude uid to avoid duplicate key error (uid is sparse unique)
            const adminUser = await AdminUser_1.default.create({
                email: invite.email.toLowerCase(),
                inviteEmail: invite.email.toLowerCase(),
                passwordHash,
                name: name?.trim() || invite.email.split('@')[0], // Use provided name or default from email
                role: invite.role,
                team: invite.team,
                department: invite.department,
                status: 'active',
                inviteId: invite.inviteId,
                joinedVia: 'invite',
                loginCount: 0,
                mfaEnabled: false,
                // uid is intentionally omitted - it's only for legacy Firebase users
            });
            // Mark invite as accepted
            invite.status = 'accepted';
            invite.usedBy = adminUser.userId;
            invite.usedByEmail = invite.email;
            invite.usedByName = adminUser.name;
            invite.usedAt = new Date();
            await invite.save();
            logger_1.default.info('Admin account created via invite', {
                userId: adminUser.userId,
                email: adminUser.email,
                role: adminUser.role,
                inviteId: invite.inviteId
            });
            return res.json({
                success: true,
                message: 'Account created successfully. You can now login.',
                data: {
                    email: adminUser.email,
                    name: adminUser.name,
                    role: adminUser.role
                }
            });
        }
        catch (error) {
            logger_1.default.error('Set password error', { error: error.message });
            return res.status(500).json({
                success: false,
                error: 'Failed to create account. Please try again.'
            });
        }
    }
    /**
     * Get current user info (requires JWT authentication)
     * GET /api/v1/auth/me
     */
    static async getCurrentUser(req, res) {
        try {
            const userId = req.admin?.userId;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated'
                });
            }
            const user = await AdminUser_1.default.findOne({ userId, status: 'active' });
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }
            return res.json({
                success: true,
                data: {
                    user: {
                        userId: user.userId,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        team: user.team,
                        department: user.department,
                        profilePhoto: user.profilePhoto,
                    }
                }
            });
        }
        catch (error) {
            logger_1.default.error('Get current user error', { error: error.message });
            return res.status(500).json({
                success: false,
                error: 'Failed to get user information'
            });
        }
    }
    /**
     * Refresh access token
     * POST /api/v1/auth/refresh
     */
    static async refreshToken(req, res) {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Refresh token is required'
                });
            }
            // Verify refresh token
            let decoded;
            try {
                decoded = jsonwebtoken_1.default.verify(refreshToken, env_1.env.JWT_REFRESH_SECRET, {
                    audience: 'extrahand-admin',
                    issuer: 'extrahand-admin-service'
                });
            }
            catch (error) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired refresh token'
                });
            }
            // Find user
            const user = await AdminUser_1.default.findOne({
                userId: decoded.userId,
                status: 'active'
            });
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'User not found'
                });
            }
            // Check if refresh token exists in user's tokens
            const tokenExists = user.refreshTokens.some((rt) => rt.token === refreshToken && rt.expiresAt > new Date());
            if (!tokenExists) {
                return res.status(401).json({
                    success: false,
                    error: 'Refresh token not found or expired'
                });
            }
            // Generate new access token
            const { accessToken } = (0, jwt_1.generateTokenPair)({
                userId: user.userId,
                email: user.email,
                role: user.role,
                team: user.team,
                department: user.department,
            });
            // Update last used time for refresh token
            const tokenIndex = user.refreshTokens.findIndex((rt) => rt.token === refreshToken);
            if (tokenIndex !== -1) {
                user.refreshTokens[tokenIndex].lastUsedAt = new Date();
                await user.save();
            }
            logger_1.default.info('Access token refreshed', { userId: user.userId });
            return res.json({
                success: true,
                data: {
                    accessToken
                }
            });
        }
        catch (error) {
            logger_1.default.error('Refresh token error', { error: error.message });
            return res.status(500).json({
                success: false,
                error: 'Failed to refresh token'
            });
        }
    }
    /**
     * Logout (invalidate refresh token)
     * POST /api/v1/auth/logout
     */
    static async logout(req, res) {
        try {
            const { refreshToken } = req.body;
            const userId = req.admin?.userId;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated'
                });
            }
            if (refreshToken) {
                // Remove the specific refresh token
                const user = await AdminUser_1.default.findOne({ userId });
                if (user) {
                    user.refreshTokens = user.refreshTokens.filter((rt) => rt.token !== refreshToken);
                    await user.save();
                }
            }
            logger_1.default.info('Admin user logged out', { userId });
            return res.json({
                success: true,
                message: 'Logged out successfully'
            });
        }
        catch (error) {
            logger_1.default.error('Logout error', { error: error.message });
            return res.status(500).json({
                success: false,
                error: 'Logout failed'
            });
        }
    }
}
exports.PasswordAuthController = PasswordAuthController;
//# sourceMappingURL=PasswordAuthController.js.map