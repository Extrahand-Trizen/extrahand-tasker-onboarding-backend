import { Router } from 'express';
import { AnalyticsController } from '../controllers/AnalyticsController';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { requirePermission } from '../middleware/roleAuth';

const router = Router();

router.use(adminAuthMiddleware);

router.get(
  '/overview',
  requirePermission('canViewAnalytics'),
  AnalyticsController.getOverview
);

export default router;






