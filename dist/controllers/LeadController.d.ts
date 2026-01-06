import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
export declare class LeadController {
    /**
     * Create a new lead
     * POST /api/v1/admin/caos/leads
     */
    static createLead(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Get lead by ID
     * GET /api/v1/admin/caos/leads/:leadId
     */
    static getLead(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Search and filter leads
     * GET /api/v1/admin/caos/leads
     */
    static searchLeads(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Update lead
     * PUT /api/v1/admin/caos/leads/:leadId
     */
    static updateLead(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Update lead status
     * PUT /api/v1/admin/caos/leads/:leadId/status
     */
    static updateStatus(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Add internal note
     * POST /api/v1/admin/caos/leads/:leadId/notes
     */
    static addNote(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Check for duplicates
     * POST /api/v1/admin/caos/leads/duplicate-check
     */
    static checkDuplicate(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Get status history
     * GET /api/v1/admin/caos/leads/:leadId/history
     */
    static getStatusHistory(req: AdminRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=LeadController.d.ts.map