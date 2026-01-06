import { ILead, LeadStatus } from '../models/Lead';
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
    /**
     * Get verification queue - leads with pending documents
     * GET /api/v1/admin/caos/leads/verification-queue
     */
    static getVerificationQueue(filters?: {
        documentType?: string;
        status?: LeadStatus;
        city?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        leads: Array<ILead & {
            pendingDocuments: Array<{
                index: number;
                type: ILead['documents'][0]['type'];
                url?: string;
                uploadedAt?: Date;
            }>;
        }>;
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
}
//# sourceMappingURL=ApprovalService.d.ts.map