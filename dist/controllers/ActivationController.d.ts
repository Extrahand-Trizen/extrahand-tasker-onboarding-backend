import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
export declare class ActivationController {
    /**
     * Get activation queue (approved leads ready for activation)
     * GET /api/v1/admin/caos/leads/activation-queue
     */
    static getActivationQueue(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Activate a single lead
     * POST /api/v1/admin/caos/leads/:leadId/activate
     */
    static activateLead(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Bulk activate leads
     * POST /api/v1/admin/caos/leads/bulk-activate
     */
    static bulkActivateLeads(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
}
//# sourceMappingURL=ActivationController.d.ts.map