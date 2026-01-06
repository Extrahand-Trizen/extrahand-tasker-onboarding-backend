import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
export declare class ApprovalController {
    /**
     * Get approval queue (leads ready for approval)
     * GET /api/v1/admin/caos/leads/approval-queue
     */
    static getApprovalQueue(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Check approval criteria for a lead
     * GET /api/v1/admin/caos/leads/:leadId/approval-criteria
     */
    static checkApprovalCriteria(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Approve a single lead
     * POST /api/v1/admin/caos/leads/:leadId/approve
     */
    static approveLead(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Bulk approve leads
     * POST /api/v1/admin/caos/leads/bulk-approve
     */
    static bulkApproveLeads(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
}
//# sourceMappingURL=ApprovalController.d.ts.map