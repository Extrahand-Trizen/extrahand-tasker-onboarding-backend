import { Request, Response, NextFunction } from 'express';
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
export declare const adminAuthJWTMiddleware: (req: AdminRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Optional admin auth - doesn't fail if no token provided
 * Useful for endpoints that work both for authenticated and unauthenticated users
 */
export declare const optionalAdminAuthJWTMiddleware: (req: AdminRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=adminAuthJWT.d.ts.map