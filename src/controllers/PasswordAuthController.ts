import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import AdminUser from '../models/AdminUser';
import AdminInvite from '../models/AdminInvite';
import { generateTokenPair } from '../utils/jwt';
import { AdminRequest } from '../middleware/adminAuth';
import logger from '../config/logger';
import { env } from '../config/env';

export class PasswordAuthController {
  /**
   * Login with email and password
   * POST /api/v1/auth/login
   */
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      // Find user by email
      const user = await AdminUser.findOne({
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
      const isValid = await bcrypt.compare(password, user.passwordHash);

      if (!isValid) {
        logger.warn('Failed login attempt', { email });
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
      const { accessToken, refreshToken } = generateTokenPair({
        userId: user.userId,
        email: user.email,
        role: user.role,
        team: user.team,
        department: user.department,
      });

      // Store refresh token
      user.addRefreshToken(
        refreshToken,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        req.headers['user-agent'],
        req.ip
      );
      await user.save();

      logger.info('Admin user logged in with password', {
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
    } catch (error: any) {
      logger.error('Login error', { error: error.message });
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
  static async setPassword(req: Request, res: Response) {
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
      const invite = await AdminInvite.findOne({
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
      const existingUser = await AdminUser.findOne({
        email: invite.email.toLowerCase()
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'An account with this email already exists'
        });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create admin user
      // Explicitly exclude uid to avoid duplicate key error (uid is sparse unique)
      const adminUser = await AdminUser.create({
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

      logger.info('Admin account created via invite', {
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
    } catch (error: any) {
      logger.error('Set password error', { error: error.message });
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
  static async getCurrentUser(req: AdminRequest, res: Response) {
    try {
      const userId = req.admin?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }

      const user = await AdminUser.findOne({ userId, status: 'active' });

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
    } catch (error: any) {
      logger.error('Get current user error', { error: error.message });
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
  static async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh token is required'
        });
      }

      // Verify refresh token
      let decoded: any;
      try {
        decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
          audience: 'extrahand-admin',
          issuer: 'extrahand-admin-service'
        });
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired refresh token'
        });
      }

      // Find user
      const user = await AdminUser.findOne({
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
      const tokenExists = user.refreshTokens.some(
        (rt) => rt.token === refreshToken && rt.expiresAt > new Date()
      );

      if (!tokenExists) {
        return res.status(401).json({
          success: false,
          error: 'Refresh token not found or expired'
        });
      }

      // Generate new access token
      const { accessToken } = generateTokenPair({
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

      logger.info('Access token refreshed', { userId: user.userId });

      return res.json({
        success: true,
        data: {
          accessToken
        }
      });
    } catch (error: any) {
      logger.error('Refresh token error', { error: error.message });
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
  static async logout(req: AdminRequest, res: Response) {
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
        const user = await AdminUser.findOne({ userId });
        if (user) {
          user.refreshTokens = user.refreshTokens.filter(
            (rt) => rt.token !== refreshToken
          );
          await user.save();
        }
      }

      logger.info('Admin user logged out', { userId });

      return res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error: any) {
      logger.error('Logout error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
  }
}
