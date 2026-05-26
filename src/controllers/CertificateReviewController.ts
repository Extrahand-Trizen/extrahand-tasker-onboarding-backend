import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
import {
  CertificateReviewService,
  CertificateStatus,
} from '../services/CertificateReviewService';
import logger from '../config/logger';

export class CertificateReviewController {
  /**
   * Search certificate review queue.
   * GET /api/v1/onboarding/certificates/queue
   *
   * Notes:
   * - Current user-service does not expose a bulk "all profiles" endpoint.
   * - Queue is generated from profile search (`q`) and/or specific `uid`.
   */
  static async getQueue(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const actorUid = req.admin.userId || req.admin.uid;
      if (!actorUid) {
        res.status(401).json({
          success: false,
          error: 'Authenticated admin identity not found',
        });
        return;
      }

      const {
        q,
        uid,
        status,
        city,
        page = '1',
        limit = '20',
      } = req.query;

      const statusTrimmed = (status as string | undefined)?.trim();
      const normalizedStatus =
        statusTrimmed === 'pending' ||
        statusTrimmed === 'verified' ||
        statusTrimmed === 'rejected'
          ? (statusTrimmed as CertificateStatus)
          : undefined;

      if (statusTrimmed && !normalizedStatus) {
        res.status(400).json({
          success: false,
          error: 'Invalid status filter. Allowed: pending, verified, rejected',
        });
        return;
      }

      const parsedPage = Math.max(parseInt(page as string, 10) || 1, 1);
      const parsedLimit = Math.min(
        Math.max(parseInt(limit as string, 10) || 20, 1),
        100
      );
      const actorRole = (req.admin.role || '').trim().toLowerCase();
      const restrictToOwnReviewedDecisions =
        actorRole === 'onboarder' && normalizedStatus !== 'pending';
      const reviewerIdentities = [
        req.admin.name?.trim(),
        req.admin.email?.trim(),
        actorUid,
      ].filter((value): value is string => !!value);

      const queue = await CertificateReviewService.getQueueFromUserService({
        actorUid,
        uid: uid ? String(uid).trim() : undefined,
        q: q ? String(q).trim() : undefined,
        status: normalizedStatus,
        city: city as string | undefined,
        page: parsedPage,
        limit: parsedLimit,
        onlyOwnReviewedDecisions: restrictToOwnReviewedDecisions,
        reviewerUserId: restrictToOwnReviewedDecisions ? actorUid : undefined,
        reviewerIdentities:
          restrictToOwnReviewedDecisions && reviewerIdentities.length > 0
            ? reviewerIdentities
            : undefined,
      });

      res.json({
        success: true,
        data: {
          items: queue.items,
          pagination: queue.pagination,
        },
      });
    } catch (error: any) {
      logger.error('Certificate queue fetch failed', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch certificate queue',
        message: error.message,
      });
    }
  }

  /**
   * GET /api/v1/onboarding/certificates/analytics
   */
  static async getAnalytics(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const actorUid = req.admin.userId || req.admin.uid;
      if (!actorUid) {
        res.status(401).json({
          success: false,
          error: 'Authenticated admin identity not found',
        });
        return;
      }

      const { from, to } = req.query;
      const data = await CertificateReviewService.getAnalyticsFromUserService({
        actorUid,
        from: from ? String(from) : undefined,
        to: to ? String(to) : undefined,
      });

      res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      logger.error('Certificate analytics fetch failed', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch certificate analytics',
        message: error.message,
      });
    }
  }

  static async verify(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const actorUid = req.admin.userId || req.admin.uid;
      if (!actorUid) {
        res.status(401).json({
          success: false,
          error: 'Authenticated admin identity not found',
        });
        return;
      }

      const { uid, skillIndex, certificateIndex } = req.params;
      const { reviewNotes } = req.body || {};

      await CertificateReviewService.updateCertificateStatus({
        uid,
        skillIndex: parseInt(skillIndex, 10),
        certificateIndex: parseInt(certificateIndex, 10),
        nextStatus: 'verified',
        actorUid,
        actorName: req.admin.name,
        actorEmail: req.admin.email,
        reviewNotes,
      });

      res.json({
        success: true,
        message: 'Certificate verified successfully',
      });
    } catch (error: any) {
      const badRequest =
        error.message?.includes('Invalid') ||
        error.message?.includes('required') ||
        error.message?.includes('already reviewed');
      const notFound = error.message?.includes('Profile not found');
      const statusCode = badRequest ? 400 : notFound ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: badRequest || notFound ? error.message : 'Failed to verify certificate',
        message: error.message,
      });
    }
  }

  static async reject(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const actorUid = req.admin.userId || req.admin.uid;
      if (!actorUid) {
        res.status(401).json({
          success: false,
          error: 'Authenticated admin identity not found',
        });
        return;
      }

      const { uid, skillIndex, certificateIndex } = req.params;
      const { rejectionReason, reviewNotes } = req.body || {};

      await CertificateReviewService.updateCertificateStatus({
        uid,
        skillIndex: parseInt(skillIndex, 10),
        certificateIndex: parseInt(certificateIndex, 10),
        nextStatus: 'rejected',
        actorUid,
        actorName: req.admin.name,
        actorEmail: req.admin.email,
        rejectionReason,
        reviewNotes,
      });

      res.json({
        success: true,
        message: 'Certificate rejected successfully',
      });
    } catch (error: any) {
      const badRequest =
        error.message?.includes('Invalid') ||
        error.message?.includes('required') ||
        error.message?.includes('already reviewed');
      const notFound = error.message?.includes('Profile not found');
      const statusCode = badRequest ? 400 : notFound ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: badRequest || notFound ? error.message : 'Failed to reject certificate',
        message: error.message,
      });
    }
  }
}
