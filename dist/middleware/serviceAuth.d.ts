import { Request, Response, NextFunction } from 'express';
export interface ServiceRequest extends Request {
    service?: {
        name: string;
        userId?: string;
    };
}
export declare const serviceAuthMiddleware: (req: ServiceRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=serviceAuth.d.ts.map