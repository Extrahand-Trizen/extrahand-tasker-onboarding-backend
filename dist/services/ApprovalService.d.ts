import { ILead } from '../models/Lead';
export interface ApprovalCriteria {
    hasRequiredDocuments: boolean;
    hasVerifiedDocuments: boolean;
    hasSkills: boolean;
    hasRequiredFields: boolean;
    isNotBlacklisted: boolean;
    isNotDuplicate: boolean;
    missingRequirements: string[];
    canApprove: boolean;
}
export declare class ApprovalService {
    /**
     * Check if a lead meets approval criteria
     */
    static checkApprovalCriteria(lead: ILead): ApprovalCriteria;
    /**
     * Get leads ready for approval (under_verification status)
     */
    static getApprovalQueue(filters?: {
        city?: string;
        primarySkill?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        leads: ILead[];
        total: number;
        page: number;
        limit: number;
    }>;
    /**
     * Get leads ready for activation (approved status)
     */
    static getActivationQueue(filters?: {
        city?: string;
        primarySkill?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        leads: ILead[];
        total: number;
        page: number;
        limit: number;
    }>;
}
//# sourceMappingURL=ApprovalService.d.ts.map