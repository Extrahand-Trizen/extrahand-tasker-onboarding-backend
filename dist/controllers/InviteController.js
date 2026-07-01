"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteController = void 0;
const AdminInvite_1 = __importDefault(require("../models/AdminInvite"));
const AdminUser_1 = __importDefault(require("../models/AdminUser"));
const logger_1 = __importDefault(require("../config/logger"));
const env_1 = require("../config/env");
const EmailServiceClient_1 = require("../services/EmailServiceClient");
/**
 * Construct invite link URL
 * Uses FRONTEND_URL environment variable which should be set to:
 * - Production: https://partner.extrahand.in
 * - Development: http://localhost:3000
 */
function getInviteLink(token, requestOrigin) {
    // Use origin from request if available, fallback to FRONTEND_URL
    const baseUrl = (requestOrigin || env_1.env.FRONTEND_URL).replace(/\/$/, '');
    return `${baseUrl}/invite/${token}`;
}
class InviteController {
    /**
     * Create a new invite
     * POST /api/v1/admin/invites
     */
    static async create(req, res) {
        try {
            const { email, role, team, department, expiryDays = 7 } = req.body;
            const createdBy = req.admin?.userId || 'system';
            // Validate required fields
            if (!email || !role) {
                return res.status(400).json({
                    success: false,
                    error: 'Email and role are required',
                });
            }
            // Get the current user's role
            const currentUserRole = req.admin?.role;
            // Validate role
            const validRoles = ['lead_access_manager', 'onboarder', 'qualifier', 'support', 'trust'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({
                    success: false,
                    error: `Role must be one of: ${validRoles.join(', ')}`,
                });
            }
            // Check if user already exists with this email
            const existingUser = await AdminUser_1.default.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    error: 'User with this email already exists',
                });
            }
            // Check if pending invite already exists
            const existingInvite = await AdminInvite_1.default.findOne({
                email: email.toLowerCase(),
                status: 'pending',
            });
            if (existingInvite) {
                return res.status(400).json({
                    success: false,
                    error: 'Pending invite already exists for this email',
                    data: {
                        inviteId: existingInvite.inviteId,
                        expiresAt: existingInvite.expiresAt,
                    },
                });
            }
            // Create invite
            const invite = await AdminInvite_1.default.create({
                email: email.toLowerCase(),
                role,
                team,
                department,
                createdBy,
                expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
            });
            const origin = req.get('origin') || req.get('referer')?.replace(/\/$/, '');
            const inviteLink = getInviteLink(invite.token, origin);
            // Send invite email (fire and forget - don't block on email)
            EmailServiceClient_1.EmailServiceClient.sendAdminInviteEmail(invite.email, invite.role, inviteLink, invite.expiresAt, invite.team, invite.department)
                .then((emailResult) => {
                // Update invite with email status
                invite.emailSent = emailResult.success;
                invite.emailSentAt = new Date();
                if (!emailResult.success) {
                    invite.emailError = emailResult.error;
                }
                invite.save().catch((err) => {
                    logger_1.default.warn('Failed to update invite email status', {
                        inviteId: invite.inviteId,
                        error: err.message,
                    });
                });
                logger_1.default.info('Admin invite email sent', {
                    inviteId: invite.inviteId,
                    email: invite.email,
                    success: emailResult.success,
                    messageId: emailResult.messageId,
                });
            })
                .catch((emailError) => {
                // Log but don't fail the invite creation
                logger_1.default.warn('Failed to send invite email', {
                    inviteId: invite.inviteId,
                    email: invite.email,
                    error: emailError,
                });
                // Update invite with error
                invite.emailSent = false;
                invite.emailError = emailError.message || 'Unknown error';
                invite.save().catch(() => { });
            });
            logger_1.default.info('Admin invite created', {
                inviteId: invite.inviteId,
                email: invite.email,
                role: invite.role,
                createdBy,
            });
            res.json({
                success: true,
                data: {
                    invite: {
                        inviteId: invite.inviteId,
                        email: invite.email,
                        role: invite.role,
                        team: invite.team,
                        department: invite.department,
                        status: invite.status,
                        expiresAt: invite.expiresAt,
                        createdAt: invite.createdAt,
                    },
                    inviteLink,
                },
            });
        }
        catch (error) {
            logger_1.default.error('Error creating invite', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to create invite',
            });
        }
    }
    /**
     * Get invite details by token
     * GET /api/v1/admin/invites/:token
     */
    static async getByToken(req, res) {
        try {
            const { token } = req.params;
            const invite = await AdminInvite_1.default.findOne({ token });
            if (!invite) {
                return res.status(404).json({
                    success: false,
                    error: 'Invite not found',
                });
            }
            // Check if already used
            if (invite.status === 'accepted') {
                return res.status(400).json({
                    success: false,
                    error: 'Invite has already been used',
                });
            }
            // Check if revoked
            if (invite.status === 'revoked') {
                return res.status(400).json({
                    success: false,
                    error: 'Invite has been revoked',
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
            res.json({
                success: true,
                data: {
                    inviteId: invite.inviteId,
                    email: invite.email,
                    role: invite.role,
                    team: invite.team,
                    department: invite.department,
                    expiresAt: invite.expiresAt,
                },
            });
        }
        catch (error) {
            logger_1.default.error('Error fetching invite', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to fetch invite',
            });
        }
    }
    /**
     * List all invites
     * GET /api/v1/admin/invites
     */
    static async list(req, res) {
        try {
            const { status, email } = req.query;
            const query = {};
            if (status) {
                query.status = status;
            }
            if (email) {
                query.email = { $regex: email, $options: 'i' };
            }
            const invites = await AdminInvite_1.default.find(query)
                .sort({ createdAt: -1 })
                .limit(100)
                .lean();
            // Get creator and user information
            const creatorIds = invites.map((inv) => inv.createdBy).filter(Boolean);
            const userIds = invites.map((inv) => inv.usedBy).filter(Boolean);
            const creators = await AdminUser_1.default.find({ userId: { $in: creatorIds } })
                .select('userId name email')
                .lean();
            const users = await AdminUser_1.default.find({ userId: { $in: userIds } })
                .select('userId name email')
                .lean();
            const creatorMap = new Map(creators.map((c) => [c.userId, c]));
            const userMap = new Map(users.map((u) => [u.userId, u]));
            const enrichedInvites = invites.map((invite) => ({
                ...invite,
                createdByUser: invite.createdBy ? creatorMap.get(invite.createdBy) : null,
                usedByUser: invite.usedBy ? userMap.get(invite.usedBy) : null,
            }));
            res.json({
                success: true,
                data: enrichedInvites,
            });
        }
        catch (error) {
            logger_1.default.error('Error listing invites', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to list invites',
            });
        }
    }
    /**
     * Revoke an invite
     * DELETE /api/v1/admin/invites/:inviteId
     */
    static async revoke(req, res) {
        try {
            const { inviteId } = req.params;
            const invite = await AdminInvite_1.default.findOne({ inviteId });
            if (!invite) {
                return res.status(404).json({
                    success: false,
                    error: 'Invite not found',
                });
            }
            if (invite.status === 'accepted') {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot revoke an accepted invite',
                });
            }
            invite.status = 'revoked';
            await invite.save();
            logger_1.default.info('Invite revoked', {
                inviteId,
                email: invite.email,
            });
            res.json({
                success: true,
                message: 'Invite revoked successfully',
            });
        }
        catch (error) {
            logger_1.default.error('Error revoking invite', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to revoke invite',
            });
        }
    }
    /**
     * Resend invite (generate new token)
     * POST /api/v1/admin/invites/:inviteId/resend
     */
    static async resend(req, res) {
        try {
            const { inviteId } = req.params;
            const invite = await AdminInvite_1.default.findOne({ inviteId });
            if (!invite) {
                return res.status(404).json({
                    success: false,
                    error: 'Invite not found',
                });
            }
            if (invite.status === 'accepted') {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot resend an accepted invite',
                });
            }
            // Generate new token and extend expiry
            const crypto = require('crypto');
            invite.token = crypto.randomBytes(32).toString('hex');
            invite.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            invite.status = 'pending';
            await invite.save();
            const origin = req.get('origin') || req.get('referer')?.replace(/\/$/, '');
            const inviteLink = getInviteLink(invite.token, origin);
            logger_1.default.info('Invite resent', {
                inviteId,
                email: invite.email,
            });
            res.json({
                success: true,
                data: {
                    inviteLink,
                    expiresAt: invite.expiresAt,
                },
            });
        }
        catch (error) {
            logger_1.default.error('Error resending invite', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to resend invite',
            });
        }
    }
}
exports.InviteController = InviteController;
//# sourceMappingURL=InviteController.js.map