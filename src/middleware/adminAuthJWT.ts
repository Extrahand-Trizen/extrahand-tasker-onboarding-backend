import { Request, Response, NextFunction } from 'express';
import AdminUser from '../models/AdminUser';
import logger from '../config/logger';
import { verifyAccessToken } from '../utils/jwt';

export interface AdminRequest extends Request {
  admin: {
    userId: string;
    email: string;
    name?: string;
    role: string;
    team?: string;
    department?: string;
  };
  user?: {
    uid?: string;
    email?: string;
    name?: string;
    role?: string;
  };
}

/**
 * JWT-based admin authentication middleware
 * Replaces Firebase authentication
 */
export const adminAuthJWTMiddleware = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Admin auth failed: No token provided');
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please provide a valid authentication token',
      });
      return;
    }

    const token = authHeader.split('Bearer ')[1];

    try {
      // Verify JWT token
      const decoded = verifyAccessToken(token);

      // Get user from database to verify they're still active
      const adminUser = await AdminUser.findOne({
        userId: decoded.userId,
        status: 'active',
      }).select('-refreshTokens -passwordHash');

      if (!adminUser) {
        logger.warn('Admin user not found or inactive', {
          userId: decoded.userId,
        });
        res.status(401).json({
          success: false,
          error: 'Invalid authentication',
          message: 'User not found or account is inactive',
        });
        return;
      }

      // Attach admin info to request
      req.admin = {
        userId: adminUser.userId,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
        team: adminUser.team,
        department: adminUser.department,
      };

      // Set user alias for backward compatibility with existing code
      req.user = {
        uid: adminUser.uid || adminUser.userId, // Legacy support
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
      };

      logger.debug('Admin authenticated via JWT', {
        userId: adminUser.userId,
        email: adminUser.email,
        role: adminUser.role,
      });

      next();
    } catch (error: any) {
      logger.warn('JWT verification failed', {
        error: error.message,
      });
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        message: 'Please login again',
      });
      return;
    }
  } catch (error: any) {
    logger.error('Admin auth middleware error', {
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
};

/**
 * Optional admin auth - doesn't fail if no token provided
 * Useful for endpoints that work both for authenticated and unauthenticated users
 */
export const optionalAdminAuthJWTMiddleware = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No auth provided, continue without setting req.admin
    return next();
  }

  // Try to authenticate, but don't fail if it doesn't work
  try {
    await adminAuthJWTMiddleware(req, res, () => {});
  } catch (error) {
    // Ignore errors, just continue
  }

  next();
};
