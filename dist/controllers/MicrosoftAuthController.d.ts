import { Request, Response } from 'express';
export declare class MicrosoftAuthController {
    /**
     * Initiate Microsoft OAuth flow
     * GET /api/v1/auth/microsoft
     */
    static initiateLogin(req: Request, res: Response): Promise<void>;
    /**
     * Handle Microsoft OAuth callback
     * GET /api/v1/auth/microsoft/callback
     */
    static handleCallback(req: Request, res: Response): Promise<void | Response<any, Record<string, any>>>;
    /**
     * Handle invite acceptance
     */
    private static handleInviteAcceptance;
    /**
     * Handle regular login
     */
    private static handleRegularLogin;
    /**
     * Complete login for user
     */
    private static loginUser;
    /**
     * Refresh access token
     * POST /api/v1/auth/refresh
     */
    static refreshToken(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Logout (invalidate refresh token)
     * POST /api/v1/auth/logout
     */
    static logout(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Get current user info
     * GET /api/v1/auth/me
     */
    static getCurrentUser(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
}
//# sourceMappingURL=MicrosoftAuthController.d.ts.map