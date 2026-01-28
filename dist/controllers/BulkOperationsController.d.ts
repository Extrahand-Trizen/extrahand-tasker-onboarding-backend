import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
export declare class BulkOperationsController {
    /**
     * Bulk status change
     * POST /api/v1/admin/caos/leads/bulk-status
     */
    static bulkStatusChange(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Bulk assign skills
     * POST /api/v1/admin/caos/leads/bulk-assign-skills
     */
    static bulkAssignSkills(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Bulk delete leads
     * POST /api/v1/admin/caos/leads/bulk-delete
     */
    static bulkDeleteLeads(req: AdminRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=BulkOperationsController.d.ts.map