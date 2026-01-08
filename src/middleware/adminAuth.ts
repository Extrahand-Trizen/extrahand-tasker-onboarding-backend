import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import AdminUser from '../models/AdminUser';
import logger from '../config/logger';

export interface AdminRequest extends Request {
  admin?: {
    uid: string;
    email?: string;
    name?: string;
    role?: string;
  };
  // Alias for backward compatibility
  user?: {
    uid: string;
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
    
    try {
      const decodedToken = await auth.verifyIdToken(token);
      
      // ✅ Query AdminUser database to get correct role
      let adminRole = decodedToken.role; // Fallback to Firebase custom claims
      let adminName: string | undefined;
      
      try {
        const adminUser = await AdminUser.findOne({ uid: decodedToken.uid });
        if (adminUser) {
          adminRole = adminUser.role; // ✅ Use database role as source of truth
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
        role: adminRole || 'marketing' // ✅ Use database role, fallback to Firebase, then 'marketing'
      };
      
      // Set user alias for backward compatibility
      req.user = req.admin;

      logger.debug('Admin authenticated', {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: req.admin.role
      });

      next();
    } catch (error: any) {
      logger.warn('Admin auth failed: Invalid token', {
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

