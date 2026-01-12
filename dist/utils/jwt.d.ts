export interface AccessTokenPayload {
    userId: string;
    email: string;
    role: string;
    team?: string;
    department?: string;
}
export interface RefreshTokenPayload {
    userId: string;
}
/**
 * Generate access token (short-lived: 15 minutes)
 */
export declare function generateAccessToken(payload: AccessTokenPayload): string;
/**
 * Generate refresh token (long-lived: 7 days)
 */
export declare function generateRefreshToken(payload: RefreshTokenPayload): string;
/**
 * Verify access token
 */
export declare function verifyAccessToken(token: string): AccessTokenPayload;
/**
 * Verify refresh token
 */
export declare function verifyRefreshToken(token: string): RefreshTokenPayload;
/**
 * Generate token pair (access + refresh)
 */
export declare function generateTokenPair(user: {
    userId: string;
    email: string;
    role: string;
    team?: string;
    department?: string;
}): {
    accessToken: string;
    refreshToken: string;
};
//# sourceMappingURL=jwt.d.ts.map