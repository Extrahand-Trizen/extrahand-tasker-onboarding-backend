import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
export declare class UserManagementController {
    /**
     * List all admin users with pagination, sorting, and stats
     * GET /api/v1/admin/users
     */
    static list(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Get user details with full history
     * GET /api/v1/admin/users/:userId
     */
    static getById(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Update user role
     * PUT /api/v1/admin/users/:userId/role
     */
    static updateRole(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Update user status (suspend/activate)
     * PUT /api/v1/admin/users/:userId/status
     */
    static updateStatus(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Update user details (name, team, department)
     * PUT /api/v1/admin/users/:userId
     */
    static update(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Initiate password reset by admin
     * POST /api/v1/admin/users/:userId/reset-password
     */
    static resetPassword(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Get active sessions for a user
     * GET /api/v1/admin/users/:userId/sessions
     */
    static getSessions(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Revoke a specific session
     * DELETE /api/v1/admin/users/:userId/sessions/:sessionIndex
     */
    static revokeSession(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Revoke all sessions for a user
     * DELETE /api/v1/admin/users/:userId/sessions
     */
    static revokeAllSessions(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Delete a user (soft delete by setting status to inactive)
     * DELETE /api/v1/admin/users/:userId
     */
    static deleteUser(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=UserManagementController.d.ts.map