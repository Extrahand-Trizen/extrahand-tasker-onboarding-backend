import express from 'express';
import { CertificateReviewController } from '../controllers/CertificateReviewController';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { requirePermission } from '../middleware/roleAuth';

const router = express.Router();

router.use(adminAuthMiddleware);

router.get(
  '/queue',
  requirePermission('canVerifyUserCertificates'),
  CertificateReviewController.getQueue
);

router.put(
  '/:uid/:skillIndex/:certificateIndex/verify',
  requirePermission('canVerifyUserCertificates'),
  CertificateReviewController.verify
);

router.put(
  '/:uid/:skillIndex/:certificateIndex/reject',
  requirePermission('canVerifyUserCertificates'),
  CertificateReviewController.reject
);

export default router;
