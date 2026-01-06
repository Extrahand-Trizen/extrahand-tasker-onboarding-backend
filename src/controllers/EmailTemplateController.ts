import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
import {
  EmailTemplateService,
  CreateEmailTemplateData,
  UpdateEmailTemplateData,
  PreviewTemplateData,
  TestEmailData
} from '../services/EmailTemplateService';
import logger from '../config/logger';
import { getBuiltInVariablesByCategory } from '../utils/templateVariables';

export class EmailTemplateController {
  /**
   * Create a new email template
   * POST /api/v1/admin/email-templates
   */
  static async createTemplate(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const {
        name,
        slug,
        description,
        subject,
        htmlContent,
        textContent,
        category,
        tags,
        variables,
        fromName,
        fromEmail,
        replyTo,
        isPublic,
        allowedRoles
      } = req.body;

      if (!name || !subject || !htmlContent || !category) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'Name, subject, htmlContent, and category are required'
        });
        return;
      }

      const templateData: CreateEmailTemplateData = {
        name,
        slug,
        description,
        subject,
        htmlContent,
        textContent,
        category,
        tags: tags || [],
        variables: variables || [],
        fromName,
        fromEmail,
        replyTo,
        isPublic,
        allowedRoles,
        createdBy: req.admin.uid,
        createdByName: req.admin.name
      };

      const template = await EmailTemplateService.createTemplate(templateData);

      res.status(201).json({
        success: true,
        data: template,
        message: 'Email template created successfully'
      });
    } catch (error: any) {
      logger.error('Error creating email template', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to create email template'
      });
    }
  }

  /**
   * Get all email templates
   * GET /api/v1/admin/email-templates
   */
  static async listTemplates(req: AdminRequest, res: Response): Promise<void> {
    try {
      const {
        category,
        status,
        search,
        tags,
        page,
        limit
      } = req.query;

      const filters: any = {};
      if (category) filters.category = category;
      if (status) filters.status = status;
      if (search) filters.search = String(search);
      if (tags) {
        filters.tags = Array.isArray(tags) ? tags : [tags];
      }
      if (page) filters.page = parseInt(String(page), 10);
      if (limit) filters.limit = parseInt(String(limit), 10);

      const result = await EmailTemplateService.listTemplates(filters);

      res.json({
        success: true,
        data: result.templates,
        total: result.total,
        page: result.page,
        limit: result.limit
      });
    } catch (error: any) {
      logger.error('Error listing email templates', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to list email templates'
      });
    }
  }

  /**
   * Get template by ID
   * GET /api/v1/admin/email-templates/:id
   */
  static async getTemplate(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const template = await EmailTemplateService.getTemplateById(id);

      if (!template) {
        res.status(404).json({
          success: false,
          error: 'Template not found'
        });
        return;
      }

      res.json({
        success: true,
        data: template
      });
    } catch (error: any) {
      logger.error('Error getting email template', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get email template'
      });
    }
  }

  /**
   * Get template by slug
   * GET /api/v1/admin/email-templates/slug/:slug
   */
  static async getTemplateBySlug(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { slug } = req.params;

      const template = await EmailTemplateService.getTemplateBySlug(slug);

      if (!template) {
        res.status(404).json({
          success: false,
          error: 'Template not found'
        });
        return;
      }

      res.json({
        success: true,
        data: template
      });
    } catch (error: any) {
      logger.error('Error getting email template by slug', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get email template'
      });
    }
  }

  /**
   * Update template
   * PUT /api/v1/admin/email-templates/:id
   */
  static async updateTemplate(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { id } = req.params;
      const updateData: UpdateEmailTemplateData = {
        ...req.body,
        updatedBy: req.admin.uid
      };

      const template = await EmailTemplateService.updateTemplate(id, updateData);

      if (!template) {
        res.status(404).json({
          success: false,
          error: 'Template not found'
        });
        return;
      }

      res.json({
        success: true,
        data: template,
        message: 'Email template updated successfully'
      });
    } catch (error: any) {
      logger.error('Error updating email template', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to update email template'
      });
    }
  }

  /**
   * Delete template (archive)
   * DELETE /api/v1/admin/email-templates/:id
   */
  static async deleteTemplate(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      await EmailTemplateService.deleteTemplate(id);

      res.json({
        success: true,
        message: 'Email template archived successfully'
      });
    } catch (error: any) {
      logger.error('Error deleting email template', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to delete email template'
      });
    }
  }

  /**
   * Restore archived template
   * POST /api/v1/admin/email-templates/:id/restore
   */
  static async restoreTemplate(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const template = await EmailTemplateService.restoreTemplate(id);

      if (!template) {
        res.status(404).json({
          success: false,
          error: 'Template not found'
        });
        return;
      }

      res.json({
        success: true,
        data: template,
        message: 'Email template restored successfully'
      });
    } catch (error: any) {
      logger.error('Error restoring email template', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to restore email template'
      });
    }
  }

  /**
   * Duplicate template
   * POST /api/v1/admin/email-templates/:id/duplicate
   */
  static async duplicateTemplate(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { id } = req.params;
      const { newName } = req.body;

      if (!newName) {
        res.status(400).json({
          success: false,
          error: 'newName is required'
        });
        return;
      }

      const duplicated = await EmailTemplateService.duplicateTemplate(
        id,
        newName,
        req.admin.uid,
        req.admin.name
      );

      res.status(201).json({
        success: true,
        data: duplicated,
        message: 'Email template duplicated successfully'
      });
    } catch (error: any) {
      logger.error('Error duplicating email template', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to duplicate email template'
      });
    }
  }

  /**
   * Preview template
   * POST /api/v1/admin/email-templates/:id/preview
   */
  static async previewTemplate(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { variables } = req.body;

      const previewData: PreviewTemplateData = { variables };

      const result = await EmailTemplateService.previewTemplate(id, previewData);

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Error previewing email template', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to preview email template'
      });
    }
  }

  /**
   * Send test email
   * POST /api/v1/admin/email-templates/:id/test
   */
  static async testTemplate(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { id } = req.params;
      const { testEmail, variables } = req.body;

      if (!testEmail) {
        res.status(400).json({
          success: false,
          error: 'testEmail is required'
        });
        return;
      }

      // Preview template
      const previewData: PreviewTemplateData = { variables };
      const rendered = await EmailTemplateService.previewTemplate(id, previewData);

      // TODO: Integrate with email sending service
      // For now, just return the rendered template
      // In future: await EmailService.sendTestEmail(testEmail, rendered);

      // Update template testSentTo
      const template = await EmailTemplateService.getTemplateById(id);
      if (template) {
        const testSentTo = template.testSentTo || [];
        if (!testSentTo.includes(testEmail)) {
          testSentTo.push(testEmail);
          await EmailTemplateService.updateTemplate(id, {
            testSentTo,
            updatedBy: req.admin.uid
          } as any);
        }
      }

      res.json({
        success: true,
        message: 'Test email would be sent (email service integration pending)',
        data: {
          to: testEmail,
          subject: rendered.subject,
          preview: rendered.htmlContent.substring(0, 200) + '...'
        }
      });
    } catch (error: any) {
      logger.error('Error testing email template', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to send test email'
      });
    }
  }

  /**
   * Get template categories
   * GET /api/v1/admin/email-templates/categories
   */
  static async getCategories(req: AdminRequest, res: Response): Promise<void> {
    try {
      const categories = await EmailTemplateService.getCategories();

      res.json({
        success: true,
        data: { categories }
      });
    } catch (error: any) {
      logger.error('Error getting template categories', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get template categories'
      });
    }
  }

  /**
   * Get built-in variables
   * GET /api/v1/admin/email-templates/variables/built-in
   */
  static async getBuiltInVariables(req: AdminRequest, res: Response): Promise<void> {
    try {
      const variables = getBuiltInVariablesByCategory();

      res.json({
        success: true,
        data: variables
      });
    } catch (error: any) {
      logger.error('Error getting built-in variables', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get built-in variables'
      });
    }
  }

  /**
   * Get template variables
   * GET /api/v1/admin/email-templates/:id/variables
   */
  static async getTemplateVariables(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const template = await EmailTemplateService.getTemplateById(id);
      if (!template) {
        res.status(404).json({
          success: false,
          error: 'Template not found'
        });
        return;
      }

      const builtInVariables = getBuiltInVariablesByCategory();

      res.json({
        success: true,
        data: {
          variables: template.variables,
          builtInVariables
        }
      });
    } catch (error: any) {
      logger.error('Error getting template variables', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get template variables'
      });
    }
  }
}
