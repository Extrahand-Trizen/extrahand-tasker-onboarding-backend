import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
export declare class UserManagementController {
    /**
     * List all admin users
     * GET /api/v1/admin/users
     */
    static list(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * Get user details
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
}
//# sourceMappingURL=UserManagementController.d.ts.map