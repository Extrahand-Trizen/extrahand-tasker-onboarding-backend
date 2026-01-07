export declare class UploadService {
    /**
     * Upload document (image/pdf) and return URL/key.
     * Used for onboarding document uploads (Aadhaar, PAN, photos, etc.)
     */
    static uploadDocument(adminUid: string, fileBuffer: Buffer, filename: string, mimetype: string, docType?: string, leadId?: string): Promise<{
        url: string;
        key: string;
    }>;
}
//# sourceMappingURL=UploadService.d.ts.map