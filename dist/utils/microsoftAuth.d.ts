export interface MicrosoftTokenResponse {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in: number;
}
export interface MicrosoftUserInfo {
    sub: string;
    name: string;
    email: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
}
/**
 * Exchange authorization code for tokens
 */
export declare function exchangeCodeForTokens(code: string, redirectUri: string): Promise<MicrosoftTokenResponse>;
/**
 * Decode ID token to get user info
 * Note: In production, you should verify the token signature
 */
export declare function decodeIdToken(idToken: string): MicrosoftUserInfo;
/**
 * Get Microsoft OAuth authorization URL
 */
export declare function getAuthorizationUrl(redirectUri: string, state?: string): string;
/**
 * Validate email domain
 */
export declare function isAllowedEmailDomain(email: string): boolean;
//# sourceMappingURL=microsoftAuth.d.ts.map