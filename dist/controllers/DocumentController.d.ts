import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
export declare class DocumentController {
    /**
     * Upload document for a lead
     * POST /api/v1/admin/caos/leads/:leadId/documents
     */
    static uploadDocument(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Verify or reject a document
     * PUT /api/v1/admin/caos/leads/:leadId/documents/:documentIndex
     */
    static verifyDocument(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Delete a document
     * DELETE /api/v1/admin/caos/leads/:leadId/documents/:documentIndex
     */
    static deleteDocument(req: AdminRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=DocumentController.d.ts.map