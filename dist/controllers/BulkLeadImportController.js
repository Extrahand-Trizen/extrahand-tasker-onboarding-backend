"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulkLeadImportController = void 0;
const BulkLeadImportService_1 = require("../services/BulkLeadImportService");
const logger_1 = __importDefault(require("../config/logger"));
const BulkImport_1 = __importDefault(require("../models/BulkImport"));
const Lead_1 = __importDefault(require("../models/Lead"));
const csvQueue_1 = require("../queues/csvQueue");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
class BulkLeadImportController {
    /**
     * Preview bulk import (validation + duplicate check, no records created)
     * POST /api/v1/onboarding/leads/bulk-import/preview
     */
    static async previewBulkImport(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            const file = req.file;
            if (!file) {
                res.status(400).json({
                    success: false,
                    error: "CSV file is required",
                });
                return;
            }
            const { primaryCategory, secondaryCategory } = req.body;
            const preview = await BulkLeadImportService_1.BulkLeadImportService.previewBulkImport(file.buffer, file.originalname, primaryCategory, secondaryCategory);
            res.json({
                success: true,
                data: preview,
            });
        }
        catch (error) {
            logger_1.default.error("Error in previewBulkImport controller", {
                error: error.message,
                stack: error.stack,
            });
            res.status(500).json({
                success: false,
                error: "Failed to preview import",
                message: error.message,
            });
        }
    }
    /**
     * Bulk import leads from CSV (queued for background processing)
     * POST /api/v1/admin/caos/leads/bulk-import
     */
    static async bulkImport(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            const file = req.file;
            if (!file) {
                res.status(400).json({
                    success: false,
                    error: "CSV file is required",
                });
                return;
            }
            // Validate file size (50MB max)
            const maxFileSize = 50 * 1024 * 1024; // 50MB
            if (file.size > maxFileSize) {
                res.status(400).json({
                    success: false,
                    error: "File too large",
                    message: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of 50MB`,
                });
                return;
            }
            // Validate file is not empty
            if (file.size === 0) {
                res.status(400).json({
                    success: false,
                    error: "File is empty",
                });
                return;
            }
            const { source, primaryCategory, secondaryCategory } = req.body; // Optional: override for all leads
            // Get userId (support both Firebase uid and JWT userId)
            const userId = req.admin?.uid || req.admin?.userId;
            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: "User ID not found",
                });
                return;
            }
            // Get user role for tracking
            const adminRole = req.admin?.role;
            // Store file temporarily (use os.tmpdir() so production has write access, e.g. /tmp)
            const tempDir = path_1.default.join(os_1.default.tmpdir(), "extrahand-csv-import");
            await promises_1.default.mkdir(tempDir, { recursive: true });
            const tempFilePath = path_1.default.join(tempDir, `csv-${Date.now()}-${userId}-${file.originalname}`);
            await promises_1.default.writeFile(tempFilePath, file.buffer);
            // Try to use queue if available, otherwise process synchronously
            // try {
            //   const queue = csvQueue.get();
            //   logger.info('CSV file stored temporarily, queuing job', {
            //     tempFilePath,
            //     fileName: file.originalname,
            //     fileSize: file.buffer.length,
            //     userId,
            //   });
            //   // Queue job for background processing
            //   const job = await queue.add(
            //     'process-csv',
            //     {
            //       filePath: tempFilePath,
            //       fileName: file.originalname,
            //       userId,
            //       adminName: req.admin?.name,
            //       adminEmail: req.admin?.email,
            //       adminRole,
            //       source,
            //       primaryCategory,
            //       secondaryCategory,
            //     },
            //     {
            //       jobId: `csv-${Date.now()}-${userId}`, // Unique job ID
            //     }
            //   );
            //   logger.info('CSV job queued successfully', {
            //     jobId: job.id,
            //     userId,
            //     fileName: file.originalname,
            //   });
            //   // Return immediately with job ID
            //   res.json({
            //     success: true,
            //     jobId: job.id,
            //     status: 'queued',
            //     message: 'CSV processing started. Use jobId to check progress.',
            //   });
            //   return;
            // } catch (queueError: any) {
            // Queue not available - fall back to synchronous processing
            logger_1.default.warn("CSV queue disabled/not available, processing synchronously", {
                // error: queueError.message,
                fileName: file.originalname,
                userId,
            });
            // Process synchronously (original behavior)
            const result = await BulkLeadImportService_1.BulkLeadImportService.bulkImportLeads(file.buffer, file.originalname, userId, req.admin?.name, req.admin?.email, adminRole, source, primaryCategory, secondaryCategory);
            // Clean up temp file
            try {
                await promises_1.default.unlink(tempFilePath);
            }
            catch (cleanupError) {
                logger_1.default.warn("Failed to cleanup temp file:", {
                    filePath: tempFilePath,
                    error: cleanupError.message,
                });
            }
            // Return result immediately
            res.json({
                success: true,
                data: {
                    importId: result.importId,
                    totalRows: result.totalRows,
                    successCount: result.successCount,
                    failedCount: result.failedCount,
                    errors: result.errors.slice(0, 10), // Limit errors in response
                    importedLeadIds: result.importedLeadIds.slice(0, 10), // Limit IDs in response
                },
                message: `Imported ${result.successCount} leads successfully${result.failedCount > 0 ? `, ${result.failedCount} failed` : ""}`,
                note: "Processed synchronously (Queue disabled)",
            });
            return;
            // }
        }
        catch (error) {
            logger_1.default.error("Error in bulkImport controller", {
                error: error.message,
                stack: error.stack,
            });
            res.status(500).json({
                success: false,
                error: "CSV import failed",
                message: error.message,
            });
        }
    }
    /**
     * Get job status
     * GET /api/v1/admin/caos/leads/bulk-import/job/:jobId
     */
    static async getJobStatus(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            const { jobId } = req.params;
            if (!jobId) {
                res.status(400).json({
                    success: false,
                    error: "Job ID is required",
                });
                return;
            }
            const job = await csvQueue_1.csvQueue.getJob(jobId);
            if (!job) {
                res.status(404).json({
                    success: false,
                    error: "Job not found",
                });
                return;
            }
            const state = await job.getState();
            const progress = typeof job.progress === "number" ? job.progress : 0;
            const result = job.returnvalue;
            const failedReason = job.failedReason;
            // Get job data for context
            const jobData = job.data;
            res.json({
                success: true,
                data: {
                    jobId: job.id,
                    status: state,
                    progress,
                    result,
                    failedReason,
                    fileName: jobData.fileName,
                    createdAt: new Date(job.timestamp).toISOString(),
                    processedAt: job.processedOn
                        ? new Date(job.processedOn).toISOString()
                        : null,
                    finishedAt: job.finishedOn
                        ? new Date(job.finishedOn).toISOString()
                        : null,
                },
            });
        }
        catch (error) {
            logger_1.default.error("Error getting job status", {
                error: error.message,
                stack: error.stack,
                jobId: req.params.jobId,
            });
            res.status(500).json({
                success: false,
                error: "Failed to get job status",
                message: error.message,
            });
        }
    }
    /**
     * Download CSV template
     * GET /api/v1/admin/caos/leads/bulk-import/template?primaryCategory=handyperson&secondaryCategory=Plumbing
     */
    static async downloadTemplate(req, res) {
        try {
            const primaryCategory = req.query.primaryCategory;
            const secondaryCategory = req.query.secondaryCategory;
            const template = BulkLeadImportService_1.BulkLeadImportService.generateTemplate(primaryCategory, secondaryCategory);
            const filename = primaryCategory && secondaryCategory
                ? `tasker-import-${primaryCategory}-${secondaryCategory.replace(/\s+/g, "-")}-template.csv`
                : primaryCategory
                    ? `tasker-import-${primaryCategory}-template.csv`
                    : "tasker-import-template.csv";
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.send(template);
        }
        catch (error) {
            logger_1.default.error("Error in downloadTemplate controller", {
                error: error.message,
            });
            res.status(500).json({
                success: false,
                error: "Failed to generate template",
                message: error.message,
            });
        }
    }
    /**
     * Get import history with filters
     * ✅ Lead Access Managers can see all imports
     * ✅ Qualifiers can see only their own imports
     * GET /api/v1/admin/caos/leads/bulk-import/history
     */
    static async getImportHistory(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            const userRole = req.admin?.role;
            const userId = req.admin?.userId || req.admin?.uid;
            // ✅ ISOLATION: Qualifiers can only see their own imports
            // Lead Access Managers can see all imports
            if (userRole === "qualifier" && userId) {
                // Qualifiers can only see their own imports - filter by createdBy
                // Don't allow them to filter by other users
            }
            else if (userRole !== "lead_access_manager") {
                res.status(403).json({
                    success: false,
                    error: "Permission denied",
                    message: "Import history is only accessible to Lead Access Managers and Qualifiers",
                });
                return;
            }
            // Parse query parameters
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const role = req.query.role;
            const createdBy = req.query.createdBy;
            const createdByEmail = req.query.createdByEmail;
            const createdByName = req.query.createdByName;
            const from = req.query.from
                ? new Date(req.query.from)
                : undefined;
            const to = req.query.to ? new Date(req.query.to) : undefined;
            const status = req.query.status;
            // ✅ ISOLATION: For qualifiers, force filter by their own userId
            const filters = {
                role,
                createdByEmail,
                createdByName,
                from,
                to,
                status,
                page,
                limit,
            };
            if (userRole === "qualifier" && userId) {
                // Qualifiers can only see their own imports
                filters.userId = userId;
                logger_1.default.debug("Qualifier isolation applied to import history", {
                    userId,
                    role: userRole,
                });
            }
            else if (userRole === "lead_access_manager") {
                // Lead Access Managers can filter by any user
                filters.userId = createdBy;
            }
            const result = await BulkLeadImportService_1.BulkLeadImportService.getImportHistory(filters);
            res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            logger_1.default.error("Error in getImportHistory controller", {
                error: error.message,
                stack: error.stack,
            });
            res.status(500).json({
                success: false,
                error: "Failed to fetch import history",
                message: error.message,
            });
        }
    }
    /**
     * Get comprehensive import analytics
     * GET /api/v1/onboarding/leads/bulk-import/analytics
     */
    static async getImportAnalytics(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            const analytics = await BulkLeadImportService_1.BulkLeadImportService.getImportAnalytics();
            res.json({
                success: true,
                data: analytics,
            });
        }
        catch (error) {
            logger_1.default.error("Error in getImportAnalytics controller", {
                error: error.message,
            });
            res.status(500).json({
                success: false,
                error: "Failed to fetch import analytics",
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
            if (error.message === "Import not found") {
                res.status(404).json({
                    success: false,
                    error: "Import not found",
                });
                return;
            }
            logger_1.default.error("Error in getImportDetails controller", {
                error: error.message,
                importId: req.params.importId,
            });
            res.status(500).json({
                success: false,
                error: "Failed to fetch import details",
                message: error.message,
            });
        }
    }
    /**
     * Get imported leads for an import (paginated)
     * GET /api/v1/onboarding/leads/bulk-import/:importId/leads
     */
    static async getImportedLeads(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            const { importId } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const importRecord = await BulkImport_1.default.findOne({ importId });
            if (!importRecord) {
                res.status(404).json({
                    success: false,
                    error: "Import not found",
                });
                return;
            }
            const leadIds = importRecord.importedUserIds || [];
            const total = leadIds.length;
            // Get paginated lead IDs
            const paginatedLeadIds = leadIds.slice(skip, skip + limit);
            // Fetch leads
            const leads = await Lead_1.default.find({ leadId: { $in: paginatedLeadIds } })
                .select("leadId name phone email city state address pincode primarySkill primaryCategory secondarySkill secondaryCategory status createdAt")
                .lean();
            // Map to expected format
            const leadsData = leads.map((lead) => ({
                uid: lead.leadId, // Use leadId as uid for consistency
                leadId: lead.leadId,
                name: lead.name,
                phone: lead.phone,
                email: lead.email,
                city: lead.city,
                state: lead.state,
                address: lead.address,
                primarySkill: lead.primaryCategory || lead.primarySkill, // Prefer primaryCategory
                primaryCategory: lead.primaryCategory || lead.primarySkill, // Ensure primaryCategory is set
                secondarySkill: lead.secondaryCategory || lead.secondarySkill, // Prefer secondaryCategory
                secondaryCategory: lead.secondaryCategory || lead.secondarySkill, // Ensure secondaryCategory is set
                status: lead.status,
                createdAt: lead.createdAt,
            }));
            res.json({
                success: true,
                data: {
                    users: leadsData,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit),
                    },
                },
            });
        }
        catch (error) {
            logger_1.default.error("Error in getImportedLeads controller", {
                error: error.message,
                importId: req.params.importId,
            });
            res.status(500).json({
                success: false,
                error: "Failed to fetch imported leads",
                message: error.message,
            });
        }
    }
    /**
     * Export UIDs from import (CSV format with uid, name, phone)
     * GET /api/v1/admin/caos/leads/bulk-import/:importId/export-uids
     */
    static async exportUids(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            const { importId } = req.params;
            const importRecord = await BulkImport_1.default.findOne({ importId });
            if (!importRecord) {
                res.status(404).json({
                    success: false,
                    error: "Import not found",
                });
                return;
            }
            // For lead imports, importedUserIds contains leadIds
            // We need to get the Firebase UIDs from the leads' activationData
            const leadIds = importRecord.importedUserIds || [];
            if (leadIds.length === 0) {
                res.status(400).json({
                    success: false,
                    error: "No imported leads found for this import",
                });
                return;
            }
            // Fetch leads and get Firebase UIDs from activationData
            const leads = await Lead_1.default.find({ leadId: { $in: leadIds } })
                .select("leadId name phone email activationData")
                .lean();
            // Filter leads that have been activated (have firebaseUid)
            const activatedLeads = leads.filter((lead) => lead.activationData?.firebaseUid);
            if (activatedLeads.length === 0) {
                res.status(400).json({
                    success: false,
                    error: "No activated users found. Leads need to be activated first to have Firebase UIDs.",
                });
                return;
            }
            // Fetch user details for all Firebase UIDs
            const firebaseUids = activatedLeads.map((lead) => lead.activationData.firebaseUid);
            const userDetails = [];
            // Use lead data as fallback, but try to fetch from user service for latest data
            const { env } = await Promise.resolve().then(() => __importStar(require("../config/env")));
            const axios = (await Promise.resolve().then(() => __importStar(require("axios")))).default;
            const BATCH_SIZE = 50;
            for (let i = 0; i < firebaseUids.length; i += BATCH_SIZE) {
                const batch = firebaseUids.slice(i, i + BATCH_SIZE);
                const batchResults = await Promise.allSettled(batch.map(async (uid) => {
                    const lead = activatedLeads.find((l) => l.activationData?.firebaseUid === uid);
                    const leadData = {
                        uid,
                        name: lead?.name || "",
                        phone: lead?.phone || "",
                        leadId: lead?.leadId || "",
                    };
                    try {
                        const response = await axios.get(`${env.USER_SERVICE_URL}/api/v1/profiles/${uid}`, {
                            headers: {
                                "X-Service-Auth": env.SERVICE_AUTH_TOKEN,
                                "X-Service-Name": "admin-service",
                            },
                        });
                        return {
                            uid,
                            name: response.data?.profile?.name ||
                                response.data?.name ||
                                leadData.name,
                            phone: response.data?.profile?.phone ||
                                response.data?.phone ||
                                leadData.phone,
                            leadId: leadData.leadId,
                        };
                    }
                    catch (error) {
                        // If profile not found, use lead data
                        return leadData;
                    }
                }));
                batchResults.forEach((result) => {
                    if (result.status === "fulfilled") {
                        userDetails.push(result.value);
                    }
                    else {
                        // If failed, use lead data as fallback
                        const uid = batch[result.status === "rejected" ? batch.indexOf(result.reason) : -1];
                        const lead = activatedLeads.find((l) => l.activationData?.firebaseUid === uid);
                        if (lead) {
                            userDetails.push({
                                uid,
                                name: lead.name || "",
                                phone: lead.phone || "",
                                leadId: lead.leadId,
                            });
                        }
                    }
                });
            }
            // Generate CSV
            let csv = "uid,name,phone,leadId\n";
            userDetails.forEach((user) => {
                const name = (user.name || "").replace(/"/g, '""'); // Escape quotes
                const phone = (user.phone || "").replace(/"/g, '""');
                csv += `"${user.uid}","${name}","${phone}","${user.leadId}"\n`;
            });
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename=user-uids-${importId}.csv`);
            res.send(csv);
        }
        catch (error) {
            logger_1.default.error("Export UIDs error", {
                error: error.message,
                importId: req.params.importId,
            });
            res.status(500).json({
                success: false,
                error: "Failed to export UIDs",
                message: error.message,
            });
        }
    }
}
exports.BulkLeadImportController = BulkLeadImportController;
//# sourceMappingURL=BulkLeadImportController.js.map