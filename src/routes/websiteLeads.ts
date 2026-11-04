import { Router, Response } from 'express';
import axios from 'axios';
import { AdminRequest, adminAuthMiddleware } from '../middleware/adminAuth';
import { requireRole } from '../middleware/roleAuth';
import { env } from '../config/env';
import logger from '../config/logger';

const router = Router();

router.use(adminAuthMiddleware, requireRole('onboarder', 'lead_access_manager'));

function getServiceConfig(): { baseUrl: string; token: string } | undefined {
  if (!env.CONTENT_ADMIN_SERVICE_URL || !env.SERVICE_AUTH_TOKEN) {
    return undefined;
  }

  return {
    baseUrl: env.CONTENT_ADMIN_SERVICE_URL.replace(/\/+$/, ''),
    token: env.SERVICE_AUTH_TOKEN,
  };
}

function getRemoteError(error: unknown): { status: number; message: string } {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as { error?: string; message?: string } | undefined;
    const status = error.response?.status;
    return {
      status: status && status >= 400 && status < 500 ? status : 502,
      message: responseData?.error || responseData?.message || 'Website leads service is unavailable.',
    };
  }

  return { status: 502, message: 'Website leads service is unavailable.' };
}

router.get('/', async (req: AdminRequest, res: Response) => {
  const service = getServiceConfig();
  if (!service) {
    res.status(503).json({
      success: false,
      error: 'Website leads service is not configured.',
    });
    return;
  }

  const params = Object.fromEntries(
    ['page', 'limit', 'search', 'city']
      .filter((key) => typeof req.query[key] === 'string')
      .map((key) => [key, req.query[key]])
  );

  try {
    const response = await axios.get(`${service.baseUrl}/api/partner-leads/service`, {
      params,
      headers: { 'X-Service-Auth': service.token },
      timeout: 10000,
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    const remoteError = getRemoteError(error);
    logger.error('Failed to fetch website leads from content admin service', {
      status: remoteError.status,
      message: remoteError.message,
    });
    res.status(remoteError.status).json({ success: false, error: remoteError.message });
  }
});

router.post('/:leadId/claim', async (req: AdminRequest, res: Response) => {
  const service = getServiceConfig();
  if (!service) {
    res.status(503).json({
      success: false,
      error: 'Website leads service is not configured.',
    });
    return;
  }

  const claimantId = req.admin?.userId || req.admin?.uid;
  if (!claimantId) {
    res.status(401).json({ success: false, error: 'Authenticated user identity is missing.' });
    return;
  }

  try {
    const response = await axios.post(
      `${service.baseUrl}/api/partner-leads/service/${encodeURIComponent(req.params.leadId)}/claim`,
      {
        claimedBy: claimantId,
        claimedByName: req.admin?.name || req.admin?.email || claimantId,
      },
      {
        headers: { 'X-Service-Auth': service.token },
        timeout: 10000,
      }
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    const remoteError = getRemoteError(error);
    logger.error('Failed to claim website lead in content admin service', {
      leadId: req.params.leadId,
      actor: claimantId,
      status: remoteError.status,
      message: remoteError.message,
    });
    res.status(remoteError.status).json({ success: false, error: remoteError.message });
  }
});

export default router;
