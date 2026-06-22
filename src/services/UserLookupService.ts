import axios from 'axios';
import { env } from '../config/env';
import logger from '../config/logger';

export interface ConversionStatus {
  converted: boolean;
  platformUid?: string;
  isAadhaarVerified?: boolean;
  name?: string;
  createdAt?: Date;
}

/**
 * Normalize phone to a format we can send to user-service (e.g. +91XXXXXXXXXX).
 */
function normalizePhone(phone: string | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10) return null;
  const ten = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  return ten.startsWith('91') ? `+${ten}` : `+91${ten}`;
}

/**
 * Look up platform user by phone (for onboarding conversion status).
 * Calls user-service POST /api/v1/auth/user-by-phone with service auth.
 */
export async function getConversionStatusByPhone(
  phone: string | undefined
): Promise<ConversionStatus> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { converted: false };
  }

  const baseUrl = env.USER_SERVICE_URL;
  if (!baseUrl) {
    logger.warn('USER_SERVICE_URL not configured, skipping conversion lookup');
    return { converted: false };
  }

  const token = env.SERVICE_AUTH_TOKEN;
  if (!token) {
    logger.warn('SERVICE_AUTH_TOKEN not configured');
    return { converted: false };
  }

  try {
    const response = await axios.post(
      `${baseUrl}/api/v1/auth/user-by-phone`,
      { phone: normalized },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Auth': token,
          'X-Service-Name': 'tasker-onboarding-backend',
        },
        timeout: 10000,
        validateStatus: (status) => status === 200 || status === 404,
      }
    );

    if (response.status === 404 || !response.data?.success) {
      return { converted: false };
    }

    const data = response.data.data;
    if (!data?.uid) {
      return { converted: false };
    }

    return {
      converted: true,
      platformUid: data.uid,
      isAadhaarVerified: !!data.isAadhaarVerified,
      name: data.name,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    };
  } catch (err: any) {
    logger.warn('Conversion lookup failed', {
      phone: normalized ? `${normalized.slice(0, 6)}****` : 'none',
      error: err.message,
    });
    return { converted: false };
  }
}
