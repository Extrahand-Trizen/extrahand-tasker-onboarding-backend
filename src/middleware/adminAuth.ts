import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import logger from '../config/logger';

export interface AdminRequest extends Request {
  admin?: {
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
      
      req.admin = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        role: decodedToken.role || 'marketing' // Default role, can be set in Firebase custom claims
      };

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

