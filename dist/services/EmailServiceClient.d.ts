export interface EmailSendRequest {
    email: string;
    name: string;
    phone?: string;
}
export interface EmailSendResponse {
    success: boolean;
    messageId?: string;
    error?: string;
}
export declare class EmailServiceClient {
    private static baseUrl;
    private static serviceAuthToken;
    /**
     * Send admin invite email
     */
    static sendAdminInviteEmail(email: string, role: string, inviteLink: string, expiresAt: Date, team?: string, department?: string): Promise<EmailSendResponse>;
    /**
     * Send account created email
     */
    static sendAccountCreatedEmail(email: string, name: string, phone?: string): Promise<EmailSendResponse>;
    /**
     * Send generic email
     */
    static sendEmail(params: {
        to: string | string[];
        subject: string;
        template?: string;
        data?: Record<string, any>;
        html?: string;
        text?: string;
    }): Promise<EmailSendResponse>;
}
//# sourceMappingURL=EmailServiceClient.d.ts.map