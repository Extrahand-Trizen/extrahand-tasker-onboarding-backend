import axios from 'axios';
import { env } from '../config/env';
import logger from '../config/logger';

export interface MicrosoftTokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

export interface MicrosoftUserInfo {
  sub: string; // Microsoft user ID
  name: string;
  email: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<MicrosoftTokenResponse> {
  try {
    const response = await axios.post(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'openid profile email',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data;
  } catch (error: any) {
    logger.error('Failed to exchange code for tokens', {
      error: error.response?.data || error.message,
    });
    throw new Error('Failed to authenticate with Microsoft');
  }
}

/**
 * Decode ID token to get user info
 * Note: In production, you should verify the token signature
 */
export function decodeIdToken(idToken: string): MicrosoftUserInfo {
  try {
    // ID token is a JWT with 3 parts: header.payload.signature
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid ID token format');
    }

    const payload = parts[1];
    const decodedPayload = Buffer.from(payload, 'base64').toString('utf-8');
    const userInfo = JSON.parse(decodedPayload);

    return {
      sub: userInfo.sub,
      name: userInfo.name,
      email: userInfo.email || userInfo.preferred_username,
      given_name: userInfo.given_name,
      family_name: userInfo.family_name,
      picture: userInfo.picture,
    };
  } catch (error: any) {
    logger.error('Failed to decode ID token', { error: error.message });
    throw new Error('Invalid ID token');
  }
}

/**
 * Get Microsoft OAuth authorization URL
 */
export function getAuthorizationUrl(
  redirectUri: string,
  state?: string
): string {
  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    response_mode: 'query',
  });

  if (state) {
    params.append('state', state);
  }

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Validate email domain
 */
export function isAllowedEmailDomain(email: string): boolean {
  const allowedDomains = [
    '@trizenventures.com',
    '@extrahand.in',
  ];

  return allowedDomains.some((domain) => email.toLowerCase().endsWith(domain));
}
