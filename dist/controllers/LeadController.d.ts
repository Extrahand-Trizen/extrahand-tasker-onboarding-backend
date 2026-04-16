import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
export declare class LeadController {
    static getStatusReasonCodes(req: AdminRequest, res: Response): Promise<void>;
    private static extractVerifiedSkillCertificates;
    /**
     * Create a new lead
     * POST /api/v1/admin/caos/leads
     */
    static createLead(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Get lead by ID
     * GET /api/v1/admin/caos/leads/:leadId
     * ✅ ISOLATION: Qualifiers can only access leads they added
     */
    static getLead(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Get conversion status (did lead register on main website and verify Aadhaar?)
     * GET /api/v1/onboarding/leads/:leadId/conversion-status
     */
    static getConversionStatus(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Get verified skill certificates for a lead from platform profile.
     * GET /api/v1/onboarding/leads/:leadId/verified-certificates
     */
    static getVerifiedCertificates(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Get unique users who have added leads (for filter dropdown)
     * GET /api/v1/onboarding/leads/creators
     */
    static getLeadCreators(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Search and filter leads
     * GET /api/v1/admin/caos/leads
     * ✅ ISOLATION: Qualifiers only see leads they added
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
     * ✅ ISOLATION: Qualifiers can only update leads they added
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
    /**
     * Delete a lead
     * DELETE /api/v1/admin/caos/leads/:leadId
     */
    static deleteLead(req: AdminRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=LeadController.d.ts.map