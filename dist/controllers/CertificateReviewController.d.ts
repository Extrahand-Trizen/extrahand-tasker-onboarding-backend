import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
export declare class CertificateReviewController {
    /**
     * Search certificate review queue.
     * GET /api/v1/onboarding/certificates/queue
     *
     * Notes:
     * - Current user-service does not expose a bulk "all profiles" endpoint.
     * - Queue is generated from profile search (`q`) and/or specific `uid`.
     */
    static getQueue(req: AdminRequest, res: Response): Promise<void>;
    /**
     * GET /api/v1/onboarding/certificates/analytics
     */
    static getAnalytics(req: AdminRequest, res: Response): Promise<void>;
    static verify(req: AdminRequest, res: Response): Promise<void>;
    static reject(req: AdminRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=CertificateReviewController.d.ts.map