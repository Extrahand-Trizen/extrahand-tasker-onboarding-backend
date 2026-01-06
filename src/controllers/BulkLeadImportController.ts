import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
import { BulkLeadImportService } from '../services/BulkLeadImportService';
import logger from '../config/logger';
import BulkImport from '../models/BulkImport';
import Lead from '../models/Lead';

export class BulkLeadImportController {
  /**
   * Bulk import leads from CSV
   * POST /api/v1/admin/caos/leads/bulk-import
   */
  static async bulkImport(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const file = (req as any).file;
      if (!file) {
        res.status(400).json({
          success: false,
          error: 'CSV file is required',
        });
        return;
      }

      const { source, primaryCategory, secondaryCategory } = req.body; // Optional: override for all leads

      const result = await BulkLeadImportService.bulkImportLeads(
        file.buffer,
        file.originalname,
        req.admin.uid,
        req.admin.name,
        source,
        primaryCategory,
        secondaryCategory
      );

      res.json({
        success: true,
        data: result,
        message: `Imported ${result.successCount} leads successfully`,
      });
    } catch (error: any) {
      logger.error('Error in bulkImport controller', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to import leads',
        message: error.message,
      });
    }
  }

  /**
   * Download CSV template
   * GET /api/v1/admin/caos/leads/bulk-import/template?primaryCategory=handyperson&secondaryCategory=Plumbing
   */
  static async downloadTemplate(req: AdminRequest, res: Response): Promise<void> {
    try {
      const primaryCategory = req.query.primaryCategory as string | undefined;
      const secondaryCategory = req.query.secondaryCategory as string | undefined;
      
      const template = BulkLeadImportService.generateTemplate(primaryCategory, secondaryCategory);

      const filename = primaryCategory && secondaryCategory
        ? `tasker-import-${primaryCategory}-${secondaryCategory.replace(/\s+/g, '-')}-template.csv`
        : 'tasker-import-template.csv';

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(template);
    } catch (error: any) {
      logger.error('Error in downloadTemplate controller', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to generate template',
        message: error.message,
      });
    }
  }

  /**
   * Get import history
   * GET /api/v1/admin/caos/leads/bulk-import/history
   */
  static async getImportHistory(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const adminUid = req.query.all === 'true' ? undefined : req.admin.uid;

      const result = await BulkLeadImportService.getImportHistory(adminUid, page, limit);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error in getImportHistory controller', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch import history',
        message: error.message,
      });
    }
  }

  /**
   * Get import details
   * GET /api/v1/admin/caos/leads/bulk-import/:importId
   */
  static async getImportDetails(req: AdminRequest, res: Response): Promise<void> {
    try {
      const { importId } = req.params;

      const importDetails = await BulkLeadImportService.getImportDetails(importId);

      res.json({
        success: true,
        data: importDetails,
      });
    } catch (error: any) {
      if (error.message === 'Import not found') {
        res.status(404).json({
          success: false,
          error: 'Import not found',
        });
        return;
      }

      logger.error('Error in getImportDetails controller', {
        error: error.message,
        importId: req.params.importId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch import details',
        message: error.message,
      });
    }
  }

  /**
   * Export UIDs from import (CSV format with uid, name, phone)
   * GET /api/v1/admin/caos/leads/bulk-import/:importId/export-uids
   */
  static async exportUids(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { importId } = req.params;
      const importRecord = await BulkImport.findOne({ importId });

      if (!importRecord) {
        res.status(404).json({
          success: false,
          error: 'Import not found',
        });
        return;
      }

      // For lead imports, importedUserIds contains leadIds
      // We need to get the Firebase UIDs from the leads' activationData
      const leadIds = importRecord.importedUserIds || [];
      
      if (leadIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No imported leads found for this import',
        });
        return;
      }

      // Fetch leads and get Firebase UIDs from activationData
      const leads = await Lead.find({ leadId: { $in: leadIds } })
        .select('leadId name phone email activationData')
        .lean();

      // Filter leads that have been activated (have firebaseUid)
      const activatedLeads = leads.filter(lead => lead.activationData?.firebaseUid);
      
      if (activatedLeads.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No activated users found. Leads need to be activated first to have Firebase UIDs.',
        });
        return;
      }

      // Fetch user details for all Firebase UIDs
      const firebaseUids = activatedLeads.map(lead => lead.activationData!.firebaseUid);
      const userDetails: Array<{ uid: string; name: string; phone: string; leadId: string }> = [];

      // Use lead data as fallback, but try to fetch from user service for latest data
      const { env } = await import('../config/env');
      const axios = (await import('axios')).default;
      
      const BATCH_SIZE = 50;
      for (let i = 0; i < firebaseUids.length; i += BATCH_SIZE) {
        const batch = firebaseUids.slice(i, i + BATCH_SIZE);
        
        const batchResults = await Promise.allSettled(
          batch.map(async (uid: string) => {
            const lead = activatedLeads.find(l => l.activationData?.firebaseUid === uid);
            const leadData = {
              uid,
              name: lead?.name || '',
              phone: lead?.phone || '',
              leadId: lead?.leadId || ''
            };

            try {
              const response = await axios.get(
                `${env.USER_SERVICE_URL}/api/v1/profiles/${uid}`,
                {
                  headers: {
                    'X-Service-Auth': env.SERVICE_AUTH_TOKEN,
                    'X-Service-Name': 'admin-service'
                  }
                }
              );
              return {
                uid,
                name: response.data?.profile?.name || response.data?.name || leadData.name,
                phone: response.data?.profile?.phone || response.data?.phone || leadData.phone,
                leadId: leadData.leadId
              };
            } catch (error: any) {
              // If profile not found, use lead data
              return leadData;
            }
          })
        );

        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            userDetails.push(result.value);
          } else {
            // If failed, use lead data as fallback
            const uid = batch[result.status === 'rejected' ? batch.indexOf(result.reason) : -1];
            const lead = activatedLeads.find(l => l.activationData?.firebaseUid === uid);
            if (lead) {
              userDetails.push({
                uid,
                name: lead.name || '',
                phone: lead.phone || '',
                leadId: lead.leadId
              });
            }
          }
        });
      }

      // Generate CSV
      let csv = 'uid,name,phone,leadId\n';
      userDetails.forEach((user) => {
        const name = (user.name || '').replace(/"/g, '""'); // Escape quotes
        const phone = (user.phone || '').replace(/"/g, '""');
        csv += `"${user.uid}","${name}","${phone}","${user.leadId}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=user-uids-${importId}.csv`);
      res.send(csv);
    } catch (error: any) {
      logger.error('Export UIDs error', {
        error: error.message,
        importId: req.params.importId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to export UIDs',
        message: error.message,
      });
    }
  }
}

