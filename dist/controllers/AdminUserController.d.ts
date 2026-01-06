import { Request, Response } from 'express';
export declare class AdminUserController {
    static list(req: Request, res: Response): Promise<void>;
    static create(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    static updateRole(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    static resetPassword(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=AdminUserController.d.ts.map