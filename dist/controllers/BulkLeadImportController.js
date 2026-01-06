"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulkLeadImportController = void 0;
const BulkLeadImportService_1 = require("../services/BulkLeadImportService");
const logger_1 = __importDefault(require("../config/logger"));
class BulkLeadImportController {
    /**
     * Bulk import leads from CSV
     * POST /api/v1/admin/caos/leads/bulk-import
     */
    static async bulkImport(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                });
                return;
            }
            const file = req.file;
            if (!file) {
                res.status(400).json({
                    success: false,
                    error: 'CSV file is required',
                });
                return;
            }
            const { source } = req.body; // Optional: override source for all leads
            const result = await BulkLeadImportService_1.BulkLeadImportService.bulkImportLeads(file.buffer, file.originalname, req.admin.uid, req.admin.name, source);
            res.json({
                success: true,
                data: result,
                message: `Imported ${result.successCount} leads successfully`,
            });
        }
        catch (error) {
            logger_1.default.error('Error in bulkImport controller', {
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
     * GET /api/v1/admin/caos/leads/bulk-import/template
     */
    static async downloadTemplate(req, res) {
        try {
            const template = BulkLeadImportService_1.BulkLeadImportService.generateTemplate();
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="lead-import-template.csv"');
            res.send(template);
        }
        catch (error) {
            logger_1.default.error('Error in downloadTemplate controller', {
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
    static async getImportHistory(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                });
                return;
            }
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const adminUid = req.query.all === 'true' ? undefined : req.admin.uid;
            const result = await BulkLeadImportService_1.BulkLeadImportService.getImportHistory(adminUid, page, limit);
            res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            logger_1.default.error('Error in getImportHistory controller', {
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
    static async getImportDetails(req, res) {
        try {
            const { importId } = req.params;
            const importDetails = await BulkLeadImportService_1.BulkLeadImportService.getImportDetails(importId);
            res.json({
                success: true,
                data: importDetails,
            });
        }
        catch (error) {
            if (error.message === 'Import not found') {
                res.status(404).json({
                    success: false,
                    error: 'Import not found',
                });
                return;
            }
            logger_1.default.error('Error in getImportDetails controller', {
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
}
exports.BulkLeadImportController = BulkLeadImportController;
//# sourceMappingURL=BulkLeadImportController.js.map