import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import AdminUser from '../models/AdminUser';
import logger from '../config/logger';
import { verifyAccessToken } from '../utils/jwt';

export interface AdminRequest extends Request {
  admin?: {
    uid?: string; // For Firebase auth (legacy)
    userId?: string; // For JWT auth (new)
    email?: string;
    name?: string;
    role?: string;
    team?: string;
    department?: string;
  };
  // Alias for backward compatibility
  user?: {
    uid?: string;
    userId?: string;
    email?: string;
    name?: string;
    role?: string;
  };
}

export const adminAuthMiddleware = async (
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
        message: 'Please provide a valid authentication token'
      });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Try JWT authentication first (new system)
    try {
      const decoded = verifyAccessToken(token);
      
      // Get user from database to verify they're still active
      const adminUser = await AdminUser.findOne({
        userId: decoded.userId,
        status: 'active',
      }).select('-refreshTokens -passwordHash');

      if (!adminUser) {
        throw new Error('User not found or inactive');
      }

      req.admin = {
        uid: adminUser.uid,
        userId: adminUser.userId,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
        team: adminUser.team,
        department: adminUser.department,
      };
      
      // Set user alias for backward compatibility
      req.user = req.admin;

      logger.debug('Admin authenticated via JWT', {
        userId: adminUser.userId,
        email: adminUser.email,
        role: adminUser.role
      });

      return next();
    } catch (jwtError: any) {
      // JWT authentication failed, try Firebase (legacy)
      logger.debug('JWT auth failed, trying Firebase', {
        error: jwtError.message
      });
    }
    
    // Fallback to Firebase authentication (legacy)
    try {
      const decodedToken = await auth.verifyIdToken(token);
      
      // ✅ Query AdminUser database to get correct role
      let adminRole = decodedToken.role; // Fallback to Firebase custom claims
      let adminName: string | undefined;
      
      try {
        const adminUser = await AdminUser.findOne({ uid: decodedToken.uid });
        if (adminUser) {
          adminRole = adminUser.role; // ✅ Use database role as source of truth
          adminName = adminUser.name;
          logger.debug('Admin role from database', {
            uid: decodedToken.uid,
            email: decodedToken.email,
            role: adminRole
          });
        } else {
          logger.warn('Admin user not found in database', {
            uid: decodedToken.uid,
            email: decodedToken.email
          });
        }
      } catch (dbError: any) {
        logger.warn('Failed to query AdminUser database, using Firebase claims', {
          uid: decodedToken.uid,
          error: dbError.message
        });
        // Continue with Firebase custom claims as fallback
      }
      
      req.admin = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || adminName,
        role: adminRole || 'qualifier' // ✅ Use database role, fallback to Firebase, then 'qualifier'
      };
      
      // Set user alias for backward compatibility
      req.user = req.admin;

      logger.debug('Admin authenticated via Firebase', {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: req.admin.role
      });

      return next();
    } catch (firebaseError: any) {
      logger.warn('Both JWT and Firebase auth failed', {
        jwtError: 'JWT verification failed',
        firebaseError: firebaseError.message
      });
      res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'The provided token is invalid or expired'
      });
      return;
    }
  } catch (error: any) {
    logger.error('Admin auth error', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
    return;
  }
};

/**
 * JWT-based authentication middleware (for password auth)
 */
export const adminAuthJWT = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('JWT auth failed: No token provided');
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please provide a valid authentication token'
      });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    
    try {
      const decoded = verifyAccessToken(token);
      
      req.admin = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        team: decoded.team,
        department: decoded.department,
      };
      
      // Set user alias for backward compatibility
      req.user = req.admin;

      logger.debug('Admin authenticated via JWT', {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role
      });

      next();
    } catch (error: any) {
      logger.warn('JWT auth failed: Invalid token', {
        error: error.message
      });
      res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'The provided token is invalid or expired'
      });
      return;
    }
  } catch (error: any) {
    logger.error('JWT auth error', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
    return;
  }
};

