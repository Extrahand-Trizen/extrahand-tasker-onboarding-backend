import EmailTemplate, { IEmailTemplate, EmailTemplateCategory, EmailTemplateStatus, ITemplateVariable } from '../models/EmailTemplate';
import { replaceVariables, extractVariables, htmlToText, getDefaultVariableValues, validateRequiredVariables } from '../utils/templateRenderer';
import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

export interface CreateEmailTemplateData {
  name: string;
  slug?: string;
  description?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  category: EmailTemplateCategory;
  tags?: string[];
  variables?: ITemplateVariable[];
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  isPublic?: boolean;
  allowedRoles?: string[];
  createdBy: string;
  createdByName?: string;
}

export interface UpdateEmailTemplateData {
  name?: string;
  description?: string;
  subject?: string;
  htmlContent?: string;
  textContent?: string;
  category?: EmailTemplateCategory;
  tags?: string[];
  variables?: ITemplateVariable[];
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  status?: EmailTemplateStatus;
  isPublic?: boolean;
  allowedRoles?: string[];
  updatedBy: string;
}

export interface PreviewTemplateData {
  variables?: Record<string, any>;
}

export interface TestEmailData {
  testEmail: string;
  variables?: Record<string, any>;
}

export class EmailTemplateService {
  /**
   * Generate slug from name
   */
  static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Auto-extract variables from HTML content
   */
  static extractVariablesFromContent(htmlContent: string, subject: string): string[] {
    const htmlVars = extractVariables(htmlContent);
    const subjectVars = extractVariables(subject);
    return Array.from(new Set([...htmlVars, ...subjectVars]));
  }

  /**
   * Auto-generate text content from HTML
   */
  static generateTextContent(htmlContent: string): string {
    return htmlToText(htmlContent);
  }

  /**
   * Create a new email template
   */
  static async createTemplate(data: CreateEmailTemplateData): Promise<IEmailTemplate> {
    try {
      // Generate slug if not provided
      const slug = data.slug || this.generateSlug(data.name);
      
      // Check if slug already exists
      const existing = await EmailTemplate.findOne({ slug });
      if (existing) {
        throw new Error(`Template with slug "${slug}" already exists`);
      }

      // Auto-extract variables if not provided
      let variables = data.variables || [];
      if (variables.length === 0) {
        const extractedVars = this.extractVariablesFromContent(data.htmlContent, data.subject);
        variables = extractedVars.map(varName => ({
          name: varName,
          type: 'string' as const,
          required: false,
          description: `Variable: ${varName}`
        }));
      }

      // Auto-generate text content if not provided
      const textContent = data.textContent || this.generateTextContent(data.htmlContent);

      const template = new EmailTemplate({
        ...data,
        slug,
        variables,
        textContent,
        status: 'draft',
        version: 1,
        usageCount: 0,
        isDefault: false,
        isPublic: data.isPublic !== undefined ? data.isPublic : true,
        allowedRoles: data.allowedRoles || []
      });

      await template.save();
      
      logger.info('Email template created', {
        templateId: template._id,
        name: template.name,
        slug: template.slug,
        createdBy: data.createdBy
      });

      return template;
    } catch (error: any) {
      logger.error('Error creating email template', { error: error.message, data });
      throw error;
    }
  }

  /**
   * Get template by ID
   */
  static async getTemplateById(templateId: string): Promise<IEmailTemplate | null> {
    return EmailTemplate.findById(templateId);
  }

  /**
   * Get template by slug
   */
  static async getTemplateBySlug(slug: string): Promise<IEmailTemplate | null> {
    return EmailTemplate.findOne({ slug });
  }

