import { Router } from 'express';
import { EmailTemplateController } from '../controllers/EmailTemplateController';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { requirePermission } from '../middleware/roleAuth';

const router = Router();

// All routes require admin authentication
router.use(adminAuthMiddleware);

// Get all templates
router.get(
  '/',
  requirePermission('canCommunicate'),
  EmailTemplateController.listTemplates
);

// Get template categories
router.get(
  '/categories',
  requirePermission('canCommunicate'),
  EmailTemplateController.getCategories
);

// Get built-in variables
router.get(
  '/variables/built-in',
  requirePermission('canCommunicate'),
  EmailTemplateController.getBuiltInVariables
);

// Create new template
router.post(
  '/',
  requirePermission('canCommunicate'),
  EmailTemplateController.createTemplate
);

// Get template by slug (must be before /:id)
router.get(
  '/slug/:slug',
  requirePermission('canCommunicate'),
  EmailTemplateController.getTemplateBySlug
);

// Get template by ID
router.get(
  '/:id',
  requirePermission('canCommunicate'),
  EmailTemplateController.getTemplate
);

// Update template
router.put(
  '/:id',
  requirePermission('canCommunicate'),
  EmailTemplateController.updateTemplate
);

// Delete template (archive)
router.delete(
  '/:id',
  requirePermission('canCommunicate'),
  EmailTemplateController.deleteTemplate
);

// Restore archived template
router.post(
  '/:id/restore',
  requirePermission('canCommunicate'),
  EmailTemplateController.restoreTemplate
);

// Duplicate template
router.post(
  '/:id/duplicate',
  requirePermission('canCommunicate'),
  EmailTemplateController.duplicateTemplate
);

// Preview template
router.post(
  '/:id/preview',
  requirePermission('canCommunicate'),
  EmailTemplateController.previewTemplate
);

// Send test email
router.post(
  '/:id/test',
  requirePermission('canCommunicate'),
  EmailTemplateController.testTemplate
);

// Get template variables
router.get(
  '/:id/variables',
  requirePermission('canCommunicate'),
  EmailTemplateController.getTemplateVariables
);

export default router;
