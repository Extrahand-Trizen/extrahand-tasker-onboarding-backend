import { Response, NextFunction } from 'express';
import { AdminRequest } from './adminAuth';
import { getPermissions, hasPermission, UserRole } from '../lib/permissions';
import logger from '../config/logger';

export function requirePermission(permission: keyof ReturnType<typeof getPermissions>) {
  return (req: AdminRequest, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const role = (req.admin.role || 'marketing') as UserRole;
    
    if (!hasPermission(role, permission)) {
      logger.warn('Permission denied', {
        uid: req.admin.uid,
        role,
        permission
      });
      res.status(403).json({
        success: false,
        error: 'Permission denied',
        message: `You don't have permission to ${permission}`
      });
      return;
    }

    next();
  };
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AdminRequest, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const role = (req.admin.role || 'marketing') as UserRole;
    
    if (!allowedRoles.includes(role)) {
      logger.warn('Role access denied', {
        uid: req.admin.uid,
        role,
        allowedRoles
      });
      res.status(403).json({
        success: false,
        error: 'Access denied',
        message: `This action requires one of these roles: ${allowedRoles.join(', ')}`
      });
      return;
    }

    next();
  };
}

