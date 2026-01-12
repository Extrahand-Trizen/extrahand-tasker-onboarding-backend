import { Request, Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
export declare class PasswordAuthController {
    /**
     * Login with email and password
     * POST /api/v1/auth/login
     */
    static login(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Set password for invited user (accept invite)
     * POST /api/v1/auth/set-password
     */
    static setPassword(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Get current user info (requires JWT authentication)
     * GET /api/v1/auth/me
     */
    static getCurrentUser(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Refresh access token
     * POST /api/v1/auth/refresh
     */
    static refreshToken(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Logout (invalidate refresh token)
     * POST /api/v1/auth/logout
     */
    static logout(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=PasswordAuthController.d.ts.map