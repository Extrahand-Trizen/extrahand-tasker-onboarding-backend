import { Request, Response, NextFunction } from 'express';
export interface AdminRequest extends Request {
    admin?: {
        uid: string;
        email?: string;
        name?: string;
        role?: string;
    };
}
export declare const adminAuthMiddleware: (req: AdminRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=adminAuth.d.ts.map