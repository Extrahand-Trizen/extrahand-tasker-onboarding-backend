import { parse } from "csv-parse";
import { Readable } from "stream";
import mongoose from "mongoose";
import crypto from "crypto";
import Lead, { ILead, LeadSource, LeadStatus } from "../models/Lead";
import BulkImport, { IBulkImport } from "../models/BulkImport";
import { DuplicateCheckService } from "./DuplicateCheckService";
import { LeadService } from "./LeadService";
import logger from "../config/logger";
import { v4 as uuidv4 } from "uuid";
import * as xlsx from "xlsx";
import path from "path";

export interface BulkLeadImportRow {
  name: string;
  phone: string;
  email?: string;
  city: string;
  state: string; // Required for bulk import
  address: string; // Required for bulk import
  pincode?: string;
  primaryCategory?: string; // New field name
  primarySkill?: string; // Legacy field name (for backward compatibility)
  secondaryCategory?: string;
  experienceLevel?: "beginner" | "intermediate" | "experienced";
  yearsOfExperience?: number; // Optional - will be derived from experienceLevel if not provided
  workingDays?: string;
  preferredTimeSlot?: string;
  source: LeadSource;
  sourceDetails?: string;
  // status?: LeadStatus;
}

export interface BulkLeadImportResult {
  importId: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  errors: Array<{
    row: number;
    phone?: string;
    error: string;
  }>;
  importedLeadIds: string[];
}

export interface ProgressCallback {
  (progress: number, message: string): void;
}

export class BulkLeadImportService {
  /**
   * Parse CSV file
   */
  /**
   * Map human-readable skill names to enum values
   */
  static mapSkillToEnum(skill: string): string {
    const normalized = skill.toLowerCase().trim();

    // Map human-readable names to enum values
    const skillMap: Record<string, string> = {
      // Legacy mappings for backward compatibility
      "home services": "handyperson",
      "home service": "handyperson",
      home_services: "handyperson",
      plumbing: "handyperson", // Plumbing falls under handyperson
      electrician: "handyperson", // Electrician falls under handyperson
      "delivery & transport": "moving",
      "delivery and transport": "moving",
      delivery: "moving",
      // Current categories
      "cleaning services": "cleaning",
      cleaning: "cleaning",
      handyperson: "handyperson",
      "handy person": "handyperson",
      moving: "moving",
      "moving & delivery": "moving",
      "moving and delivery": "moving",
      gardening: "gardening",
      business: "business",
      "business services": "business",
      marketing: "marketing",
      "marketing & design": "marketing",
      "marketing and design": "marketing",
      "tech services": "tech",
      "tech service": "tech",
      "tech support": "tech",
      tech: "tech",
      technology: "tech",
      "education & tutoring": "tutoring",
      "education and tutoring": "tutoring",
      tutoring: "tutoring",
      photography: "photography",
      "beauty & wellness": "beauty",
      "beauty and wellness": "beauty",
      beauty: "beauty",
      "pet care": "pet-care",
      "pet-care": "pet-care",
      events: "events",
      "events & entertainment": "events",
      "events and entertainment": "events",
      other: "other",
    };

    return skillMap[normalized] || normalized; // Return mapped value or original if not found
  }

