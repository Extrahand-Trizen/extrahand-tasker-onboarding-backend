"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulkUploadController = void 0;
const BulkUploadService_1 = require("../services/BulkUploadService");
const BulkImport_1 = __importDefault(require("../models/BulkImport"));
const Lead_1 = __importDefault(require("../models/Lead"));
const logger_1 = __importDefault(require("../config/logger"));
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
class BulkUploadController {
    /**
     * Upload and process CSV/Excel file
     */
    static async bulkUpload(req, res, next) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'File is required'
                });
            }
            const adminUid = req.headers['x-user-id'];
            if (!adminUid) {
                return res.status(401).json({
                    success: false,
                    error: 'Admin UID required'
                });
            }
            const result = await BulkUploadService_1.BulkUploadService.processBulkUpload(req.file.buffer, req.file.originalname, adminUid);
            res.json({
                success: true,
                data: result
            });
        }
        catch (error) {
            logger_1.default.error('Bulk upload error', { error: error.message });
            next(error);
        }
    }
    /**
     * Download CSV template based on operation type
     */
    static async downloadTemplate(req, res) {
        const operationType = req.query.operation || 'create';
        let csv = '';
        if (operationType === 'create') {
            csv = `name,phone,email,address,city,state,pincode,primarySkill
John Doe,+919876543210,john@example.com,123 Main St,Mumbai,Maharashtra,400001,home_services
Raj Kumar,+919876543211,raj@example.com,456 Worker Lane,Delhi,Delhi,110001,delivery`;
        }
        else if (operationType === 'update') {
            csv = `operation,uid,name,phone,email,address,city,state,pincode,primarySkill,isActive
update,firebase-uid-123,John Updated,+919876543210,john@example.com,456 New St,Mumbai,Maharashtra,400002,home_services,true
update,firebase-uid-456,Jane Updated,+919876543211,jane@example.com,789 Updated Lane,Delhi,Delhi,110002,delivery,false`;
        }
        else if (operationType === 'delete') {
            csv = `operation,uid,reason
delete,firebase-uid-123,User requested deletion
delete,firebase-uid-456,Account suspended`;
        }
        else {
            csv = `name,phone,email,address,city,state,pincode,primarySkill
John Doe,+919876543210,john@example.com,123 Main St,Mumbai,Maharashtra,400001,home_services`;
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=tasker-${operationType}-template.csv`);
        res.send(csv);
    }
    /**
     * Get import history
     */
    static async getImportHistory(req, res, next) {
        try {
            const adminUid = req.headers['x-user-id'];
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;
            const [imports, total] = await Promise.all([
                BulkImport_1.default.find({ adminUid })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                BulkImport_1.default.countDocuments({ adminUid })
            ]);
            res.json({
                success: true,
                data: {
                    imports,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                }
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * Get import details
     */
    static async getImportDetails(req, res, next) {
        try {
            const { importId } = req.params;
            const importRecord = await BulkImport_1.default.findOne({ importId });
            if (!importRecord) {
                return res.status(404).json({
                    success: false,
                    error: 'Import not found'
                });
            }
            res.json({
                success: true,
                data: importRecord
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * Get imported users/leads for an import (paginated)
     */
    static async getImportedUsers(req, res, next) {
        try {
            const { importId } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const importRecord = await BulkImport_1.default.findOne({ importId });
            if (!importRecord) {
                return res.status(404).json({
                    success: false,
                    error: 'Import not found'
                });
            }
            // importedUserIds now contains leadIds (for backward compatibility)
            const leadIds = importRecord.importedUserIds || [];
            const total = leadIds.length;
            const paginatedIds = leadIds.slice(skip, skip + limit);
            // Fetch lead details for paginated leadIds
            const leads = await Lead_1.default.find({ leadId: { $in: paginatedIds } })
                .select('leadId name phone email city state address pincode primarySkill status creationMethod')
                .lean();
            // Map leads to user format for backward compatibility
            const users = leads.map(lead => ({
                uid: lead.leadId, // Using leadId as uid for display
                name: lead.name || '',
                phone: lead.phone || '',
                email: lead.email || '',
                city: lead.city || '',
                state: lead.state || '',
                address: lead.address || '',
                pincode: lead.pincode || '',
                primarySkill: lead.primarySkill || '',
                status: lead.status,
                creationMethod: lead.creationMethod
            }));
            res.json({
                success: true,
                data: {
                    users,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                }
            });
        }
        catch (error) {
            logger_1.default.error('Get imported users error', { error: error.message });
            next(error);
        }
    }
    /**
     * Export UIDs from import (CSV format with uid, name, phone)
     */
    static async exportUids(req, res, next) {
        try {
            const { importId } = req.params;
            const importRecord = await BulkImport_1.default.findOne({ importId });
            if (!importRecord) {
                return res.status(404).json({
                    success: false,
                    error: 'Import not found'
                });
            }
            // Fetch user details for all UIDs
            const uids = importRecord.importedUserIds || [];
            const userDetails = [];
            // Fetch user details in batches
            const BATCH_SIZE = 50;
            for (let i = 0; i < uids.length; i += BATCH_SIZE) {
                const batch = uids.slice(i, i + BATCH_SIZE);
                const batchResults = await Promise.allSettled(batch.map(async (uid) => {
                    try {
                        const response = await axios_1.default.get(`${env_1.env.USER_SERVICE_URL}/api/v1/profiles/${uid}`, {
                            headers: {
                                'X-Service-Auth': env_1.env.SERVICE_AUTH_TOKEN,
                                'X-Service-Name': 'admin-service'
                            }
                        });
                        return {
                            uid,
                            name: response.data?.profile?.name || response.data?.name || '',
                            phone: response.data?.profile?.phone || response.data?.phone || ''
                        };
                    }
                    catch (error) {
                        // If profile not found, just return uid
                        return { uid, name: '', phone: '' };
                    }
                }));
                batchResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        userDetails.push(result.value);
                    }
                    else {
                        // If failed, still include the UID
                        const uid = batch[index];
                        userDetails.push({ uid, name: '', phone: '' });
                    }
                });
            }
            // Generate CSV
            let csv = 'uid,name,phone\n';
            userDetails.forEach((user) => {
                const name = (user.name || '').replace(/"/g, '""'); // Escape quotes
                const phone = (user.phone || '').replace(/"/g, '""');
                csv += `"${user.uid}","${name}","${phone}"\n`;
            });
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=user-uids-${importId}.csv`);
            res.send(csv);
        }
        catch (error) {
            logger_1.default.error('Export UIDs error', { error: error.message });
            next(error);
        }
    }
}
exports.BulkUploadController = BulkUploadController;
//# sourceMappingURL=BulkUploadController.js.map