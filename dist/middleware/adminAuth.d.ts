import { Request, Response, NextFunction } from 'express';
export interface AdminRequest extends Request {
    admin?: {
        uid?: string;
        userId?: string;
        email?: string;
        name?: string;
        role?: string;
        team?: string;
        department?: string;
    };
    user?: {
        uid?: string;
        userId?: string;
        email?: string;
        name?: string;
        role?: string;
    };
}
export declare const adminAuthMiddleware: (req: AdminRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * JWT-based authentication middleware (for password auth)
 */
export declare const adminAuthJWT: (req: AdminRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=adminAuth.d.ts.map