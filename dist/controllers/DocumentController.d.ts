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
     * Initiate Aadhaar verification (sends OTP to user's mobile)
     * POST /api/v1/admin/caos/leads/:leadId/documents/:documentIndex/verify-aadhaar/initiate
     */
    static initiateAadhaarVerification(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Verify Aadhaar OTP
     * POST /api/v1/admin/caos/leads/:leadId/documents/:documentIndex/verify-aadhaar/verify
     */
    static verifyAadhaarOTP(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Verify PAN via Cashfree API
     * POST /api/v1/admin/caos/leads/:leadId/documents/:documentIndex/verify-pan
     */
    static verifyPAN(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Delete a document
     * DELETE /api/v1/admin/caos/leads/:leadId/documents/:documentIndex
     */
    static deleteDocument(req: AdminRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=DocumentController.d.ts.map