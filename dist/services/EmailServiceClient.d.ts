export interface EmailSendRequest {
    email: string;
    name: string;
    phone?: string;
}
export interface EmailSendResponse {
    success: boolean;
    message?: string;
    messageId?: string;
    error?: string;
}
export declare class EmailServiceClient {
    private static baseUrl;
    private static serviceAuthToken;
    private static getBaseUrl;
    /**
     * Send admin invite email
     * Note: Email is queued and sent asynchronously - response is immediate
     */
    static sendAdminInviteEmail(email: string, role: string, inviteLink: string, expiresAt: Date, team?: string, department?: string): Promise<EmailSendResponse>;
    /**
     * Send account created email
     * Note: Email is queued and sent asynchronously - response is immediate
     */
    static sendAccountCreatedEmail(email: string, name: string, phone?: string): Promise<EmailSendResponse>;
    /**
     * Send generic email
     * Note: Email is queued and sent asynchronously - response is immediate
     */
    static sendEmail(params: {
        to: string | string[];
        subject: string;
        template?: string;
        data?: Record<string, any>;
        html?: string;
        text?: string;
    }): Promise<EmailSendResponse>;
    /**
     * Send password reset email
     */
    static sendPasswordResetEmail(email: string, resetLink: string, name?: string, expiresAt?: Date): Promise<EmailSendResponse>;
}
//# sourceMappingURL=EmailServiceClient.d.ts.map