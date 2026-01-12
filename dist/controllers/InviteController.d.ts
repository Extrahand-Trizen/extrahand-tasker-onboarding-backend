import { Request, Response } from 'express';
export declare class InviteController {
    /**
     * Create a new invite
     * POST /api/v1/admin/invites
     */
    static create(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Get invite details by token
     * GET /api/v1/admin/invites/:token
     */
    static getByToken(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * List all invites
     * GET /api/v1/admin/invites
     */
    static list(req: Request, res: Response): Promise<void>;
    /**
     * Revoke an invite
     * DELETE /api/v1/admin/invites/:inviteId
     */
    static revoke(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Resend invite (generate new token)
     * POST /api/v1/admin/invites/:inviteId/resend
     */
    static resend(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
}
//# sourceMappingURL=InviteController.d.ts.map