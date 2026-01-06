import { Response, NextFunction } from 'express';
import { AdminRequest } from './adminAuth';
import { getPermissions, UserRole } from '../lib/permissions';
export declare function requirePermission(permission: keyof ReturnType<typeof getPermissions>): (req: AdminRequest, res: Response, next: NextFunction) => void;
export declare function requireRole(...allowedRoles: UserRole[]): (req: AdminRequest, res: Response, next: NextFunction) => void;
//# sourceMappingURL=roleAuth.d.ts.map