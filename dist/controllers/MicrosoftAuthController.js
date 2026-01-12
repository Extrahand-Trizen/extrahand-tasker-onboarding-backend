"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicrosoftAuthController = void 0;
const AdminUser_1 = __importDefault(require("../models/AdminUser"));
const AdminInvite_1 = __importDefault(require("../models/AdminInvite"));
const logger_1 = __importDefault(require("../config/logger"));
const env_1 = require("../config/env");
const microsoftAuth_1 = require("../utils/microsoftAuth");
const jwt_1 = require("../utils/jwt");
class MicrosoftAuthController {
    /**
     * Initiate Microsoft OAuth flow
     * GET /api/v1/auth/microsoft
     */
    static async initiateLogin(req, res) {
        try {
            const { inviteToken, returnTo } = req.query;
            // Build state parameter to pass invite token
            let state = '';
            if (inviteToken) {
                state = `invite_${inviteToken}`;
            }
            else if (returnTo) {
                state = `return_${returnTo}`;
            }
            const authUrl = (0, microsoftAuth_1.getAuthorizationUrl)(env_1.env.MICROSOFT_REDIRECT_URI, state);
            res.json({
                success: true,
                data: {
                    authUrl,
                },
            });
        }
        catch (error) {
            logger_1.default.error('Error initiating Microsoft login', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to initiate login',
            });
        }
    }
    /**
     * Handle Microsoft OAuth callback
     * GET /api/v1/auth/microsoft/callback
     */
    static async handleCallback(req, res) {
        try {
            const { code, state } = req.query;
            if (!code) {
                return res.status(400).json({
                    success: false,
                    error: 'Authorization code is required',
                });
            }
            // Exchange code for tokens
            const tokens = await (0, microsoftAuth_1.exchangeCodeForTokens)(code, env_1.env.MICROSOFT_REDIRECT_URI);
            // Decode ID token to get user info
            const userInfo = (0, microsoftAuth_1.decodeIdToken)(tokens.id_token);
            logger_1.default.info('Microsoft OAuth callback received', {
                email: userInfo.email,
                sub: userInfo.sub,
            });
            // Check if this is an invite flow
            let inviteToken = null;
            if (state && typeof state === 'string' && state.startsWith('invite_')) {
                inviteToken = state.replace('invite_', '');
            }
            // If invite token is provided, handle invite acceptance
            if (inviteToken) {
                return await MicrosoftAuthController.handleInviteAcceptance(req, res, userInfo, inviteToken);
            }
            // Otherwise, handle regular login
            return await MicrosoftAuthController.handleRegularLogin(req, res, userInfo);
        }
        catch (error) {
            logger_1.default.error('Error in Microsoft callback', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Authentication failed',
            });
        }
    }
    /**
     * Handle invite acceptance
     */
    static async handleInviteAcceptance(req, res, userInfo, inviteToken) {
        try {
            // Find invite
            const invite = await AdminInvite_1.default.findOne({
                token: inviteToken,
                status: 'pending',
            });
            if (!invite) {
                return res.status(404).json({
                    success: false,
                    error: 'Invite not found or already used',
                });
            }
            // Check if expired
            if (invite.expiresAt < new Date()) {
                invite.status = 'expired';
                await invite.save();
                return res.status(400).json({
                    success: false,
                    error: 'Invite has expired',
                });
            }
            // Log which email is being used (no validation - user can use any email)
            logger_1.default.info('User accepting invite', {
                inviteId: invite.inviteId,
                inviteEmail: invite.email,
                actualEmail: userInfo.email,
                name: userInfo.name,
            });
            // Check if user already exists with this Microsoft account
            // Check if this Microsoft account is already registered
            const existingUserByMicrosoft = await AdminUser_1.default.findOne({
                microsoftId: userInfo.sub,
            });
            if (existingUserByMicrosoft) {
                return res.status(400).json({
                    success: false,
                    error: 'This Microsoft account is already registered',
                });
            }
            // Check if someone already used this email (different Microsoft account)
            const existingUserByEmail = await AdminUser_1.default.findOne({
                email: userInfo.email.toLowerCase(),
            });
            if (existingUserByEmail) {
                return res.status(400).json({
                    success: false,
                    error: 'This email is already registered with a different Microsoft account',
                });
            }
            // Create admin user
            const adminUser = await AdminUser_1.default.create({
                microsoftId: userInfo.sub,
                email: userInfo.email.toLowerCase(), // Actual email they used
                inviteEmail: invite.email.toLowerCase(), // Email where invite was sent
                name: userInfo.name,
                firstName: userInfo.given_name,
                lastName: userInfo.family_name,
                profilePhoto: userInfo.picture,
                role: invite.role,
                team: invite.team,
                department: invite.department,
                status: 'active',
                inviteId: invite.inviteId,
                joinedVia: 'invite',
                loginCount: 1,
                lastLoginAt: new Date(),
                mfaEnabled: false,
            });
            // Generate JWT tokens
            const { accessToken, refreshToken } = (0, jwt_1.generateTokenPair)({
                userId: adminUser.userId,
                email: adminUser.email,
                role: adminUser.role,
                team: adminUser.team,
                department: adminUser.department,
            });
            // Store refresh token
            adminUser.addRefreshToken(refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), req.headers['user-agent'], req.ip);
            await adminUser.save();
            // Mark invite as accepted and track actual user details
            invite.status = 'accepted';
            invite.usedBy = adminUser.userId;
            invite.usedByEmail = userInfo.email.toLowerCase();
            invite.usedByName = userInfo.name;
            invite.usedAt = new Date();
            invite.loginCount = 1;
            invite.lastLoginAt = new Date();
            await invite.save();
            logger_1.default.info('Admin user created via invite', {
                userId: adminUser.userId,
                email: adminUser.email,
                role: adminUser.role,
                inviteId: invite.inviteId,
            });
            res.json({
                success: true,
                data: {
                    accessToken,
                    refreshToken,
                    user: {
                        userId: adminUser.userId,
                        email: adminUser.email,
                        name: adminUser.name,
                        role: adminUser.role,
                        team: adminUser.team,
                        department: adminUser.department,
                    },
                },
            });
        }
        catch (error) {
            logger_1.default.error('Error handling invite acceptance', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to accept invite',
            });
        }
    }
    /**
     * Handle regular login
     */
    static async handleRegularLogin(req, res, userInfo) {
        try {
            // Find existing user
            const user = await AdminUser_1.default.findOne({
                microsoftId: userInfo.sub,
            });
            if (!user) {
                // Check by email as fallback
                const userByEmail = await AdminUser_1.default.findOne({
                    email: userInfo.email.toLowerCase(),
                });
                if (!userByEmail) {
                    return res.status(404).json({
                        success: false,
                        error: 'No account found. Please ask your administrator for an invite.',
                    });
                }
                // Link Microsoft ID to existing user
                userByEmail.microsoftId = userInfo.sub;
                await userByEmail.save();
                return await MicrosoftAuthController.loginUser(req, res, userByEmail);
            }
            // Check if user is active
            if (user.status !== 'active') {
                return res.status(403).json({
                    success: false,
                    error: `Account is ${user.status}`,
                });
            }
            return await MicrosoftAuthController.loginUser(req, res, user);
        }
        catch (error) {
            logger_1.default.error('Error handling regular login', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Login failed',
            });
        }
    }
    /**
     * Complete login for user
     */
    static async loginUser(req, res, user) {
        try {
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
            // Update invite login tracking if applicable
            if (user.inviteId) {
                await AdminInvite_1.default.updateOne({ inviteId: user.inviteId }, {
                    $set: { lastLoginAt: new Date() },
                    $inc: { loginCount: 1 },
                });
            }
            logger_1.default.info('Admin user logged in', {
                userId: user.userId,
                email: user.email,
                loginCount: user.loginCount,
            });
            res.json({
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
                        profilePhoto: user.profilePhoto,
                    },
                },
            });
        }
        catch (error) {
            logger_1.default.error('Error completing login', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Login failed',
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
                    error: 'Refresh token is required',
                });
            }
            // Verify refresh token
            const { verifyRefreshToken } = require('../utils/jwt');
            const decoded = verifyRefreshToken(refreshToken);
            // Find user and verify refresh token exists
            const user = await AdminUser_1.default.findOne({
                userId: decoded.userId,
                'refreshTokens.token': refreshToken,
            });
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid refresh token',
                });
            }
            // Check if user is active
            if (user.status !== 'active') {
                return res.status(403).json({
                    success: false,
                    error: 'Account is not active',
                });
            }
            // Generate new access token
            const { generateAccessToken } = require('../utils/jwt');
            const newAccessToken = generateAccessToken({
                userId: user.userId,
                email: user.email,
                role: user.role,
                team: user.team,
                department: user.department,
            });
            // Update refresh token last used
            const tokenIndex = user.refreshTokens.findIndex((rt) => rt.token === refreshToken);
            if (tokenIndex !== -1) {
                user.refreshTokens[tokenIndex].lastUsedAt = new Date();
                await user.save();
            }
            res.json({
                success: true,
                data: {
                    accessToken: newAccessToken,
                },
            });
        }
        catch (error) {
            logger_1.default.error('Error refreshing token', { error: error.message });
            res.status(401).json({
                success: false,
                error: 'Invalid or expired refresh token',
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
            if (!refreshToken || !userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Refresh token and authentication required',
                });
            }
            // Remove refresh token from user
            await AdminUser_1.default.updateOne({ userId }, { $pull: { refreshTokens: { token: refreshToken } } });
            logger_1.default.info('Admin user logged out', { userId });
            res.json({
                success: true,
                message: 'Logged out successfully',
            });
        }
        catch (error) {
            logger_1.default.error('Error logging out', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Logout failed',
            });
        }
    }
    /**
     * Get current user info
     * GET /api/v1/auth/me
     */
    static async getCurrentUser(req, res) {
        try {
            const userId = req.admin?.userId;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated',
                });
            }
            const user = await AdminUser_1.default.findOne({ userId }).select('-refreshTokens -passwordHash');
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found',
                });
            }
            res.json({
                success: true,
                data: {
                    user: {
                        userId: user.userId,
                        email: user.email,
                        name: user.name,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        profilePhoto: user.profilePhoto,
                        role: user.role,
                        team: user.team,
                        department: user.department,
                        status: user.status,
                        joinedVia: user.joinedVia,
                        lastLoginAt: user.lastLoginAt,
                        loginCount: user.loginCount,
                        createdAt: user.createdAt,
                    },
                },
            });
        }
        catch (error) {
            logger_1.default.error('Error getting current user', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get user info',
            });
        }
    }
}
exports.MicrosoftAuthController = MicrosoftAuthController;
//# sourceMappingURL=MicrosoftAuthController.js.map