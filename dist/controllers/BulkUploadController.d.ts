import { Request, Response, NextFunction } from "express";
import { AdminRequest } from "../middleware/adminAuth";
export declare class BulkUploadController {
    /**
     * Preview bulk upload without creating records
     */
    static previewBulkUpload(req: AdminRequest, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Upload and process CSV/Excel file
     */
    static bulkUpload(req: AdminRequest, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Download CSV template based on operation type
     */
    static downloadTemplate(req: Request, res: Response): Promise<void>;
    /**
     * Get import history
     */
    static getImportHistory(req: AdminRequest, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Get import details
     */
    static getImportDetails(req: Request, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Get imported users/leads for an import (paginated)
     */
    static getImportedUsers(req: Request, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Export UIDs from import (CSV format with uid, name, phone)
     */
    static exportUids(req: Request, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
}
//# sourceMappingURL=BulkUploadController.d.ts.map