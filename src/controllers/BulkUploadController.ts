import { Request, Response, NextFunction } from "express";
import { BulkUploadService } from "../services/BulkUploadService";
import BulkImport from "../models/BulkImport";
import Lead from "../models/Lead";
import logger from "../config/logger";
import axios from "axios";
import { env } from "../config/env";
import { AdminRequest } from "../middleware/adminAuth";

export class BulkUploadController {
  /**
   * Preview bulk upload without creating records
   */
  static async previewBulkUpload(
    req: AdminRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "File is required",
        });
      }

      const primaryCategory = req.body.primaryCategory as string | undefined;
      const secondaryCategory = req.body.secondaryCategory as
        | string
        | undefined;

      const preview = await BulkUploadService.previewBulkUpload(
        req.file.buffer,
        req.file.originalname,
        primaryCategory,
        secondaryCategory
      );

      res.json({
        success: true,
        data: preview,
      });
    } catch (error: any) {
      logger.error("Bulk upload preview error", { error: error.message });
      next(error);
    }
  }

  /**
   * Upload and process CSV/Excel file
   */
  static async bulkUpload(
    req: AdminRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "File is required",
        });
      }

      // Admin UID from authenticated admin (set by adminAuthMiddleware)
      // Fallbacks:
      // - req.user.uid (backward compatibility)
      // - X-User-Id header (service-to-service calls)
      const adminUid =
        req.admin?.uid ||
        (req.user as any)?.uid ||
        (req.headers["x-user-id"] as string | undefined);
      if (!adminUid) {
        return res.status(401).json({
          success: false,
          error: "Admin UID required",
        });
      }

      const primaryCategory = req.body.primaryCategory as string | undefined;
      const secondaryCategory = req.body.secondaryCategory as
        | string
        | undefined;
      const sendEmails = req.body.sendEmails !== 'false' && req.body.sendEmails !== false; // Default to true

      const result = await BulkUploadService.processBulkUpload(
        req.file.buffer,
        req.file.originalname,
        adminUid,
        primaryCategory,
        secondaryCategory,
        sendEmails
      );

      // ✅ Updated response message
      res.json({
        success: true,
        message: "Leads created successfully. No accounts were created. Use the invite system to create accounts for qualified leads.",
        data: {
          ...result,
          note: "Accounts will only be created when users accept invites. This ensures proper consent and data integrity.",
          nextSteps: [
            "Review and qualify leads in the Tasker List",
            "Send invites to qualified leads",
            "Accounts will be created when users accept invites"
          ]
        },
      });
    } catch (error: any) {
      logger.error("Bulk upload error", { error: error.message });
      next(error);
    }
  }

  /**
   * Download CSV template based on operation type
   */
  static async downloadTemplate(req: Request, res: Response) {
    const operationType = (req.query.operation as string) || "create";
    const primaryCategory = req.query.primaryCategory as string | undefined;
    const secondaryCategory = req.query.secondaryCategory as string | undefined;
    let csv = "";

    if (operationType === "create") {
      // If categories are provided, exclude them from template (they'll be applied automatically)
      const includeCategoryColumns = !primaryCategory || !secondaryCategory;

      const headers = [
        "Full Name",
        "Phone Number",
        "Email (optional)",
        "City / Area",
        "State (optional)",
        "Address",
        "Pincode",
        ...(includeCategoryColumns
          ? ["Primary Category", "Secondary Category"]
          : []),
        "Experience Level (beginner/intermediate/experienced)",
        "Years of Experience (optional)",
        "Working Days (optional)",
        "Preferred Time Slot (optional)",
        "Source (referral/campaign/walk-in/agent/other)",
      ];

      const exampleRow1 = [
        "John Doe",
        "9876543210",
        "john@example.com",
        "Delhi",
        "Delhi",
        "123 Main Street Connaught Place",
        "110001",
        ...(includeCategoryColumns
          ? [primaryCategory || "handyperson", secondaryCategory || "Plumbing"]
          : []),
        "intermediate",
        "3",
        "Mon-Fri",
        "Morning",
        "referral",
      ];

      const exampleRow2 = [
        "Raj Kumar",
        "9876543211",
        "raj@example.com",
        "Mumbai",
        "Maharashtra",
        "456 Worker Lane Andheri West",
        "400053",
        ...(includeCategoryColumns
          ? [primaryCategory || "handyperson", secondaryCategory || "Plumbing"]
          : []),
        "experienced",
        "5",
        "Mon-Sat",
        "Afternoon",
        "campaign",
      ];

      // Add note at the top if categories are pre-selected
      // if (primaryCategory && secondaryCategory) {
      //   csv += `# Template for ${primaryCategory} - ${secondaryCategory}\n`;
      //   csv += `# Categories are pre-selected and will be applied to all rows automatically\n`;
      //   csv += `# You don't need to include category columns in your CSV\n`;
      // }

      csv += headers.join(",") + "\n";
      csv +=
        exampleRow1
          .map((val, idx) => (idx === 1 || idx === 6 ? `"${val}"` : val))
          .join(",") + "\n";
      csv += exampleRow2
        .map((val, idx) => (idx === 1 || idx === 6 ? `"${val}"` : val))
        .join(",");
    } else if (operationType === "update") {
      csv = `operation,uid,name,phone,email (optional),address,city,state (optional),pincode,primaryCategory,secondaryCategory,experienceLevel,yearsOfExperience (optional),workingDays (optional),preferredTimeSlot (optional),isActive
update,firebase-uid-123,John Updated,9876543210,john@example.com,456 New St,Mumbai,Maharashtra,400002,handyperson,Electrical,intermediate,3,Mon-Fri,Morning,true
update,firebase-uid-456,Jane Updated,9876543211,jane@example.com,789 Updated Lane,Delhi,Delhi,110002,cleaning,Deep Cleaning,experienced,6,Mon-Sat,Afternoon,false`;
    } else if (operationType === "delete") {
      csv = `operation,uid,reason
delete,firebase-uid-123,User requested deletion
delete,firebase-uid-456,Account suspended`;
    } else {
      csv = `Full Name,Phone Number,Email (optional),City / Area,State (optional),Address,Pincode,Primary Category,Secondary Category,Experience Level (beginner/intermediate/experienced),Years of Experience (optional),Working Days (optional),Preferred Time Slot (optional),Source (referral/campaign/walk-in/agent/other)
John Doe,9876543210,john@example.com,Delhi,Delhi,123 Main Street Connaught Place,110001,handyperson,Plumbing,intermediate,3,Mon-Fri,Morning,referral
Raj Kumar,9876543211,raj@example.com,Mumbai,Maharashtra,456 Worker Lane Andheri West,400053,cleaning,House Cleaning,experienced,5,Mon-Sat,Afternoon,campaign`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=tasker-${operationType}-template.csv`
    );
    res.send(csv);
  }

  /**
   * Get import history
   */
  static async getImportHistory(
    req: AdminRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const adminUid = req.admin?.uid;
      if (!adminUid) {
        return res.status(401).json({
          success: false,
          error: "Admin UID required",
        });
      }
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const [imports, total] = await Promise.all([
        BulkImport.find({ adminUid })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        BulkImport.countDocuments({ adminUid }),
      ]);

      res.json({
        success: true,
        data: {
          imports,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Get import details
   */
  static async getImportDetails(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { importId } = req.params;
      const importRecord = await BulkImport.findOne({ importId });

      if (!importRecord) {
        return res.status(404).json({
          success: false,
          error: "Import not found",
        });
      }

      res.json({
        success: true,
        data: importRecord,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Get imported users/leads for an import (paginated)
   */
  static async getImportedUsers(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { importId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const importRecord = await BulkImport.findOne({ importId });

      if (!importRecord) {
        return res.status(404).json({
          success: false,
          error: "Import not found",
        });
      }

      // importedUserIds now contains leadIds (for backward compatibility)
      const leadIds = importRecord.importedUserIds || [];
      const total = leadIds.length;
      const paginatedIds = leadIds.slice(skip, skip + limit);

      // Fetch lead details for paginated leadIds
      const leads = await Lead.find({ leadId: { $in: paginatedIds } })
        .select(
          "leadId name phone email city state address pincode primarySkill status creationMethod"
        )
        .lean();

      // Map leads to user format for backward compatibility
      const users = leads.map((lead) => ({
        uid: lead.leadId, // Using leadId as uid for display
        name: lead.name || "",
        phone: lead.phone || "",
        email: lead.email || "",
        city: lead.city || "",
        state: lead.state || "",
        address: lead.address || "",
        pincode: lead.pincode || "",
        primarySkill: lead.primarySkill || "",
        status: lead.status,
        creationMethod: lead.creationMethod,
      }));

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error: any) {
      logger.error("Get imported users error", { error: error.message });
      next(error);
    }
  }

  /**
   * Export UIDs from import (CSV format with uid, name, phone)
   */
  static async exportUids(req: Request, res: Response, next: NextFunction) {
    try {
      const { importId } = req.params;
      const importRecord = await BulkImport.findOne({ importId });

      if (!importRecord) {
        return res.status(404).json({
          success: false,
          error: "Import not found",
        });
      }

      // Fetch user details for all UIDs
      const uids = importRecord.importedUserIds || [];
      const userDetails: Array<{ uid: string; name?: string; phone?: string }> =
        [];

      // Fetch user details in batches
      const BATCH_SIZE = 50;
      for (let i = 0; i < uids.length; i += BATCH_SIZE) {
        const batch = uids.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.allSettled(
          batch.map(async (uid: string) => {
            try {
              const response = await axios.get(
                `${env.USER_SERVICE_URL}/api/v1/profiles/${uid}`,
                {
                  headers: {
                    "X-Service-Auth": env.SERVICE_AUTH_TOKEN,
                    "X-Service-Name": "admin-service",
                  },
                }
              );
              return {
                uid,
                name: response.data?.profile?.name || response.data?.name || "",
                phone:
                  response.data?.profile?.phone || response.data?.phone || "",
              };
            } catch (error: any) {
              // If profile not found, just return uid
              return { uid, name: "", phone: "" };
            }
          })
        );

        batchResults.forEach((result, index) => {
          if (result.status === "fulfilled") {
            userDetails.push(result.value);
          } else {
            // If failed, still include the UID
            const uid = batch[index];
            userDetails.push({ uid, name: "", phone: "" });
          }
        });
      }

      // Generate CSV
      let csv = "uid,name,phone\n";
      userDetails.forEach((user) => {
        const name = (user.name || "").replace(/"/g, '""'); // Escape quotes
        const phone = (user.phone || "").replace(/"/g, '""');
        csv += `"${user.uid}","${name}","${phone}"\n`;
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=user-uids-${importId}.csv`
      );
      res.send(csv);
    } catch (error: any) {
      logger.error("Export UIDs error", { error: error.message });
      next(error);
    }
  }
}
