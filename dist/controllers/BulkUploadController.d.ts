import { Request, Response, NextFunction } from "express";
export declare class BulkUploadController {
    /**
     * Upload and process CSV/Excel file
     */
    static bulkUpload(req: Request, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * Download CSV template based on operation type
     */
    static downloadTemplate(req: Request, res: Response): Promise<void>;
    /**
     * Get import history
     */
    static getImportHistory(req: Request, res: Response, next: NextFunction): Promise<void>;
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