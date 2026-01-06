import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import { env } from '../config/env';

export interface ServiceRequest extends Request {
  service?: {
    name: string;
    userId?: string;
  };
}

export const serviceAuthMiddleware = (
  req: ServiceRequest,
  res: Response,
  next: NextFunction
) => {
  const serviceAuthToken = req.headers['x-service-auth'];
  const serviceName = req.headers['x-service-name'];
  const userId = req.headers['x-user-id'] as string;

  if (!serviceAuthToken || serviceAuthToken !== env.SERVICE_AUTH_TOKEN) {
    logger.warn('Service auth failed', {
      provided: serviceAuthToken ? 'present' : 'missing'
    });
    return res.status(401).json({
      success: false,
      error: 'Service authentication required'
    });
  }

  req.service = {
    name: serviceName as string || 'unknown',
    userId
  };

  next();
};

