import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
export declare class BulkLeadImportController {
    /**
     * Bulk import leads from CSV
     * POST /api/v1/admin/caos/leads/bulk-import
     */
    static bulkImport(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Download CSV template
     * GET /api/v1/admin/caos/leads/bulk-import/template?primaryCategory=handyperson&secondaryCategory=Plumbing
     */
    static downloadTemplate(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Get import history
     * GET /api/v1/admin/caos/leads/bulk-import/history
     */
    static getImportHistory(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Get import details
     * GET /api/v1/admin/caos/leads/bulk-import/:importId
     */
    static getImportDetails(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Export UIDs from import (CSV format with uid, name, phone)
     * GET /api/v1/admin/caos/leads/bulk-import/:importId/export-uids
     */
    static exportUids(req: AdminRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=BulkLeadImportController.d.ts.map