  /**
   * Parse CSV file using streaming parser (memory efficient)
   * @param fileBuffer - CSV file buffer
   * @param defaultPrimaryCategory - Default primary category if not in CSV
   * @param defaultSecondaryCategory - Default secondary category if not in CSV
   * @param progressCallback - Optional callback for progress updates
   * @returns Promise resolving to array of parsed rows
   */
  static async parseCSV(
    fileBuffer: Buffer,
    defaultPrimaryCategory?: string,
    defaultSecondaryCategory?: string,
    progressCallback?: ProgressCallback,
  ): Promise<BulkLeadImportRow[]> {
    return new Promise((resolve, reject) => {
      const parsedRows: BulkLeadImportRow[] = [];
      let processedRowCount = 0;
      let totalRowCount = 0;

      // Create readable stream from buffer
      const csvStream = Readable.from(fileBuffer.toString());

      // Create CSV parser with streaming
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
      });

      // Header indicators for filtering
      const headerIndicators = new Set(
        [
          "full name",
          "phone number",
          "mobile number",
          "email",
          "city / area",
          "city",
          "state",
          "address",
          "pincode",
          "primary category",
          "secondary category",
          "experience level",
          "years of experience",
          "working days",
          "preferred time slot",
          "source",
        ].map((s) => s.toLowerCase()),
      );

      // Process each row as it streams in
      parser.on("readable", () => {
        let record: any;
        while ((record = parser.read()) !== null) {
          totalRowCount++;

          // Normalize header keys by trimming whitespace
          const normalizedRecord: any = {};
          Object.keys(record).forEach((key) => {
            const trimmedKey = key.trim();
            normalizedRecord[trimmedKey] = record[key];
          });

          // Filter out invalid rows
          const recordValues = Object.values(normalizedRecord).map((v) =>
            v === undefined || v === null ? "" : String(v).trim(),
          );

          // Skip empty rows
          if (recordValues.every((v) => v === "")) {
            continue;
          }

          // Skip comment rows
          if (recordValues[0]?.startsWith("#")) {
            continue;
          }

          // Skip header rows
          const looksLikeHeaderRow = recordValues.some((v) =>
            headerIndicators.has(String(v).toLowerCase()),
          );
          if (looksLikeHeaderRow) {
            continue;
          }

          // Transform record to BulkLeadImportRow format
          const rawPrimaryCategory =
            normalizedRecord.primaryCategory ||
            normalizedRecord["Primary Category"] ||
            normalizedRecord.primarySkill ||
            normalizedRecord["Primary Skill"] ||
            normalizedRecord["Primary Skill (Service Category)"] ||
            normalizedRecord["Service Category"] ||
            normalizedRecord["Skill"] ||
            defaultPrimaryCategory ||
            "";

          const mappedPrimaryCategory = rawPrimaryCategory
            ? BulkLeadImportService.mapSkillToEnum(rawPrimaryCategory)
            : "";

          const rawSecondaryCategory =
            normalizedRecord.secondaryCategory ||
            normalizedRecord["Secondary Category"] ||
            normalizedRecord.secondarySkill ||
            normalizedRecord["Secondary Skill"] ||
            defaultSecondaryCategory ||
            "";

          const experienceLevel = (
            normalizedRecord.experienceLevel ||
            normalizedRecord["Experience Level"] ||
            normalizedRecord[
              "Experience Level (beginner/intermediate/experienced)"
            ] ||
            ""
          ).toLowerCase();

          const validExperienceLevels = [
            "beginner",
            "intermediate",
            "experienced",
          ];
          const mappedExperienceLevel = validExperienceLevels.includes(
            experienceLevel,
          )
            ? (experienceLevel as "beginner" | "intermediate" | "experienced")
            : undefined;

          const yearsOfExperience =
            normalizedRecord.yearsOfExperience ||
            normalizedRecord["Years of Experience"] ||
            normalizedRecord["Years Of Experience"]
              ? parseInt(
                  normalizedRecord.yearsOfExperience ||
                    normalizedRecord["Years of Experience"] ||
                    normalizedRecord["Years Of Experience"] ||
                    "0",
                  10,
                )
              : undefined;

          const parsedRow: BulkLeadImportRow = {
            name: normalizedRecord.name || normalizedRecord["Full Name"] || "",
            phone:
              normalizedRecord.phone ||
              normalizedRecord["Phone Number"] ||
              normalizedRecord["Mobile Number"] ||
              normalizedRecord["Phone"] ||
              "",
            email: normalizedRecord.email || normalizedRecord["Email"] || "",
            city:
              normalizedRecord.city ||
              normalizedRecord["City"] ||
              normalizedRecord["City / Area"] ||
              normalizedRecord["City (optional)"] ||
              "",
            state:
              normalizedRecord.state ||
              normalizedRecord["State"] ||
              normalizedRecord["State (optional)"] ||
              "",
            address:
              normalizedRecord.address || normalizedRecord["Address"] || "",
            pincode:
              normalizedRecord.pincode ||
              normalizedRecord["Pincode"] ||
              normalizedRecord["Pin Code"] ||
              normalizedRecord["PIN"] ||
              "",
            primaryCategory: mappedPrimaryCategory,
            primarySkill: mappedPrimaryCategory,
            secondaryCategory: rawSecondaryCategory,
            experienceLevel: mappedExperienceLevel,
            yearsOfExperience: isNaN(yearsOfExperience as number)
              ? undefined
              : yearsOfExperience,
            workingDays:
              normalizedRecord.workingDays ||
              normalizedRecord["Working Days"] ||
              "",
            preferredTimeSlot:
              normalizedRecord.preferredTimeSlot ||
              normalizedRecord["Preferred Time Slot"] ||
              normalizedRecord["Preferred TimeSlot"] ||
              "",
            source: (
              normalizedRecord.source ||
              normalizedRecord["Source"] ||
              "referral"
            ).toLowerCase() as LeadSource,
            sourceDetails:
              normalizedRecord.sourceDetails ||
              normalizedRecord["Source Details"] ||
              "",
          };

          parsedRows.push(parsedRow);
          processedRowCount++;

          // Report progress every 100 rows
          if (progressCallback && processedRowCount % 100 === 0) {
            const progressPercent = Math.min(
              95,
              Math.floor(
                (processedRowCount / Math.max(totalRowCount, 1)) * 100,
              ),
            );
            progressCallback(
              progressPercent,
              `Parsed ${processedRowCount} rows...`,
            );
          }
        }
      });

      parser.on("error", (error: Error) => {
        logger.error("CSV streaming parser error", { error: error.message });
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      });

      parser.on("end", () => {
        logger.info("CSV parsing completed", {
          totalRows: totalRowCount,
          processedRows: processedRowCount,
        });
        resolve(parsedRows);
      });

      // Pipe CSV stream to parser
      csvStream.pipe(parser);
    });
  }

  /**
   * Parse Excel file (.xls, .xlsx)
   */
  static async parseExcel(
    fileBuffer: Buffer,
    defaultPrimaryCategory?: string,
    defaultSecondaryCategory?: string,
    progressCallback?: ProgressCallback,
  ): Promise<BulkLeadImportRow[]> {
    return new Promise((resolve, reject) => {
      try {
        if (progressCallback) progressCallback(10, "Reading Excel file...");

        const workbook = xlsx.read(fileBuffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          throw new Error("Excel file is empty (no sheets found)");
        }

        const sheet = workbook.Sheets[sheetName];

        // Convert sheet to JSON with raw values
        const records: any[] = xlsx.utils.sheet_to_json(sheet, {
          raw: false, // Convert all values to strings to match CSV behavior
          defval: "", // Default value for empty cells
        });

        if (progressCallback)
          progressCallback(
            40,
            `Found ${records.length} rows in Excel sheet. Processing...`,
          );

        const parsedRows: BulkLeadImportRow[] = [];
        let processedRowCount = 0;
        const totalRowCount = records.length;

        for (const record of records) {
          // Normalize keys (trim whitespace)
          const normalizedRecord: any = {};
          Object.keys(record).forEach((key) => {
            const trimmedKey = key.trim();
            normalizedRecord[trimmedKey] = record[key];
          });

          // SKIP EMPTY ROWS
          // Check if the row has any actual content
          const hasContent = Object.values(normalizedRecord).some(
            (val) =>
              val !== null &&
              val !== undefined &&
              String(val).trim().length > 0,
          );

          if (!hasContent) {
            continue;
          }

          processedRowCount++;

          // Transform record to BulkLeadImportRow format
          const rawPrimaryCategory =
            normalizedRecord.primaryCategory ||
            normalizedRecord["Primary Category"] ||
            normalizedRecord.primarySkill ||
            normalizedRecord["Primary Skill"] ||
            normalizedRecord["Primary Skill (Service Category)"] ||
            normalizedRecord["Service Category"] ||
            normalizedRecord["Skill"] ||
            defaultPrimaryCategory ||
            "";

          const mappedPrimaryCategory = rawPrimaryCategory
            ? BulkLeadImportService.mapSkillToEnum(rawPrimaryCategory)
            : "";

          const rawSecondaryCategory =
            normalizedRecord.secondaryCategory ||
            normalizedRecord["Secondary Category"] ||
            normalizedRecord.secondarySkill ||
            normalizedRecord["Secondary Skill"] ||
            defaultSecondaryCategory ||
            "";

          const experienceLevel = (
            normalizedRecord.experienceLevel ||
            normalizedRecord["Experience Level"] ||
            normalizedRecord[
              "Experience Level (beginner/intermediate/experienced)"
            ] ||
            ""
          ).toLowerCase();

          const validExperienceLevels = [
            "beginner",
            "intermediate",
            "experienced",
          ];
          const mappedExperienceLevel = validExperienceLevels.includes(
            experienceLevel,
          )
            ? (experienceLevel as "beginner" | "intermediate" | "experienced")
            : undefined;

          const yearsOfExperience =
            normalizedRecord.yearsOfExperience ||
            normalizedRecord["Years of Experience"] ||
            normalizedRecord["Years Of Experience"]
              ? parseInt(
                  normalizedRecord.yearsOfExperience ||
                    normalizedRecord["Years of Experience"] ||
                    normalizedRecord["Years Of Experience"] ||
                    "0",
                  10,
                )
              : undefined;

          const parsedRow: BulkLeadImportRow = {
            name: normalizedRecord.name || normalizedRecord["Full Name"] || "",
            phone:
              normalizedRecord.phone ||
              normalizedRecord["Phone Number"] ||
              normalizedRecord["Mobile Number"] ||
              normalizedRecord["Phone"] ||
              "",
            email: normalizedRecord.email || normalizedRecord["Email"] || "",
            city:
              normalizedRecord.city ||
              normalizedRecord["City"] ||
              normalizedRecord["City / Area"] ||
              normalizedRecord["City (optional)"] ||
              "",
            state:
              normalizedRecord.state ||
              normalizedRecord["State"] ||
              normalizedRecord["State (optional)"] ||
              "",
            address:
              normalizedRecord.address || normalizedRecord["Address"] || "",
            pincode:
              normalizedRecord.pincode ||
              normalizedRecord["Pincode"] ||
              normalizedRecord["Pin Code"] ||
              normalizedRecord["PIN"] ||
              "",
            primaryCategory: mappedPrimaryCategory,
            primarySkill: mappedPrimaryCategory,
            secondaryCategory: rawSecondaryCategory,
            experienceLevel: mappedExperienceLevel,
            yearsOfExperience: isNaN(yearsOfExperience as number)
              ? undefined
              : yearsOfExperience,
            workingDays:
              normalizedRecord.workingDays ||
              normalizedRecord["Working Days"] ||
              "",
            preferredTimeSlot:
              normalizedRecord.preferredTimeSlot ||
              normalizedRecord["Preferred Time Slot"] ||
              normalizedRecord["Preferred TimeSlot"] ||
              "",
            source: (
              normalizedRecord.source ||
              normalizedRecord["Source"] ||
              "referral"
            ).toLowerCase() as LeadSource,
            sourceDetails:
              normalizedRecord.sourceDetails ||
              normalizedRecord["Source Details"] ||
              "",
          };

          parsedRows.push(parsedRow);
        }

        resolve(parsedRows);
      } catch (error: any) {
        logger.error("Excel parsing error", { error: error.message });
        reject(new Error(`Failed to parse Excel file: ${error.message}`));
      }
    });
  }

  /**
   * Parse file based on extension (CSV or Excel)
   */
  static async parseFile(
    fileBuffer: Buffer,
    fileName: string,
    defaultPrimaryCategory?: string,
    defaultSecondaryCategory?: string,
    progressCallback?: ProgressCallback,
  ): Promise<BulkLeadImportRow[]> {
    const ext = path.extname(fileName).toLowerCase();

    if (ext === ".csv") {
      return this.parseCSV(
        fileBuffer,
        defaultPrimaryCategory,
        defaultSecondaryCategory,
        progressCallback,
      );
    } else if (ext === ".xlsx" || ext === ".xls") {
      return this.parseExcel(
        fileBuffer,
        defaultPrimaryCategory,
        defaultSecondaryCategory,
        progressCallback,
      );
    } else {
      throw new Error(
        `Unsupported file format: ${ext}. Please upload .csv, .xls, or .xlsx`,
      );
    }
  }

  /**
   * Validate import row
   * @param row - The row to validate
   * @param rowNumber - Row number for error reporting
   * @param defaultPrimaryCategory - Default primary category if not in CSV
   * @param defaultSecondaryCategory - Default secondary category if not in CSV
   */
  static validateRow(
    row: BulkLeadImportRow,
    rowNumber: number,
    defaultPrimaryCategory?: string,
    defaultSecondaryCategory?: string,
  ): { valid: boolean; error?: string } {
    if (!row.name || row.name.trim().length < 2) {
      return {
        valid: false,
        error: "Name is required and must be at least 2 characters",
      };
    }

    // Normalize phone - handle +91-XXXXXXXXXX or just XXXXXXXXXX
    const phoneDigits = row.phone.replace(/\D/g, ""); // Remove all non-digits
    const last10Digits = phoneDigits.slice(-10); // Get last 10 digits

    if (!row.phone || !/^[6-9]\d{9}$/.test(last10Digits)) {
      return {
        valid: false,
        error:
          "Invalid phone number (10 digits, starting with 6-9). Can be +91-XXXXXXXXXX or just XXXXXXXXXX",
      };
    }

    if (!row.city || row.city.trim().length < 2) {
      return { valid: false, error: "City is required" };
    }

    if (!row.state || row.state.trim().length < 2) {
      return { valid: false, error: "State is required" };
    }

    if (!row.address || row.address.trim().length < 5) {
      return {
        valid: false,
        error: "Address is required (minimum 5 characters)",
      };
    }

    // Check primary category - use row value or default
    const primaryCategory = (
      row.primaryCategory ||
      row.primarySkill ||
      defaultPrimaryCategory ||
      ""
    ).trim();
    if (!primaryCategory || primaryCategory.length < 2) {
      return {
        valid: false,
        error:
          "Primary category is required (either in CSV or provided as default)",
      };
    }

    // Validate primary category is one of the allowed categories
    const validCategories = [
      "cleaning",
      "handyperson",
      "moving",
      "gardening",
      "business",
      "marketing",
      "tech",
      "tutoring",
      "photography",
      "beauty",
      "pet-care",
      "events",
      "other",
    ];
    const normalizedCategory = primaryCategory.toLowerCase().trim();
    if (!validCategories.includes(normalizedCategory)) {
      return {
        valid: false,
        error: `Invalid primary category. Must be one of: ${validCategories.join(", ")}`,
      };
    }

    // Check secondary category - use row value or default
    const secondaryCategory = (
      row.secondaryCategory ||
      defaultSecondaryCategory ||
      ""
    ).trim();
    if (!secondaryCategory || secondaryCategory.length < 1) {
      return {
        valid: false,
        error:
          "Secondary category is required (either in CSV or provided as default)",
      };
    }
    if (!row.city || row.city.trim().length < 2) {
      return { valid: false, error: "City is required" };
    }
    if (!row.state || row.state.trim().length < 2) {
      return { valid: false, error: "State is required" };
    }
    if (!row.address || row.address.trim().length < 5) {
      return {
        valid: false,
        error: "Address is required (minimum 5 characters)",
      };
    }

    // Validate experience level is provided
    if (!row.experienceLevel) {
      return {
        valid: false,
        error:
          "Experience level is required (beginner, intermediate, or experienced)",
      };
    }

    const validExperienceLevels = ["beginner", "intermediate", "experienced"];
    if (!validExperienceLevels.includes(row.experienceLevel.toLowerCase())) {
      return {
        valid: false,
        error: `Invalid experience level. Must be one of: ${validExperienceLevels.join(", ")}`,
      };
    }

    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      return { valid: false, error: "Invalid email format" };
    }

    const validSources: LeadSource[] = [
      "referral",
      "campaign",
      "walk-in",
      "agent",
      "other",
    ];
    if (!validSources.includes(row.source)) {
      return {
        valid: false,
        error: `Invalid source. Must be one of: ${validSources.join(", ")}`,
      };
    }

    // const allowedStatuses: LeadStatus[] = ['lead_added', 'contacted', 'interested'];
    // if (row.status && !allowedStatuses.includes(row.status as LeadStatus)) {
    //   return { valid: false, error: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` };
    // }

    return { valid: true };
  }

  /**
   * Preview bulk import (validation + duplicate check, no records created)
   */
  static async previewBulkImport(
    fileBuffer: Buffer,
    fileName: string,
    defaultPrimaryCategory?: string,
    defaultSecondaryCategory?: string,
  ): Promise<{
    rows: Array<{
      rowNumber: number;
      name: string;
      phone: string;
      email?: string;
      city: string;
      state: string;
      primaryCategory: string;
      secondaryCategory: string;
      experienceLevel?: string;
      status: "valid" | "invalid";
      errors: string[];
      isDuplicateInFile: boolean;
      isDuplicateInDb: boolean;
      duplicateLeadId?: string;
    }>;
    summary: {
      total: number;
      valid: number;
      invalid: number;
      duplicatesInFile: number;
      duplicatesInDb: number;
    };
  }> {
    // 1. Parse File (CSV or Excel)
    const rows = await this.parseFile(
      fileBuffer,
      fileName,
      defaultPrimaryCategory,
      defaultSecondaryCategory,
    );

    // 2. Bulk duplicate check against database
    const allPhones = rows.map((r) => r.phone).filter(Boolean);
    logger.info(
      `[Preview] Performing bulk duplicate check for ${allPhones.length} phone numbers`,
    );
    const existingLeadsByPhoneMap =
      await DuplicateCheckService.checkPhonesBulk(allPhones);
    logger.info(
      `[Preview] Duplicate check completed. Found ${existingLeadsByPhoneMap.size} existing leads`,
    );

    // 3. Track in-file duplicates
    const seenPhonesInFile = new Set<string>();

    // 4. Build preview rows
    const previewRows = rows.map((row, index) => {
      const rowNumber = index + 2; // +2 for header row and 0-index
      const normalizedPhone = row.phone
        ? DuplicateCheckService.normalizePhone(row.phone)
        : "";

      // Check in-file duplicate
      const isDuplicateInFile =
        normalizedPhone !== "" && seenPhonesInFile.has(normalizedPhone);
      if (!isDuplicateInFile && normalizedPhone) {
        seenPhonesInFile.add(normalizedPhone);
      }

      // Check database duplicate
      const existingLead = normalizedPhone
        ? existingLeadsByPhoneMap.get(normalizedPhone)
        : undefined;
      const isDuplicateInDb = !!existingLead;

      // Validate row (pass default categories for validation)
      const validation = this.validateRow(
        row,
        rowNumber,
        defaultPrimaryCategory,
        defaultSecondaryCategory,
      );
      const rowErrors: string[] = [];

      if (!validation.valid && validation.error) {
        rowErrors.push(validation.error);
      }

      // Add duplicate errors
      if (isDuplicateInFile) {
        rowErrors.push("Duplicate phone number within uploaded file");
      }
      if (isDuplicateInDb && existingLead) {
        rowErrors.push(`Duplicate in system: ${existingLead.leadId}`);
      }

      return {
        rowNumber,
        name: row.name || "Unknown",
        phone: row.phone || "",
        email: row.email,
        city: row.city || "Unknown",
        state: row.state || "",
        primaryCategory: row.primaryCategory || row.primarySkill || "other",
        secondaryCategory: row.secondaryCategory || "",
        experienceLevel: row.experienceLevel,
        status: (rowErrors.length === 0 ? "valid" : "invalid") as
          | "valid"
          | "invalid",
        errors: rowErrors,
        isDuplicateInFile,
        isDuplicateInDb,
        duplicateLeadId: existingLead?.leadId,
      };
    });

    // 5. Build summary
    const summary = {
      total: previewRows.length,
      valid: previewRows.filter((r) => r.status === "valid").length,
      invalid: previewRows.filter((r) => r.status === "invalid").length,
      duplicatesInFile: previewRows.filter((r) => r.isDuplicateInFile).length,
      duplicatesInDb: previewRows.filter((r) => r.isDuplicateInDb).length,
    };

    logger.info("Bulk lead import preview completed", {
      fileName,
      total: summary.total,
      valid: summary.valid,
      invalid: summary.invalid,
      duplicatesInFile: summary.duplicatesInFile,
      duplicatesInDb: summary.duplicatesInDb,
    });

    return { rows: previewRows, summary };
  }

  /**
   * Bulk import leads from CSV
   * ✅ Idempotent: Same file uploaded twice returns existing result
   * ✅ Concurrent-safe: Uses MongoDB transactions and atomic operations
   * ✅ Efficient: Uses bulk operations for better performance
   */
  static async bulkImportLeads(
    fileBuffer: Buffer,
    fileName: string,
    userId: string, // Changed from adminUid to userId (works for any role)
    adminName?: string,
    adminEmail?: string,
    adminRole?: "qualifier" | "onboarder" | "lead_access_manager",
    source?: LeadSource,
    defaultPrimaryCategory?: string,
    defaultSecondaryCategory?: string,
    progressCallback?: ProgressCallback,
  ): Promise<BulkLeadImportResult> {
    const session = await mongoose.startSession();
    session.startTransaction();

    let importRecord: IBulkImport | null = null;

    try {
      // STEP 1: Calculate file hash for idempotency
      const fileHash = crypto
        .createHash("sha256")
        .update(fileBuffer)
        .digest("hex");

      // STEP 2: Check if this file was already uploaded by this user (idempotency)
      const existingImport = await BulkImport.findOne({
        fileHash,
        createdBy: userId,
      })
        .session(session)
        .lean();

      if (existingImport && existingImport.status === "completed") {
        // ✅ Check if all leads from previous import are inactive/deleted
        // If so, allow re-import
        if (
          existingImport.importedUserIds &&
          existingImport.importedUserIds.length > 0
        ) {
          const activeLeadsCount = await Lead.countDocuments({
            leadId: { $in: existingImport.importedUserIds },
            status: { $nin: ["inactive", "rejected"] }, // Count only active leads
          }).session(session);

          if (activeLeadsCount === 0) {
            // All leads from previous import are inactive/deleted - allow re-import
            logger.info(
              "Previous import leads are all inactive - allowing re-import",
              {
                previousImportId: existingImport.importId,
                fileHash: fileHash.substring(0, 16) + "...",
                userId,
                previousLeadCount: existingImport.importedUserIds.length,
              },
            );
            // Continue with new import (don't return existing result)
          } else {
            // Some leads are still active - return existing result (idempotent)
            await session.commitTransaction();
            logger.info("Idempotent import: returning existing result", {
              importId: existingImport.importId,
              fileHash: fileHash.substring(0, 16) + "...",
              userId,
              activeLeadsCount,
            });

            return {
              importId: existingImport.importId,
              totalRows: existingImport.totalRows,
              successCount: existingImport.successCount,
              failedCount: existingImport.failedCount,
              errors: (existingImport.errors || []) as any,
              importedLeadIds: existingImport.importedUserIds || [],
            };
          }
        } else {
          // No leads were imported previously - return existing result
          await session.commitTransaction();
          logger.info(
            "Idempotent import: returning existing result (no leads imported)",
            {
              importId: existingImport.importId,
              fileHash: fileHash.substring(0, 16) + "...",
              userId,
            },
          );

          return {
            importId: existingImport.importId,
            totalRows: existingImport.totalRows,
            successCount: existingImport.successCount,
            failedCount: existingImport.failedCount,
            errors: (existingImport.errors || []) as any,
            importedLeadIds: existingImport.importedUserIds || [],
          };
        }
      }

      // STEP 3: Parse file (CSV or Excel) with streaming
      if (progressCallback) {
        progressCallback(
          10,
          `Reading and parsing ${path.extname(fileName)} file...`,
        );
      }

      const rows = await this.parseFile(
        fileBuffer,
        fileName,
        defaultPrimaryCategory,
        defaultSecondaryCategory,
        (progress, message) => {
          // Map parsing progress (10-30% of total)
          const mappedProgress = 10 + Math.floor((progress / 100) * 20);
          if (progressCallback) {
            progressCallback(mappedProgress, message);
          }
        },
      );

      if (progressCallback) {
        progressCallback(30, `Parsed ${rows.length} rows. Validating data...`);
      }

      // STEP 4: Create or get import record atomically (prevent duplicate processing)
      const importId = `IMPORT-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;

      // ✅ If previous import exists and all leads are inactive, delete it first to allow re-import
      if (existingImport && existingImport.status === "completed") {
        const activeLeadsCount = await Lead.countDocuments({
          leadId: { $in: existingImport.importedUserIds || [] },
          status: { $nin: ["inactive", "rejected"] },
        }).session(session);

        if (activeLeadsCount === 0) {
          // Delete the old import record to allow new one
          await BulkImport.deleteOne({
            importId: existingImport.importId,
          }).session(session);
          logger.info("Deleted previous import record to allow re-import", {
            previousImportId: existingImport.importId,
            userId,
          });
        }
      }

      const importRecordResult = await BulkImport.findOneAndUpdate(
        {
          fileHash,
          createdBy: userId,
          status: { $ne: "processing" }, // Only if not already processing
        },
        {
          $setOnInsert: {
            importId,
            fileHash,
            adminUid: userId, // Legacy field for backward compatibility
            createdBy: userId,
            createdByName: adminName,
            createdByEmail: adminEmail,
            createdByRole: adminRole,
            fileName,
            totalRows: rows.length,
            successCount: 0,
            failedCount: 0,
            status: "processing",
            operationType: "create",
            errors: [],
            importedUserIds: [],
          },
        },
        {
          upsert: true,
          new: true,
          session,
        },
      );

      importRecord = importRecordResult as IBulkImport;

      // If record was already processing, wait a bit and check again
      if (!importRecordResult || importRecordResult.status === "processing") {
        const checkAgain = await BulkImport.findOne({
          fileHash,
          createdBy: userId,
        })
          .session(session)
          .lean();

        if (checkAgain && checkAgain.status === "completed") {
          await session.commitTransaction();
          return {
            importId: checkAgain.importId,
            totalRows: checkAgain.totalRows,
            successCount: checkAgain.successCount,
            failedCount: checkAgain.failedCount,
            errors: (checkAgain.errors || []) as any,
            importedLeadIds: checkAgain.importedUserIds || [],
          };
        }
      }

      type ImportError = {
        row: number;
        uid?: string;
        phone?: string;
        error: string;
      };
      const errors: ImportError[] = [];

      // STEP 5: Bulk duplicate check - Check ALL phones at once (single MongoDB query)
      if (progressCallback) {
        progressCallback(40, "Checking for duplicate leads in database...");
      }

      const allPhones = rows.map((r) => r.phone).filter(Boolean);
      const existingLeadsByPhoneMap =
        await DuplicateCheckService.checkPhonesBulk(allPhones);

      logger.info("Performing bulk duplicate check", {
        importId,
        phoneCount: allPhones.length,
        userId,
      });

      if (progressCallback) {
        progressCallback(50, "Processing and validating rows...");
      }

      // STEP 6: Track in-file duplicates and prepare bulk insert documents
      const seenPhonesInFile = new Set<string>();
      const leadsToInsert: any[] = [];
      const normalizedPhones: string[] = [];
      const totalRowsToProcess = rows.length;

      for (let i = 0; i < rows.length; i++) {
        // Update progress during row processing (50-70% of total)
        if (progressCallback && i > 0 && i % 50 === 0) {
          const rowProgress = 50 + Math.floor((i / totalRowsToProcess) * 20);
          progressCallback(
            rowProgress,
            `Processing row ${i + 1} of ${totalRowsToProcess}...`,
          );
        }
        const row = rows[i];
        const rowNumber = i + 2; // +2 because CSV has header and 0-indexed

        // Validate row
        const validation = this.validateRow(
          row,
          rowNumber,
          defaultPrimaryCategory,
          defaultSecondaryCategory,
        );
        if (!validation.valid) {
          errors.push({
            row: rowNumber,
            phone: row.phone,
            error: validation.error || "Validation failed",
          });
          continue;
        }

        // Normalize phone
        const normalizedPhone = DuplicateCheckService.normalizePhone(row.phone);

        // Check for duplicate within this file
        if (seenPhonesInFile.has(normalizedPhone)) {
          errors.push({
            row: rowNumber,
            phone: row.phone,
            error: "Duplicate phone number within uploaded file",
          });
          continue;
        }
        seenPhonesInFile.add(normalizedPhone);

        // Check for duplicate in database
        const existingLead = existingLeadsByPhoneMap.get(normalizedPhone);
        if (existingLead) {
          errors.push({
            row: rowNumber,
            phone: normalizedPhone,
            error: `Duplicate lead found: ${existingLead.leadId}`,
          });
          continue;
        }

        // Use provided source or row source
        const leadSource = source || row.source || "referral";

        // Prepare lead document for bulk insert
        const leadId = LeadService.generateLeadId();
        normalizedPhones.push(normalizedPhone);

        // Map primary skill category to human-readable name (same as LeadService)
        const primarySkillCategory = (
          row.primaryCategory ||
          row.primarySkill ||
          ""
        ).trim();
        const primarySkillNameMap: Record<string, string> = {
          cleaning: "Cleaning",
          handyperson: "Handyperson",
          moving: "Moving & Delivery",
          gardening: "Gardening",
          business: "Business Services",
          marketing: "Marketing & Design",
          tech: "Tech Support",
          tutoring: "Tutoring",
          photography: "Photography",
          beauty: "Beauty & Wellness",
          "pet-care": "Pet Care",
          events: "Events & Entertainment",
          other: "Other",
        };
        const primarySkillName =
          primarySkillNameMap[primarySkillCategory] || primarySkillCategory;

        leadsToInsert.push({
          leadId,
          name: row.name.trim(),
          phone: normalizedPhone,
          email: row.email?.trim(),
          city: row.city.trim(),
          state: row.state.trim(),
          address: row.address.trim(),
          pincode: row.pincode?.trim(),
          primaryCategory: primarySkillCategory,
          primarySkill: primarySkillCategory, // Legacy field
          secondaryCategory: row.secondaryCategory?.trim() || "",
          secondarySkill: row.secondaryCategory?.trim() || "", // Legacy field
          experienceLevel: row.experienceLevel || "beginner",
          workingDays: row.workingDays?.trim(),
          preferredTimeSlot: row.preferredTimeSlot?.trim(),
          source: leadSource,
          sourceDetails:
            row.sourceDetails?.trim() ||
            (leadSource !== row.source
              ? `Bulk import: ${row.source}`
              : undefined),
          status: "lead_added",
          accountStatus: "not_created",
          statusHistory: [
            {
              status: "lead_added",
              changedBy: userId,
              changedByName: adminName,
              changedAt: new Date(),
            },
          ],
          skills: [
            {
              name: primarySkillName,
              category: primarySkillCategory,
              level: "experienced",
              toolsAvailable: false,
              assignedBy: userId,
              assignedAt: new Date(),
            },
          ],
          documents: [],
          verificationStatus: {},
          communicationLog: [],
          internalNotes: [],
          isDuplicate: false,
          blacklisted: false,
          creationMethod: "bulk_upload",
          addedBy: userId,
          addedByName: adminName,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // STEP 7: Bulk insert leads (atomic, efficient)
      if (progressCallback) {
        progressCallback(
          70,
          `Preparing to insert ${leadsToInsert.length} leads into database...`,
        );
      }

      let importedLeadIds: string[] = [];

      if (leadsToInsert.length > 0) {
        // Log before insertion for debugging
        logger.info("Preparing to insert leads", {
          importId,
          count: leadsToInsert.length,
          sampleLeadIds: leadsToInsert.slice(0, 3).map((l) => l.leadId),
          userId,
        });

        try {
          // Use insertMany with ordered: false to continue on errors
          const insertResult = await Lead.insertMany(leadsToInsert, {
            ordered: false, // Continue on error, don't stop
            session,
          });

          logger.info("insertMany completed", {
            importId,
            resultCount: insertResult.length,
            resultType: Array.isArray(insertResult)
              ? "array"
              : typeof insertResult,
            sampleResult:
              insertResult.length > 0
                ? {
                    hasLeadId: !!insertResult[0].leadId,
                    keys: Object.keys(insertResult[0] || {}),
                    leadIdValue: insertResult[0]?.leadId,
                  }
                : null,
          });

          // Extract leadIds from inserted documents
          // insertMany returns Mongoose documents, leadId should be directly accessible
          importedLeadIds = insertResult
            .map((lead: any) => {
              // Try multiple ways to access leadId (Mongoose document can be accessed differently)
              const leadId =
                lead.leadId ||
                (lead.toObject && lead.toObject().leadId) ||
                lead._doc?.leadId;
              if (!leadId) {
                logger.error("Lead ID not found in insert result", {
                  leadKeys: Object.keys(lead),
                  leadIdType: typeof lead.leadId,
                  importId,
                });
              }
              return leadId;
            })
            .filter(Boolean); // Remove any undefined values

          // If extraction failed, try to get from original leadsToInsert
          if (importedLeadIds.length === 0 && insertResult.length > 0) {
            logger.warn(
              "Failed to extract leadIds from insertResult, using original data",
              {
                importId,
                insertResultLength: insertResult.length,
                leadsToInsertLength: leadsToInsert.length,
              },
            );
            importedLeadIds = leadsToInsert
              .map((lead) => lead.leadId)
              .filter(Boolean);
          }

          if (progressCallback) {
            progressCallback(
              90,
              `Successfully inserted ${importedLeadIds.length} leads. Finalizing...`,
            );
          }

          logger.info("Bulk insert completed", {
            importId,
            attempted: leadsToInsert.length,
            successful: importedLeadIds.length,
            importedLeadIds: importedLeadIds.slice(0, 5), // Log first 5 for debugging
            userId,
          });

          // Handle partial failures (some may fail due to race conditions)
          if (insertResult.length < leadsToInsert.length) {
            const failedCount = leadsToInsert.length - insertResult.length;
            logger.warn(
              "Some leads failed to insert (likely race conditions)",
              {
                importId,
                failed: failedCount,
                userId,
              },
            );
          }
        } catch (bulkError: any) {
          // Bulk insert may have partial success
          if (bulkError.writeErrors) {
            // Extract successfully inserted leads
            const insertedLeadIds = leadsToInsert
              .filter((_, index) => {
                // Check if this index had an error
                return !bulkError.writeErrors.some(
                  (err: any) => err.index === index,
                );
              })
              .map((lead) => lead.leadId);

            importedLeadIds = insertedLeadIds;

            // Add write errors to errors array
            bulkError.writeErrors.forEach((err: any) => {
              const rowIndex = err.index;
              const row = rows[rowIndex];
              errors.push({
                row: rowIndex + 2,
                phone: row?.phone,
                error: err.errmsg || "Failed to insert lead",
              });
            });

            logger.warn("Bulk insert had partial failures", {
              importId,
              successful: importedLeadIds.length,
              failed: bulkError.writeErrors.length,
              userId,
            });
          } else {
            throw bulkError;
          }
        }
      }

      // STEP 8: Update import record atomically
      if (progressCallback) {
        progressCallback(95, "Saving import results...");
      }

      const finalStatus =
        errors.length === rows.length ? "failed" : "completed";

      await BulkImport.findOneAndUpdate(
        { importId },
        {
          $set: {
            successCount: importedLeadIds.length,
            failedCount:
              errors.length + (leadsToInsert.length - importedLeadIds.length),
            status: finalStatus,
            importedUserIds: importedLeadIds,
            errors: errors as any,
            completedAt: new Date(),
          },
        },
        { session },
      );

      await session.commitTransaction();
      logger.info("Transaction committed successfully", {
        importId,
        importedLeadIdsCount: importedLeadIds.length,
        importedLeadIds: importedLeadIds.slice(0, 3),
      });

      if (progressCallback) {
        progressCallback(
          100,
          `Import completed! ${importedLeadIds.length} leads imported successfully.`,
        );
      }

      // End session after commit
      await session.endSession();

      // Verify leads were actually saved (for debugging)
      // Use a new query outside the transaction to verify persistence
      if (importedLeadIds.length > 0) {
        try {
          // Small delay to ensure write is visible (MongoDB eventual consistency)
          await new Promise((resolve) => setTimeout(resolve, 100));

          const verifyCount = await Lead.countDocuments({
            leadId: { $in: importedLeadIds },
          });

          if (verifyCount !== importedLeadIds.length) {
            logger.error(
              "❌ Lead count mismatch after commit - leads may not be persisted!",
              {
                importId,
                expected: importedLeadIds.length,
                actual: verifyCount,
                importedLeadIds: importedLeadIds.slice(0, 5),
                missingCount: importedLeadIds.length - verifyCount,
              },
            );

            // Try to find which leads are missing
            const foundLeads = await Lead.find({
              leadId: { $in: importedLeadIds },
            })
              .select("leadId name phone")
              .lean();
            const foundLeadIds = foundLeads.map((l) => l.leadId);
            const missingLeadIds = importedLeadIds.filter(
              (id) => !foundLeadIds.includes(id),
            );

            if (missingLeadIds.length > 0) {
              logger.error("Missing lead IDs after commit", {
                importId,
                missingLeadIds: missingLeadIds.slice(0, 5),
                foundLeadIds: foundLeadIds.slice(0, 5),
              });

              // Try to query one missing lead directly
              if (missingLeadIds.length > 0) {
                const testLead = await Lead.findOne({
                  leadId: missingLeadIds[0],
                }).lean();
                logger.error("Direct query test for missing lead", {
                  importId,
                  testLeadId: missingLeadIds[0],
                  found: !!testLead,
                  testLeadData: testLead
                    ? { leadId: testLead.leadId, name: testLead.name }
                    : null,
                });
              }
            }
          } else {
            logger.info("✅ Leads verified in database after commit", {
              importId,
              count: verifyCount,
              sampleLeadIds: importedLeadIds.slice(0, 3),
            });
          }
        } catch (verifyError: any) {
          logger.error("Error verifying leads after commit", {
            importId,
            error: verifyError.message,
            stack: verifyError.stack,
            importedLeadIds: importedLeadIds.slice(0, 3),
          });
        }
      }

      logger.info("Bulk lead import completed", {
        importId,
        totalRows: rows.length,
        successCount: importedLeadIds.length,
        failedCount: errors.length,
        userId,
        role: adminRole,
      });

      return {
        importId,
        totalRows: rows.length,
        successCount: importedLeadIds.length,
        failedCount: errors.length,
        errors,
        importedLeadIds,
      };
    } catch (error: any) {
      await session.abortTransaction();

      logger.error("Bulk lead import failed", {
        importId: importRecord?.importId,
        error: error.message,
        stack: error.stack,
        userId,
      });

      // Update import record to failed
      if (importRecord?.importId) {
        try {
          await BulkImport.findOneAndUpdate(
            { importId: importRecord.importId },
            {
              $set: {
                status: "failed",
                errors: [
                  ...(importRecord.errors || []),
                  { row: 0, error: error.message || "Import failed" },
                ],
              },
            },
          );
        } catch (updateError: any) {
          logger.error("Failed to update import record status", {
            importId: importRecord.importId,
            error: updateError.message,
          });
        }
      }

      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Generate CSV template for lead import
   * If categories are provided, they will be pre-filled in the template (or columns removed)
   */
  static generateTemplate(
    primaryCategory?: string,
    secondaryCategory?: string,
  ): string {
    // Helper function to escape CSV values
    const escapeCSV = (value: string): string => {
      // If value contains comma, quote, or newline, wrap in quotes and escape quotes
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

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
      // 'Source Details',
      // 'Status'
    ];

    const exampleRow = [
      "John Doe",
      "9876543210",
      "john@example.com",
      "Delhi",
      "Delhi",
      "123 Main Street, Connaught Place",
      "110001",
      ...(includeCategoryColumns
        ? [primaryCategory || "handyperson", secondaryCategory || "Plumbing"]
        : []),
      "intermediate",
      "3",
      "Mon-Fri",
      "Morning",
      "referral",
      // 'Facebook Ad',
      // 'contacted'
    ];

    // Properly escape and quote values
    // Quote phone number (index 1) and pincode (index 6) to prevent Excel from converting to scientific notation
    const escapedHeaders = headers.map(escapeCSV).join(",");
    const escapedRow = exampleRow
      .map((val, idx) => {
        // Quote phone numbers and pincodes to prevent Excel auto-formatting
        // Adjust indices: phone is always index 1, pincode index depends on whether categories are included
        const phoneIndex = 1;
        const pincodeIndex = includeCategoryColumns ? 6 : 6; // Pincode is always 6th column (after name, phone, email, city, state, address)
        if (idx === phoneIndex || idx === pincodeIndex) {
          return `"${val}"`;
        }
        return escapeCSV(val);
      })
      .join(",");

    // Add note at the top if categories are pre-selected
    let csvContent = "";
    // if (primaryCategory && secondaryCategory) {
    //   csvContent += `# Template for ${primaryCategory} - ${secondaryCategory}\n`;
    //   csvContent += `# Categories are pre-selected and will be applied to all rows automatically\n`;
    //   csvContent += `# You don't need to include category columns in your CSV\n`;
    // }
    csvContent += `${escapedHeaders}\n${escapedRow}`;

    return csvContent;
  }

  /**
   * Get import history with filters
   * ✅ Efficient: Uses indexes and pagination
   * ✅ Concurrent-safe: Read-only queries
   */
  static async getImportHistory(filters?: {
    userId?: string; // Filter by specific user
    role?: "qualifier" | "onboarder" | "lead_access_manager"; // Filter by role
    createdByEmail?: string; // Filter by email
    createdByName?: string; // Search by name
    from?: Date; // Date range start
    to?: Date; // Date range end
    status?: "pending" | "processing" | "completed" | "failed"; // Filter by status
    page?: number;
    limit?: number;
  }): Promise<{
    imports: IBulkImport[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    // Build efficient query with indexes
    const query: any = {
      operationType: "create", // Only lead imports (not user imports)
    };

    // User filter
    if (filters?.userId) {
      query.createdBy = filters.userId;
    }

    // Role filter
    if (filters?.role) {
      query.createdByRole = filters.role;
    }

    // Email filter
    if (filters?.createdByEmail) {
      query.createdByEmail = filters.createdByEmail.toLowerCase();
    }

    // Name search (case-insensitive regex)
    if (filters?.createdByName) {
      query.createdByName = { $regex: filters.createdByName, $options: "i" };
    }

    // Date range
    if (filters?.from || filters?.to) {
      query.createdAt = {};
      if (filters.from) {
        query.createdAt.$gte = new Date(filters.from);
      }
      if (filters.to) {
        // Add 23:59:59 to include the entire end date
        const endDate = new Date(filters.to);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    // Status filter
    if (filters?.status) {
      query.status = filters.status;
    }

    // Execute queries in parallel for efficiency
    const [imports, total] = await Promise.all([
      BulkImport.find(query)
        .select(
          "importId fileName createdBy createdByName createdByEmail createdByRole totalRows successCount failedCount status createdAt completedAt",
        )
        .sort({ createdAt: -1 }) // Most recent first
        .skip(skip)
        .limit(limit)
        .lean(),
      BulkImport.countDocuments(query),
    ]);

    return {
      imports: imports as unknown as IBulkImport[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get import details
   */
  static async getImportDetails(importId: string): Promise<IBulkImport> {
    const importRecord = await BulkImport.findOne({ importId })
      .select(
        "importId fileName createdBy createdByName createdByEmail createdByRole totalRows successCount failedCount status operationType errors importedUserIds updatedUserIds deletedUserIds createdAt completedAt",
      )
      .lean();

    if (!importRecord) {
      throw new Error("Import not found");
    }

    return importRecord as unknown as IBulkImport;
  }
}
