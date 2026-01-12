import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import logger from '../config/logger';

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
export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: '15m',
    issuer: 'extrahand-admin-service',
    audience: 'extrahand-admin',
  });
}

/**
 * Generate refresh token (long-lived: 7 days)
 */
export function generateRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
    issuer: 'extrahand-admin-service',
    audience: 'extrahand-admin',
  });
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'extrahand-admin-service',
      audience: 'extrahand-admin',
    }) as AccessTokenPayload;
    return decoded;
  } catch (error: any) {
    logger.warn('Access token verification failed', { error: error.message });
    throw new Error('Invalid or expired access token');
  }
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: 'extrahand-admin-service',
      audience: 'extrahand-admin',
    }) as RefreshTokenPayload;
    return decoded;
  } catch (error: any) {
    logger.warn('Refresh token verification failed', { error: error.message });
    throw new Error('Invalid or expired refresh token');
  }
}

/**
 * Generate token pair (access + refresh)
 */
export function generateTokenPair(user: {
  userId: string;
  email: string;
  role: string;
  team?: string;
  department?: string;
}): { accessToken: string; refreshToken: string } {
  const accessToken = generateAccessToken({
    userId: user.userId,
    email: user.email,
    role: user.role,
    team: user.team,
    department: user.department,
  });

  const refreshToken = generateRefreshToken({
    userId: user.userId,
  });

  return { accessToken, refreshToken };
}
