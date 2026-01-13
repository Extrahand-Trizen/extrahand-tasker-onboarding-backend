import { Request, Response } from 'express';
import AdminUser from '../models/AdminUser';
import AdminInvite from '../models/AdminInvite';
import PasswordResetToken from '../models/PasswordResetToken';
import { AdminRequest } from '../middleware/adminAuth';
import logger from '../config/logger';
import { env } from '../config/env';
import { EmailServiceClient } from '../services/EmailServiceClient';

export class UserManagementController {
  /**
   * List all admin users
   * GET /api/v1/admin/users
   */
  static async list(req: AdminRequest, res: Response) {
    try {
      const { status, role, search } = req.query;
      
      const query: any = {};
      if (status) query.status = status;
      if (role) query.role = role;
      if (search) {
        query.$or = [
          { email: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
        ];
      }

      const users = await AdminUser.find(query)
        .select('-passwordHash -refreshTokens')
        .sort({ createdAt: -1 })
        .lean();

      return res.json({
        success: true,
        data: users,
      });
    } catch (error: any) {
      logger.error('List users error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch users',
      });
    }
  }

  /**
   * Get user details with full history
   * GET /api/v1/admin/users/:userId
   */
  static async getById(req: AdminRequest, res: Response) {
    try {
      const { userId } = req.params;
      
      const user = await AdminUser.findOne({ userId })
        .select('-passwordHash')
        .lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Get invite information if available
      let inviteInfo = null;
      if (user.inviteId) {
        inviteInfo = await AdminInvite.findOne({ inviteId: user.inviteId })
          .select('email createdAt expiresAt status usedByEmail usedByName usedAt')
          .lean();
      }

      // Get active sessions (refreshTokens)
      const activeSessions = (user.refreshTokens || [])
        .filter((token: any) => new Date(token.expiresAt) > new Date())
        .map((token: any) => ({
          deviceInfo: token.deviceInfo || 'Unknown',
          ipAddress: token.ipAddress || 'Unknown',
          createdAt: token.createdAt,
          lastUsedAt: token.lastUsedAt,
          expiresAt: token.expiresAt,
        }));

      // Build activity timeline
      const activityTimeline = [];
      
      if (user.createdAt) {
        activityTimeline.push({
          type: 'account_created',
          date: user.createdAt,
          description: `Account created via ${user.joinedVia || 'manual'}`,
        });
      }

      if (inviteInfo?.usedAt) {
        activityTimeline.push({
          type: 'invite_accepted',
          date: inviteInfo.usedAt,
          description: `Invite accepted by ${inviteInfo.usedByName || inviteInfo.usedByEmail || 'user'}`,
        });
      }

      if (user.lastRoleChangeAt && user.lastRoleChangeBy) {
        activityTimeline.push({
          type: 'role_changed',
          date: user.lastRoleChangeAt,
          description: `Role changed by ${user.lastRoleChangeBy}`,
        });
      }

      if (user.lastLoginAt) {
        activityTimeline.push({
          type: 'last_login',
          date: user.lastLoginAt,
          description: `Last login (Total: ${user.loginCount || 0} logins)`,
        });
      }

      // Sort by date (newest first)
      activityTimeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return res.json({
        success: true,
        data: {
          ...user,
          inviteInfo,
          activeSessions,
          activityTimeline,
        },
      });
    } catch (error: any) {
      logger.error('Get user error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch user',
      });
    }
  }

  /**
   * Update user role
   * PUT /api/v1/admin/users/:userId/role
   */
  static async updateRole(req: AdminRequest, res: Response) {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const actorId = req.admin?.userId || 'system';

      const currentUserRole = req.admin?.role;
      
      if (!role || !['admin', 'onboarder', 'qualifier', 'support', 'trust', 'lead_access_manager'].includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid role',
        });
      }

      const user = await AdminUser.findOne({ userId });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // ✅ Lead Access Manager can only update roles for Qualifier and Onboarder
      if (currentUserRole === 'lead_access_manager') {
        const allowedRoles = ['qualifier', 'onboarder'];
        if (!allowedRoles.includes(role)) {
          return res.status(403).json({
            success: false,
            error: 'Permission denied',
            message: 'Lead Access Manager can only assign Qualifier and Onboarder roles',
          });
        }
        // Also check that the user being updated is currently a Qualifier or Onboarder
        if (!allowedRoles.includes(user.role)) {
          return res.status(403).json({
            success: false,
            error: 'Permission denied',
            message: 'Lead Access Manager can only update roles for Qualifier and Onboarder users',
          });
        }
      }

      // Prevent self-role change to non-admin
      if (user.userId === actorId && role !== 'admin') {
        return res.status(400).json({
          success: false,
          error: 'Cannot change your own role from admin',
        });
      }

      user.role = role as any;
      user.lastRoleChangeBy = actorId;
      user.lastRoleChangeAt = new Date();
      await user.save();

      logger.info('User role updated', {
        userId: user.userId,
        email: user.email,
        newRole: role,
        changedBy: actorId,
      });

      return res.json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      logger.error('Update role error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to update role',
      });
    }
  }

  /**
   * Update user status (suspend/activate)
   * PUT /api/v1/admin/users/:userId/status
   */
  static async updateStatus(req: AdminRequest, res: Response) {
    try {
      const { userId } = req.params;
      const { status } = req.body;
      const actorId = req.admin?.userId || 'system';

      if (!status || !['active', 'suspended', 'inactive'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status',
        });
      }

      const user = await AdminUser.findOne({ userId });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Prevent self-suspension
      if (user.userId === actorId && status === 'suspended') {
        return res.status(400).json({
          success: false,
          error: 'Cannot suspend your own account',
        });
      }

      user.status = status as any;
      await user.save();

      logger.info('User status updated', {
        userId: user.userId,
        email: user.email,
        newStatus: status,
        changedBy: actorId,
      });

      return res.json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      logger.error('Update status error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to update status',
      });
    }
  }

  /**
   * Update user details (name, team, department)
   * PUT /api/v1/admin/users/:userId
   */
  static async update(req: AdminRequest, res: Response) {
    try {
      const { userId } = req.params;
      const { name, team, department } = req.body;

      const user = await AdminUser.findOne({ userId });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      if (name !== undefined) user.name = name;
      if (team !== undefined) user.team = team;
      if (department !== undefined) user.department = department;

      await user.save();

      logger.info('User updated', {
        userId: user.userId,
        email: user.email,
      });

      return res.json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      logger.error('Update user error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to update user',
      });
    }
  }

  /**
   * Initiate password reset by admin
   * POST /api/v1/admin/users/:userId/reset-password
   */
  static async resetPassword(req: AdminRequest, res: Response) {
    try {
      const { userId } = req.params;
      const actorId = req.admin?.userId || 'system';

      const user = await AdminUser.findOne({ userId });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Validate user has an email
      if (!user.email) {
        logger.error('Password reset failed: User has no email address', {
          userId: user.userId,
          initiatedBy: actorId,
        });
        return res.status(400).json({
          success: false,
          error: 'User does not have an email address configured',
        });
      }

      // Create password reset token
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const resetToken = await PasswordResetToken.create({
        userId: user.userId,
        email: user.email,
        expiresAt,
        createdBy: actorId,
      });

      const resetLink = `${env.FRONTEND_URL}/reset-password?token=${resetToken.token}`;

      logger.info('Password reset token created', {
        userId: user.userId,
        email: user.email,
        initiatedBy: actorId,
        tokenId: resetToken.token.substring(0, 8) + '...',
        expiresAt: expiresAt.toISOString(),
      });

      // Send password reset email
      const emailResult = await EmailServiceClient.sendPasswordResetEmail(
        user.email,
        resetLink,
        user.name || user.email.split('@')[0],
        expiresAt // Pass expiresAt to email template
      );

      if (!emailResult.success) {
        logger.error('Password reset email failed to send', {
          userId: user.userId,
          email: user.email,
          initiatedBy: actorId,
          error: emailResult.error,
          resetLink: resetLink, // Log link for manual sending if needed
        });

        // Return error but include reset link for manual sending
        return res.status(500).json({
          success: false,
          error: 'Failed to send password reset email',
          message: emailResult.error || 'Email service unavailable',
          data: {
            emailSent: false,
            resetLink: resetLink, // Provide link so admin can manually send
            email: user.email,
            expiresAt: expiresAt.toISOString(),
          },
        });
      }

      logger.info('Password reset email sent successfully', {
        userId: user.userId,
        email: user.email,
        initiatedBy: actorId,
        messageId: emailResult.messageId,
        expiresAt: expiresAt.toISOString(),
      });

      return res.json({
        success: true,
        message: `Password reset email sent to ${user.email}`,
        data: {
          emailSent: true,
          email: user.email,
          expiresAt: expiresAt.toISOString(),
        },
      });
    } catch (error: any) {
      logger.error('Password reset error', {
        error: error.message,
        stack: error.stack,
        userId: req.params.userId,
        initiatedBy: req.admin?.userId || 'system',
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to initiate password reset',
        message: error.message || 'An unexpected error occurred',
      });
    }
  }

  /**
   * Get active sessions for a user
   * GET /api/v1/admin/users/:userId/sessions
   */
  static async getSessions(req: AdminRequest, res: Response) {
    try {
      const { userId } = req.params;

      const user = await AdminUser.findOne({ userId })
        .select('refreshTokens email name');

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const activeSessions = (user.refreshTokens || [])
        .filter((token) => new Date(token.expiresAt) > new Date())
        .map((token, index) => ({
          id: index, // Use index as ID since tokens don't have _id
          deviceInfo: token.deviceInfo || 'Unknown',
          ipAddress: token.ipAddress || 'Unknown',
          createdAt: token.createdAt,
          lastUsedAt: token.lastUsedAt,
          expiresAt: token.expiresAt,
          token: token.token.substring(0, 20) + '...', // Partial token for identification
        }));

      return res.json({
        success: true,
        data: activeSessions,
      });
    } catch (error: any) {
      logger.error('Get sessions error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch sessions',
      });
    }
  }

  /**
   * Revoke a specific session
   * DELETE /api/v1/admin/users/:userId/sessions/:sessionIndex
   */
  static async revokeSession(req: AdminRequest, res: Response) {
    try {
      const { userId, sessionIndex } = req.params;
      const actorId = req.admin?.userId || 'system';

      const user = await AdminUser.findOne({ userId });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const sessionIdx = parseInt(sessionIndex, 10);
      if (isNaN(sessionIdx) || sessionIdx < 0 || sessionIdx >= (user.refreshTokens?.length || 0)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid session index',
        });
      }

      // Remove the session
      const removedSession = user.refreshTokens.splice(sessionIdx, 1)[0];
      await user.save();

      logger.info('Session revoked by admin', {
        userId: user.userId,
        email: user.email,
        revokedBy: actorId,
        deviceInfo: removedSession.deviceInfo,
        ipAddress: removedSession.ipAddress,
      });

      return res.json({
        success: true,
        message: 'Session revoked successfully',
      });
    } catch (error: any) {
      logger.error('Revoke session error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to revoke session',
      });
    }
  }

  /**
   * Revoke all sessions for a user
   * DELETE /api/v1/admin/users/:userId/sessions
   */
  static async revokeAllSessions(req: AdminRequest, res: Response) {
    try {
      const { userId } = req.params;
      const actorId = req.admin?.userId || 'system';

      const user = await AdminUser.findOne({ userId });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const sessionCount = user.refreshTokens?.length || 0;
      user.refreshTokens = [];
      await user.save();

      logger.info('All sessions revoked by admin', {
        userId: user.userId,
        email: user.email,
        revokedBy: actorId,
        sessionCount,
      });

      return res.json({
        success: true,
        message: `All ${sessionCount} session(s) revoked successfully`,
      });
    } catch (error: any) {
      logger.error('Revoke all sessions error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to revoke sessions',
      });
    }
  }
}