  /**
   * List templates with filtering
   */
  static async listTemplates(filters: {
    category?: EmailTemplateCategory;
    status?: EmailTemplateStatus;
    search?: string;
    tags?: string[];
    page?: number;
    limit?: number;
  }): Promise<{ templates: IEmailTemplate[]; total: number; page: number; limit: number }> {
    const query: any = {};

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
        { subject: { $regex: filters.search, $options: 'i' } }
      ];
    }

    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [templates, total] = await Promise.all([
      EmailTemplate.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EmailTemplate.countDocuments(query)
    ]);

    return {
      templates: templates as IEmailTemplate[],
      total,
      page,
      limit
    };
  }

  /**
   * Update template
   */
  static async updateTemplate(
    templateId: string,
    data: UpdateEmailTemplateData
  ): Promise<IEmailTemplate | null> {
    try {
      const template = await EmailTemplate.findById(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      // If HTML content changed, regenerate text content
      if (data.htmlContent && data.htmlContent !== template.htmlContent) {
        data.textContent = data.textContent || this.generateTextContent(data.htmlContent);
        
        // Re-extract variables if not provided
        if (!data.variables) {
          const extractedVars = this.extractVariablesFromContent(data.htmlContent, data.subject || template.subject);
          data.variables = extractedVars.map(varName => {
            const existing = template.variables.find(v => v.name === varName);
            return existing || {
              name: varName,
              type: 'string' as const,
              required: false,
              description: `Variable: ${varName}`
            };
          });
        }
      }

      // Increment version
      const updateData: any = {
        ...data,
        version: template.version + 1,
        previousVersionId: template._id
      };

      const updated = await EmailTemplate.findByIdAndUpdate(
        templateId,
        updateData,
        { new: true, runValidators: true }
      );

      if (updated) {
        logger.info('Email template updated', {
          templateId: updated._id,
          version: updated.version,
          updatedBy: data.updatedBy
        });
      }

      return updated;
    } catch (error: any) {
      logger.error('Error updating email template', { error: error.message, templateId });
      throw error;
    }
  }

  /**
   * Delete template (soft delete - archive)
   */
  static async deleteTemplate(templateId: string): Promise<boolean> {
    const template = await EmailTemplate.findById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    if (template.isDefault) {
      throw new Error('Cannot delete default template');
    }

    template.status = 'archived';
    await template.save();

    logger.info('Email template archived', { templateId });
    return true;
  }

  /**
   * Restore archived template
   */
  static async restoreTemplate(templateId: string): Promise<IEmailTemplate | null> {
    const template = await EmailTemplate.findByIdAndUpdate(
      templateId,
      { status: 'active' },
      { new: true }
    );

    if (template) {
      logger.info('Email template restored', { templateId });
    }

    return template;
  }

  /**
   * Duplicate/clone template
   */
  static async duplicateTemplate(
    templateId: string,
    newName: string,
    createdBy: string,
    createdByName?: string
  ): Promise<IEmailTemplate> {
    const original = await EmailTemplate.findById(templateId);
    if (!original) {
      throw new Error('Template not found');
    }

    const newSlug = this.generateSlug(newName);
    
    // Check if slug exists
    const existing = await EmailTemplate.findOne({ slug: newSlug });
    if (existing) {
      throw new Error(`Template with slug "${newSlug}" already exists`);
    }

    const duplicated = new EmailTemplate({
      name: newName,
      slug: newSlug,
      description: original.description,
      subject: original.subject,
      htmlContent: original.htmlContent,
      textContent: original.textContent,
      category: original.category,
      tags: [...original.tags],
      variables: [...original.variables],
      status: 'draft',
      isDefault: false,
      isPublic: original.isPublic,
      allowedRoles: [...original.allowedRoles],
      fromName: original.fromName,
      fromEmail: original.fromEmail,
      replyTo: original.replyTo,
      version: 1,
      parentTemplateId: original._id,
      createdBy,
      createdByName,
      usageCount: 0
    });

    await duplicated.save();

    logger.info('Email template duplicated', {
      originalId: templateId,
      newId: duplicated._id,
      createdBy
    });

    return duplicated;
  }

  /**
   * Preview template with sample data
   */
  static async previewTemplate(
    templateId: string,
    data: PreviewTemplateData = {}
  ): Promise<{
    subject: string;
    htmlContent: string;
    textContent: string;
    variables: Record<string, any>;
  }> {
    const template = await EmailTemplate.findById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Merge default variables with provided ones
    const defaultVars = getDefaultVariableValues();
    const variables = { ...defaultVars, ...data.variables };

    // Render template
    const subject = replaceVariables(template.subject, variables);
    const htmlContent = replaceVariables(template.htmlContent, variables);
    const textContent = template.textContent 
      ? replaceVariables(template.textContent, variables)
      : htmlToText(htmlContent);

    return {
      subject,
      htmlContent,
      textContent,
      variables
    };
  }

  /**
   * Get template categories with counts
   */
  static async getCategories(): Promise<Array<{ category: EmailTemplateCategory; count: number; description: string }>> {
    const categories: EmailTemplateCategory[] = [
      'welcome',
      'marketing',
      'transactional',
      'operational',
      'educational',
      'lead_nurturing',
      'verification',
      'onboarding',
      're_engagement',
      'announcement'
    ];

    const categoryDescriptions: Record<EmailTemplateCategory, string> = {
      welcome: 'Welcome emails for new users',
      marketing: 'Promotional campaigns',
      transactional: 'Account updates, payments',
      operational: 'System notifications',
      educational: 'How-to guides, tips',
      lead_nurturing: 'Lead follow-ups',
      verification: 'Verification reminders',
      onboarding: 'Onboarding sequences',
      re_engagement: 'Re-engagement campaigns',
      announcement: 'Platform announcements'
    };

    const counts = await Promise.all(
      categories.map(category =>
        EmailTemplate.countDocuments({ category, status: { $ne: 'archived' } })
      )
    );

    return categories.map((category, index) => ({
      category,
      count: counts[index],
      description: categoryDescriptions[category]
    }));
  }

  /**
   * Increment usage count
   */
  static async incrementUsage(templateId: string): Promise<void> {
    await EmailTemplate.findByIdAndUpdate(
      templateId,
      {
        $inc: { usageCount: 1 },
        $set: { lastUsedAt: new Date() }
      }
    );
  }
}
