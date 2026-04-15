export type CertificateStatus = 'pending' | 'verified' | 'rejected';
interface ProfileCertificate {
    uploadedAt?: string;
    title?: string;
    issuedBy?: string;
    issuedDate?: string;
    documentUrl?: string;
    verificationType?: 'certified' | 'licensed';
    certificateType?: string;
    issuingAuthority?: string;
    certificateNumber?: string;
    issueDate?: string;
    expiryDate?: string;
    status?: CertificateStatus;
    reviewedBy?: string;
    /** Admin/onboarder stable id (analytics) */
    reviewedByUserId?: string;
    reviewedAt?: string;
    rejectionReason?: string;
    reviewNotes?: string;
}
export interface CertificateQueueItem {
    uid: string;
    name?: string;
    email?: string;
    phone?: string;
    city?: string;
    skillIndex: number;
    skillName: string;
    certificateIndex: number;
    certificate: ProfileCertificate;
}
export declare class CertificateReviewService {
    private static getHeaders;
    private static getProfileBaseUrl;
    static getProfileByUid(uid: string, actorUid: string): Promise<any>;
    static searchProfiles(searchQuery: string, actorUid: string): Promise<any[]>;
    static getQueueFromUserService(params: {
        actorUid: string;
        uid?: string;
        q?: string;
        status?: CertificateStatus;
        city?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        items: CertificateQueueItem[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    static getAnalyticsFromUserService(params: {
        actorUid: string;
        from?: string;
        to?: string;
    }): Promise<Record<string, unknown>>;
    static buildQueueFromProfiles(profiles: any[], filters?: {
        status?: CertificateStatus;
        city?: string;
        sortByLatest?: boolean;
    }): CertificateQueueItem[];
    static updateCertificateStatus(params: {
        uid: string;
        skillIndex: number;
        certificateIndex: number;
        nextStatus: CertificateStatus;
        actorUid: string;
        actorName?: string;
        actorEmail?: string;
        rejectionReason?: string;
        reviewNotes?: string;
    }): Promise<void>;
}
export {};
//# sourceMappingURL=CertificateReviewService.d.ts.map