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
exports.BulkLeadImportService = void 0;
const csv_parse_1 = require("csv-parse");
const stream_1 = require("stream");
const mongoose_1 = __importDefault(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const Lead_1 = __importDefault(require("../models/Lead"));
const BulkImport_1 = __importDefault(require("../models/BulkImport"));
const DuplicateCheckService_1 = require("./DuplicateCheckService");
const LeadService_1 = require("./LeadService");
const logger_1 = __importDefault(require("../config/logger"));
const uuid_1 = require("uuid");
const xlsx = __importStar(require("xlsx"));
const path_1 = __importDefault(require("path"));
class BulkLeadImportService {
    /**
     * Parse CSV file
     */
    /**
     * Map human-readable skill names to enum values
     */
    static mapSkillToEnum(skill) {
        const normalized = skill.toLowerCase().trim();
        // Map human-readable names to enum values
        const skillMap = {
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
            "water-tanker": "water-tanker",
            "water & tanker services": "water-tanker",
            "water and tanker services": "water-tanker",
            "water tanker": "water-tanker",
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
    static async parseCSV(fileBuffer, defaultPrimaryCategory, defaultSecondaryCategory, progressCallback) {
        return new Promise((resolve, reject) => {
            const parsedRows = [];
            let processedRowCount = 0;
            let totalRowCount = 0;
            // Create readable stream from buffer
            const csvStream = stream_1.Readable.from(fileBuffer.toString());
            // Create CSV parser with streaming
            const parser = (0, csv_parse_1.parse)({
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true,
                relax_quotes: true,
            });
            // Header indicators for filtering
            const headerIndicators = new Set([
                "full name",
                "phone number",
                "phone number (optional)",
                "landline number",
                "landline number (optional)",
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
            ].map((s) => s.toLowerCase()));
            // Process each row as it streams in
            parser.on("readable", () => {
                let record;
                while ((record = parser.read()) !== null) {
                    totalRowCount++;
                    // Normalize header keys by trimming whitespace
                    const normalizedRecord = {};
                    Object.keys(record).forEach((key) => {
                        const trimmedKey = key.trim();
                        normalizedRecord[trimmedKey] = record[key];
                    });
                    // Filter out invalid rows
                    const recordValues = Object.values(normalizedRecord).map((v) => v === undefined || v === null ? "" : String(v).trim());
                    // Skip empty rows
                    if (recordValues.every((v) => v === "")) {
                        continue;
                    }
                    // Skip comment rows
                    if (recordValues[0]?.startsWith("#")) {
                        continue;
                    }
                    // Skip header rows
                    const looksLikeHeaderRow = recordValues.some((v) => headerIndicators.has(String(v).toLowerCase()));
                    if (looksLikeHeaderRow) {
                        continue;
                    }
                    // Transform record to BulkLeadImportRow format
                    const rawPrimaryCategory = normalizedRecord.primaryCategory ||
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
                    const rawSecondaryCategory = normalizedRecord.secondaryCategory ||
                        normalizedRecord["Secondary Category"] ||
                        normalizedRecord.secondarySkill ||
                        normalizedRecord["Secondary Skill"] ||
                        defaultSecondaryCategory ||
                        "";
                    const experienceLevel = (normalizedRecord.experienceLevel ||
                        normalizedRecord["Experience Level"] ||
                        normalizedRecord["Experience Level (beginner/intermediate/experienced)"] ||
                        "").toLowerCase();
                    const validExperienceLevels = [
                        "beginner",
                        "intermediate",
                        "experienced",
                    ];
                    const mappedExperienceLevel = validExperienceLevels.includes(experienceLevel)
                        ? experienceLevel
                        : undefined;
                    const yearsOfExperience = normalizedRecord.yearsOfExperience ||
                        normalizedRecord["Years of Experience"] ||
                        normalizedRecord["Years Of Experience"]
                        ? parseInt(normalizedRecord.yearsOfExperience ||
                            normalizedRecord["Years of Experience"] ||
                            normalizedRecord["Years Of Experience"] ||
                            "0", 10)
                        : undefined;
                    const parsedRow = {
                        name: normalizedRecord.name || normalizedRecord["Full Name"] || "",
                        phone: normalizedRecord.phone ||
                            normalizedRecord["Phone Number"] ||
                            normalizedRecord["Phone Number (Optional)"] ||
                            normalizedRecord["Mobile Number"] ||
                            normalizedRecord["Phone"] ||
                            "",
                        landline: normalizedRecord.landline ||
                            normalizedRecord["Landline Number"] ||
                            normalizedRecord["Landline Number (Optional)"] ||
                            normalizedRecord["Landline"] ||
                            normalizedRecord["Tel"] ||
                            normalizedRecord["Telephone"] ||
                            "",
                        email: normalizedRecord.email || normalizedRecord["Email"] || "",
                        city: normalizedRecord.city ||
                            normalizedRecord["City"] ||
                            normalizedRecord["City / Area"] ||
                            normalizedRecord["City (optional)"] ||
                            "",
                        state: normalizedRecord.state ||
                            normalizedRecord["State"] ||
                            normalizedRecord["State (optional)"] ||
                            "",
                        address: normalizedRecord.address || normalizedRecord["Address"] || "",
                        pincode: normalizedRecord.pincode ||
                            normalizedRecord["Pincode"] ||
                            normalizedRecord["Pin Code"] ||
                            normalizedRecord["PIN"] ||
                            "",
                        primaryCategory: mappedPrimaryCategory,
                        primarySkill: mappedPrimaryCategory,
                        secondaryCategory: rawSecondaryCategory,
                        experienceLevel: mappedExperienceLevel,
                        yearsOfExperience: isNaN(yearsOfExperience)
                            ? undefined
                            : yearsOfExperience,
                        workingDays: normalizedRecord.workingDays ||
                            normalizedRecord["Working Days"] ||
                            "",
                        preferredTimeSlot: normalizedRecord.preferredTimeSlot ||
                            normalizedRecord["Preferred Time Slot"] ||
                            normalizedRecord["Preferred TimeSlot"] ||
                            "",
                        source: (() => {
                            const normalizedSource = (normalizedRecord.source ||
                                normalizedRecord["Source"] ||
                                "")
                                .toLowerCase()
                                .trim();
                            return normalizedSource
                                ? normalizedSource
                                : undefined;
                        })(),
                        sourceDetails: normalizedRecord.sourceDetails ||
                            normalizedRecord["Source Details"] ||
                            "",
                    };
                    parsedRows.push(parsedRow);
                    processedRowCount++;
                    // Report progress every 100 rows
                    if (progressCallback && processedRowCount % 100 === 0) {
                        const progressPercent = Math.min(95, Math.floor((processedRowCount / Math.max(totalRowCount, 1)) * 100));
                        progressCallback(progressPercent, `Parsed ${processedRowCount} rows...`);
                    }
                }
            });
            parser.on("error", (error) => {
                logger_1.default.error("CSV streaming parser error", { error: error.message });
                reject(new Error(`Failed to parse CSV: ${error.message}`));
            });
            parser.on("end", () => {
                logger_1.default.info("CSV parsing completed", {
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
    static async parseExcel(fileBuffer, defaultPrimaryCategory, defaultSecondaryCategory, progressCallback) {
        return new Promise((resolve, reject) => {
            try {
                if (progressCallback)
                    progressCallback(10, "Reading Excel file...");
                const workbook = xlsx.read(fileBuffer, { type: "buffer" });
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) {
                    throw new Error("Excel file is empty (no sheets found)");
                }
                const sheet = workbook.Sheets[sheetName];
                // Convert sheet to JSON with raw values
                const records = xlsx.utils.sheet_to_json(sheet, {
                    raw: false, // Convert all values to strings to match CSV behavior
                    defval: "", // Default value for empty cells
                });
                if (progressCallback)
                    progressCallback(40, `Found ${records.length} rows in Excel sheet. Processing...`);
                const parsedRows = [];
                let processedRowCount = 0;
                const totalRowCount = records.length;
                for (const record of records) {
                    // Normalize keys (trim whitespace)
                    const normalizedRecord = {};
                    Object.keys(record).forEach((key) => {
                        const trimmedKey = key.trim();
                        normalizedRecord[trimmedKey] = record[key];
                    });
                    // SKIP EMPTY ROWS
                    // Check if the row has any actual content
                    const hasContent = Object.values(normalizedRecord).some((val) => val !== null &&
                        val !== undefined &&
                        String(val).trim().length > 0);
                    if (!hasContent) {
                        continue;
                    }
                    processedRowCount++;
                    // Transform record to BulkLeadImportRow format
                    const rawPrimaryCategory = normalizedRecord.primaryCategory ||
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
                    const rawSecondaryCategory = normalizedRecord.secondaryCategory ||
                        normalizedRecord["Secondary Category"] ||
                        normalizedRecord.secondarySkill ||
                        normalizedRecord["Secondary Skill"] ||
                        defaultSecondaryCategory ||
                        "";
                    const experienceLevel = (normalizedRecord.experienceLevel ||
                        normalizedRecord["Experience Level"] ||
                        normalizedRecord["Experience Level (beginner/intermediate/experienced)"] ||
                        "").toLowerCase();
                    const validExperienceLevels = [
                        "beginner",
                        "intermediate",
                        "experienced",
                    ];
                    const mappedExperienceLevel = validExperienceLevels.includes(experienceLevel)
                        ? experienceLevel
                        : undefined;
                    const yearsOfExperience = normalizedRecord.yearsOfExperience ||
                        normalizedRecord["Years of Experience"] ||
                        normalizedRecord["Years Of Experience"]
                        ? parseInt(normalizedRecord.yearsOfExperience ||
                            normalizedRecord["Years of Experience"] ||
                            normalizedRecord["Years Of Experience"] ||
                            "0", 10)
                        : undefined;
                    const parsedRow = {
                        name: normalizedRecord.name || normalizedRecord["Full Name"] || "",
                        phone: normalizedRecord.phone ||
                            normalizedRecord["Phone Number"] ||
                            normalizedRecord["Phone Number (Optional)"] ||
                            normalizedRecord["Mobile Number"] ||
                            normalizedRecord["Phone"] ||
                            "",
                        landline: normalizedRecord.landline ||
                            normalizedRecord["Landline Number"] ||
                            normalizedRecord["Landline Number (Optional)"] ||
                            normalizedRecord["Landline"] ||
                            normalizedRecord["Tel"] ||
                            normalizedRecord["Telephone"] ||
                            "",
                        email: normalizedRecord.email || normalizedRecord["Email"] || "",
                        city: normalizedRecord.city ||
                            normalizedRecord["City"] ||
                            normalizedRecord["City / Area"] ||
                            normalizedRecord["City (optional)"] ||
                            "",
                        state: normalizedRecord.state ||
                            normalizedRecord["State"] ||
                            normalizedRecord["State (optional)"] ||
                            "",
                        address: normalizedRecord.address || normalizedRecord["Address"] || "",
                        pincode: normalizedRecord.pincode ||
                            normalizedRecord["Pincode"] ||
                            normalizedRecord["Pin Code"] ||
                            normalizedRecord["PIN"] ||
                            "",
                        primaryCategory: mappedPrimaryCategory,
                        primarySkill: mappedPrimaryCategory,
                        secondaryCategory: rawSecondaryCategory,
                        experienceLevel: mappedExperienceLevel,
                        yearsOfExperience: isNaN(yearsOfExperience)
                            ? undefined
                            : yearsOfExperience,
                        workingDays: normalizedRecord.workingDays ||
                            normalizedRecord["Working Days"] ||
                            "",
                        preferredTimeSlot: normalizedRecord.preferredTimeSlot ||
                            normalizedRecord["Preferred Time Slot"] ||
                            normalizedRecord["Preferred TimeSlot"] ||
                            "",
                        source: (() => {
                            const normalizedSource = (normalizedRecord.source ||
                                normalizedRecord["Source"] ||
                                "")
                                .toLowerCase()
                                .trim();
                            return normalizedSource
                                ? normalizedSource
                                : undefined;
                        })(),
                        sourceDetails: normalizedRecord.sourceDetails ||
                            normalizedRecord["Source Details"] ||
                            "",
                    };
                    parsedRows.push(parsedRow);
                }
                resolve(parsedRows);
            }
            catch (error) {
                logger_1.default.error("Excel parsing error", { error: error.message });
                reject(new Error(`Failed to parse Excel file: ${error.message}`));
            }
        });
    }
    /**
     * Parse file based on extension (CSV or Excel)
     */
    static async parseFile(fileBuffer, fileName, defaultPrimaryCategory, defaultSecondaryCategory, progressCallback) {
        const ext = path_1.default.extname(fileName).toLowerCase();
        if (ext === ".csv") {
            return this.parseCSV(fileBuffer, defaultPrimaryCategory, defaultSecondaryCategory, progressCallback);
        }
        else if (ext === ".xlsx" || ext === ".xls") {
            return this.parseExcel(fileBuffer, defaultPrimaryCategory, defaultSecondaryCategory, progressCallback);
        }
        else {
            throw new Error(`Unsupported file format: ${ext}. Please upload .csv, .xls, or .xlsx`);
        }
    }
    /**
     * Validate import row
     * @param row - The row to validate
     * @param rowNumber - Row number for error reporting
     * @param defaultPrimaryCategory - Default primary category if not in CSV
     * @param defaultSecondaryCategory - Default secondary category if not in CSV
     */
    static validateRow(row, rowNumber, defaultPrimaryCategory, defaultSecondaryCategory) {
        if (!row.name || row.name.trim().length < 2) {
            return {
                valid: false,
                error: "Name is required and must be at least 2 characters",
            };
        }
        // Validate at least one contact number (phone or landline) is provided
        const phone = row.phone?.trim() || "";
        const landline = row.landline?.trim() || "";
        if (!phone && !landline) {
            return {
                valid: false,
                error: "At least one contact number (Phone or Landline) is required",
            };
        }
        // Validate phone if provided
        if (phone) {
            const phoneDigits = phone.replace(/\D/g, ""); // Remove all non-digits
            const last10Digits = phoneDigits.slice(-10); // Get last 10 digits
            if (!/^[6-9]\d{9}$/.test(last10Digits)) {
                return {
                    valid: false,
                    error: "Invalid phone number (10 digits, starting with 6-9). Can be +91-XXXXXXXXXX or just XXXXXXXXXX",
                };
            }
        }
        // Validate landline if provided
        if (landline) {
            const landlineDigits = landline.replace(/\D/g, ""); // Remove all non-digits
            if (landlineDigits.length < 6 || landlineDigits.length > 15) {
                return {
                    valid: false,
                    error: "Invalid landline number (6-15 digits required)",
                };
            }
        }
        // Categories are optional.
        const primaryCategory = (row.primaryCategory ||
            row.primarySkill ||
            defaultPrimaryCategory ||
            "").trim();
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
            "water-tanker",
            "other",
        ];
        const normalizedCategory = primaryCategory.toLowerCase().trim();
        if (normalizedCategory && !validCategories.includes(normalizedCategory)) {
            return {
                valid: false,
                error: `Invalid primary category. Must be one of: ${validCategories.join(", ")}`,
            };
        }
        // Secondary category is optional.
        const validExperienceLevels = ["beginner", "intermediate", "experienced"];
        if (row.experienceLevel &&
            !validExperienceLevels.includes(row.experienceLevel.toLowerCase())) {
            return {
                valid: false,
                error: `Invalid experience level. Must be one of: ${validExperienceLevels.join(", ")}`,
            };
        }
        if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
            return { valid: false, error: "Invalid email format" };
        }
        const validSources = [
            "referral",
            "campaign",
            "walk-in",
            "agent",
            "other",
        ];
        if (row.source && !validSources.includes(row.source)) {
            return {
                valid: false,
                error: `Invalid source. Must be one of: ${validSources.join(", ")}`,
            };
        }
        // const allowedStatuses: LeadStatus[] = ['lead_added', 'contacted_not_interested', 'contacted_interested'];
        // if (row.status && !allowedStatuses.includes(row.status as LeadStatus)) {
        //   return { valid: false, error: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` };
        // }
        return { valid: true };
    }
    /**
     * Preview bulk import (validation + duplicate check, no records created)
     */
    static async previewBulkImport(fileBuffer, fileName, defaultPrimaryCategory, defaultSecondaryCategory) {
        // 1. Parse File (CSV or Excel)
        const rows = await this.parseFile(fileBuffer, fileName, defaultPrimaryCategory, defaultSecondaryCategory);
        // 2. Bulk duplicate check against database (with categories) - Check both phones and landlines
        const allPhones = rows.map((r) => r.phone).filter((p) => Boolean(p));
        const allLandlines = rows.map((r) => r.landline).filter((l) => Boolean(l));
        const allContacts = [...allPhones, ...allLandlines];
        logger_1.default.info(`[Preview] Performing bulk duplicate check for ${allPhones.length} phone numbers and ${allLandlines.length} landline numbers`);
        const existingLeadsByPhoneMap = await DuplicateCheckService_1.DuplicateCheckService.checkPhonesBulkWithCategories(allContacts);
        logger_1.default.info(`[Preview] Duplicate check completed. Found ${existingLeadsByPhoneMap.size} contacts with existing leads`);
        // 3. Track in-file duplicates (both phone and landline)
        const seenPhonesInFile = new Set();
        const seenLandlinesInFile = new Set();
        // 4. Build preview rows
        const previewRows = rows.map((row, index) => {
            const rowNumber = index + 2; // +2 for header row and 0-index
            const normalizedPhone = row.phone
                ? DuplicateCheckService_1.DuplicateCheckService.normalizePhone(row.phone)
                : "";
            const normalizedLandline = row.landline
                ? DuplicateCheckService_1.DuplicateCheckService.normalizeLandline(row.landline)
                : "";
            // Check in-file duplicate (both phone and landline)
            const isDuplicateInFilePhone = normalizedPhone !== "" && seenPhonesInFile.has(normalizedPhone);
            const isDuplicateInFileLandline = normalizedLandline !== "" && seenLandlinesInFile.has(normalizedLandline);
            const isDuplicateInFile = isDuplicateInFilePhone || isDuplicateInFileLandline;
            if (!isDuplicateInFilePhone && normalizedPhone) {
                seenPhonesInFile.add(normalizedPhone);
            }
            if (!isDuplicateInFileLandline && normalizedLandline) {
                seenLandlinesInFile.add(normalizedLandline);
            }
            // Check database duplicate - consider categories (check both phone and landline)
            const primaryCategory = row.primaryCategory || row.primarySkill || defaultPrimaryCategory || '';
            const secondaryCategory = row.secondaryCategory || defaultSecondaryCategory || '';
            let existingLead = undefined;
            let isDuplicateInDb = false;
            let isDifferentCategory = false;
            // Check both phone and landline in the existing leads map
            const existingLeadsByPhone = normalizedPhone
                ? existingLeadsByPhoneMap.get(normalizedPhone) || []
                : [];
            const existingLeadsByLandline = normalizedLandline
                ? existingLeadsByPhoneMap.get(normalizedLandline) || []
                : [];
            // Combine and deduplicate leads
            const existingLeadsMap = new Map();
            [...existingLeadsByPhone, ...existingLeadsByLandline].forEach(lead => {
                existingLeadsMap.set(lead.leadId, lead);
            });
            const existingLeads = Array.from(existingLeadsMap.values());
            if (existingLeads.length > 0) {
                if (!primaryCategory.trim()) {
                    // If no category is provided, treat any existing contact as duplicate.
                    existingLead = existingLeads[0];
                    isDuplicateInDb = true;
                    isDifferentCategory = false;
                }
                else {
                    // Check if any existing lead has the same category
                    const sameCategoryLead = existingLeads.find((lead) => {
                        const leadPrimary = lead.primaryCategory || lead.primarySkill || '';
                        const leadSecondary = lead.secondaryCategory || lead.secondarySkill || '';
                        return leadPrimary === primaryCategory &&
                            (leadSecondary === secondaryCategory || (!leadSecondary && !secondaryCategory));
                    });
                    if (sameCategoryLead) {
                        // Exact duplicate - same contact and same category
                        existingLead = sameCategoryLead;
                        isDuplicateInDb = true;
                        isDifferentCategory = false;
                    }
                    else {
                        // Same contact but different category - this is allowed
                        existingLead = existingLeads[0]; // Use first one for reference
                        isDuplicateInDb = false;
                        isDifferentCategory = true;
                    }
                }
            }
            // Validate row (pass default categories for validation)
            const validation = this.validateRow(row, rowNumber, defaultPrimaryCategory, defaultSecondaryCategory);
            const rowErrors = [];
            if (!validation.valid && validation.error) {
                rowErrors.push(validation.error);
            }
            // Add duplicate errors (only for actual duplicates, not different categories)
            if (isDuplicateInFilePhone) {
                rowErrors.push("This phone number appears multiple times in your file");
            }
            if (isDuplicateInFileLandline) {
                rowErrors.push("This landline number appears multiple times in your file");
            }
            if (isDuplicateInDb && existingLead) {
                rowErrors.push(`This person with this category already exists (Lead ID: ${existingLead.leadId})`);
            }
            // Note: isDifferentCategory case doesn't add an error - it's allowed
            return {
                rowNumber,
                name: row.name || "Unknown",
                phone: row.phone || "",
                landline: row.landline || "",
                email: row.email,
                city: row.city || "Unknown",
                state: row.state || "",
                primaryCategory: primaryCategory || '',
                secondaryCategory: secondaryCategory || "",
                experienceLevel: row.experienceLevel,
                status: (rowErrors.length === 0
                    ? (isDifferentCategory ? "warning" : "valid")
                    : "invalid"),
                errors: rowErrors,
                isDuplicateInFile: isDuplicateInFilePhone || isDuplicateInFileLandline,
                isDuplicateInDb,
                isDifferentCategory, // New field
                duplicateLeadId: existingLead?.leadId,
                existingPrimaryCategory: isDifferentCategory && existingLead ? (existingLead.primaryCategory || existingLead.primarySkill || '') : undefined,
                existingSecondaryCategory: isDifferentCategory && existingLead ? (existingLead.secondaryCategory || existingLead.secondarySkill || '') : undefined,
            };
        });
        // 5. Build summary
        const summary = {
            total: previewRows.length,
            valid: previewRows.filter((r) => r.status === "valid").length,
            invalid: previewRows.filter((r) => r.status === "invalid").length,
            duplicatesInFile: previewRows.filter((r) => r.isDuplicateInFile).length,
            duplicatesInDb: previewRows.filter((r) => r.isDuplicateInDb).length,
            differentCategory: previewRows.filter((r) => r.isDifferentCategory).length,
        };
        logger_1.default.info("Bulk lead import preview completed", {
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
    static async bulkImportLeads(fileBuffer, fileName, userId, // Changed from adminUid to userId (works for any role)
    adminName, adminEmail, adminRole, source, defaultPrimaryCategory, defaultSecondaryCategory, progressCallback) {
        const session = await mongoose_1.default.startSession();
        session.startTransaction();
        let importRecord = null;
        try {
            // STEP 1: Calculate file hash for idempotency
            const fileHash = crypto_1.default
                .createHash("sha256")
                .update(fileBuffer)
                .digest("hex");
            // STEP 2: Check if this file was already uploaded by this user (idempotency)
            const existingImport = await BulkImport_1.default.findOne({
                fileHash,
                createdBy: userId,
            })
                .session(session)
                .lean();
            if (existingImport && existingImport.status === "completed") {
                // ✅ Check if all leads from previous import are inactive/deleted
                // If so, allow re-import
                if (existingImport.importedUserIds &&
                    existingImport.importedUserIds.length > 0) {
                    const activeLeadsCount = await Lead_1.default.countDocuments({
                        leadId: { $in: existingImport.importedUserIds },
                        status: { $nin: ["inactive"] }, // Count only active leads
                    }).session(session);
                    if (activeLeadsCount === 0) {
                        // All leads from previous import are inactive/deleted - allow re-import
                        logger_1.default.info("Previous import leads are all inactive - allowing re-import", {
                            previousImportId: existingImport.importId,
                            fileHash: fileHash.substring(0, 16) + "...",
                            userId,
                            previousLeadCount: existingImport.importedUserIds.length,
                        });
                        // Continue with new import (don't return existing result)
                    }
                    else {
                        // Some leads are still active - return existing result (idempotent)
                        await session.commitTransaction();
                        logger_1.default.info("Idempotent import: returning existing result", {
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
                            errors: (existingImport.errors || []),
                            importedLeadIds: existingImport.importedUserIds || [],
                        };
                    }
                }
                else {
                    // No leads were imported previously - return existing result
                    await session.commitTransaction();
                    logger_1.default.info("Idempotent import: returning existing result (no leads imported)", {
                        importId: existingImport.importId,
                        fileHash: fileHash.substring(0, 16) + "...",
                        userId,
                    });
                    return {
                        importId: existingImport.importId,
                        totalRows: existingImport.totalRows,
                        successCount: existingImport.successCount,
                        failedCount: existingImport.failedCount,
                        errors: (existingImport.errors || []),
                        importedLeadIds: existingImport.importedUserIds || [],
                    };
                }
            }
            // STEP 3: Parse file (CSV or Excel) with streaming
            if (progressCallback) {
                progressCallback(10, `Reading and parsing ${path_1.default.extname(fileName)} file...`);
            }
            const rows = await this.parseFile(fileBuffer, fileName, defaultPrimaryCategory, defaultSecondaryCategory, (progress, message) => {
                // Map parsing progress (10-30% of total)
                const mappedProgress = 10 + Math.floor((progress / 100) * 20);
                if (progressCallback) {
                    progressCallback(mappedProgress, message);
                }
            });
            if (progressCallback) {
                progressCallback(30, `Parsed ${rows.length} rows. Validating data...`);
            }
            // STEP 4: Create or get import record atomically (prevent duplicate processing)
            const importId = `IMPORT-${Date.now()}-${(0, uuid_1.v4)().substring(0, 8).toUpperCase()}`;
            // ✅ If previous import exists and all leads are inactive, delete it first to allow re-import
            if (existingImport && existingImport.status === "completed") {
                const activeLeadsCount = await Lead_1.default.countDocuments({
                    leadId: { $in: existingImport.importedUserIds || [] },
                    status: { $nin: ["inactive"] },
                }).session(session);
                if (activeLeadsCount === 0) {
                    // Delete the old import record to allow new one
                    await BulkImport_1.default.deleteOne({
                        importId: existingImport.importId,
                    }).session(session);
                    logger_1.default.info("Deleted previous import record to allow re-import", {
                        previousImportId: existingImport.importId,
                        userId,
                    });
                }
            }
            const importRecordResult = await BulkImport_1.default.findOneAndUpdate({
                fileHash,
                createdBy: userId,
                status: { $ne: "processing" }, // Only if not already processing
            }, {
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
            }, {
                upsert: true,
                new: true,
                session,
            });
            importRecord = importRecordResult;
            // If record was already processing, wait a bit and check again
            if (!importRecordResult || importRecordResult.status === "processing") {
                const checkAgain = await BulkImport_1.default.findOne({
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
                        errors: (checkAgain.errors || []),
                        importedLeadIds: checkAgain.importedUserIds || [],
                    };
                }
            }
            const errors = [];
            // STEP 5: Bulk duplicate check - Check ALL phones and landlines at once (single MongoDB query)
            if (progressCallback) {
                progressCallback(40, "Checking for duplicate leads in database...");
            }
            const allPhones = rows.map((r) => r.phone).filter((p) => Boolean(p));
            const allLandlines = rows.map((r) => r.landline).filter((l) => Boolean(l));
            const allContacts = [...allPhones, ...allLandlines];
            const existingLeadsByPhoneMap = await DuplicateCheckService_1.DuplicateCheckService.checkPhonesBulkWithCategories(allContacts);
            logger_1.default.info("Performing bulk duplicate check with categories", {
                importId,
                phoneCount: allPhones.length,
                landlineCount: allLandlines.length,
                totalContacts: allContacts.length,
                userId,
            });
            if (progressCallback) {
                progressCallback(50, "Processing and validating rows...");
            }
            // STEP 6: Track in-file duplicates and prepare bulk insert documents
            const seenPhonesInFile = new Set();
            const seenLandlinesInFile = new Set();
            const leadsToInsert = [];
            const leadsToUpdate = [];
            const normalizedPhones = [];
            const totalRowsToProcess = rows.length;
            for (let i = 0; i < rows.length; i++) {
                // Update progress during row processing (50-70% of total)
                if (progressCallback && i > 0 && i % 50 === 0) {
                    const rowProgress = 50 + Math.floor((i / totalRowsToProcess) * 20);
                    progressCallback(rowProgress, `Processing row ${i + 1} of ${totalRowsToProcess}...`);
                }
                const row = rows[i];
                const rowNumber = i + 2; // +2 because CSV has header and 0-indexed
                // Validate row
                const validation = this.validateRow(row, rowNumber, defaultPrimaryCategory, defaultSecondaryCategory);
                if (!validation.valid) {
                    errors.push({
                        row: rowNumber,
                        phone: row.phone,
                        error: validation.error || "Validation failed",
                    });
                    continue;
                }
                // Normalize phone and landline
                const normalizedPhone = row.phone ? DuplicateCheckService_1.DuplicateCheckService.normalizePhone(row.phone) : null;
                const normalizedLandline = row.landline ? DuplicateCheckService_1.DuplicateCheckService.normalizeLandline(row.landline) : null;
                // Check for duplicate within this file (check both phone and landline)
                if (normalizedPhone && seenPhonesInFile.has(normalizedPhone)) {
                    errors.push({
                        row: rowNumber,
                        phone: row.phone || row.landline || '',
                        error: "This phone number appears multiple times in your file",
                    });
                    continue;
                }
                if (normalizedLandline && seenLandlinesInFile.has(normalizedLandline)) {
                    errors.push({
                        row: rowNumber,
                        phone: row.phone || row.landline || '',
                        error: "This landline number appears multiple times in your file",
                    });
                    continue;
                }
                if (normalizedPhone)
                    seenPhonesInFile.add(normalizedPhone);
                if (normalizedLandline)
                    seenLandlinesInFile.add(normalizedLandline);
                // Check for duplicate in database - consider categories
                const primaryCategory = row.primaryCategory || row.primarySkill || defaultPrimaryCategory || '';
                const secondaryCategory = row.secondaryCategory || defaultSecondaryCategory || '';
                // Check both phone and landline in the existing leads map
                const existingLeadsByPhone = normalizedPhone
                    ? existingLeadsByPhoneMap.get(normalizedPhone) || []
                    : [];
                const existingLeadsByLandline = normalizedLandline
                    ? existingLeadsByPhoneMap.get(normalizedLandline) || []
                    : [];
                // Combine and deduplicate leads
                const existingLeadsMap = new Map();
                [...existingLeadsByPhone, ...existingLeadsByLandline].forEach(lead => {
                    existingLeadsMap.set(lead.leadId, lead);
                });
                const existingLeads = Array.from(existingLeadsMap.values());
                if (!primaryCategory.trim() && existingLeads.length > 0) {
                    errors.push({
                        row: rowNumber,
                        phone: row.phone || row.landline || '',
                        error: `This person already exists (Lead ID: ${existingLeads[0].leadId})`,
                    });
                    continue;
                }
                // Check if any existing lead has the same category
                const sameCategoryLead = existingLeads.find((lead) => {
                    const leadPrimary = lead.primaryCategory || lead.primarySkill || '';
                    const leadSecondary = lead.secondaryCategory || lead.secondarySkill || '';
                    return leadPrimary === primaryCategory &&
                        (leadSecondary === secondaryCategory || (!leadSecondary && !secondaryCategory));
                });
                if (sameCategoryLead) {
                    // Exact duplicate - same contact (phone or landline) and same category
                    errors.push({
                        row: rowNumber,
                        phone: row.phone || row.landline || '',
                        error: `This person with this category already exists (Lead ID: ${sameCategoryLead.leadId})`,
                    });
                    continue;
                }
                // Map primary skill category to human-readable name (same as LeadService)
                const primarySkillCategory = (row.primaryCategory ||
                    row.primarySkill ||
                    defaultPrimaryCategory ||
                    "").trim();
                const primarySkillNameMap = {
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
                const effectivePrimarySkillCategory = primarySkillCategory || undefined;
                const primarySkillName = effectivePrimarySkillCategory
                    ? (primarySkillNameMap[effectivePrimarySkillCategory] || effectivePrimarySkillCategory)
                    : undefined;
                // Check if lead exists with different category - add skill to existing lead
                if (existingLeads.length > 0 && effectivePrimarySkillCategory && primarySkillName) {
                    const existingLead = existingLeads[0]; // Use first existing lead
                    // Normalize categories for comparison (case-insensitive, trim whitespace)
                    const normalizedNewCategory = primarySkillCategory.toLowerCase().trim();
                    const normalizedNewName = primarySkillName.toLowerCase().trim();
                    // Check if this skill already exists in the lead's skills array
                    // Compare both category and name (case-insensitive)
                    const skillAlreadyExists = existingLead.skills?.some((skill) => {
                        const existingCategory = (skill.category || '').toLowerCase().trim();
                        const existingName = (skill.name || '').toLowerCase().trim();
                        return existingCategory === normalizedNewCategory ||
                            existingName === normalizedNewName ||
                            existingCategory === normalizedNewName ||
                            existingName === normalizedNewCategory;
                    });
                    if (!skillAlreadyExists) {
                        // Use experience level from CSV directly (supports beginner, intermediate, experienced)
                        const experienceLevel = row.experienceLevel;
                        logger_1.default.info("Adding new skill to existing lead", {
                            leadId: existingLead.leadId,
                            phone: normalizedPhone,
                            existingCategory: existingLead.primaryCategory || existingLead.primarySkill,
                            newCategory: primarySkillCategory,
                            existingSkillsCount: existingLead.skills?.length || 0,
                            userId
                        });
                        // Add new skill to existing lead
                        leadsToUpdate.push({
                            leadId: existingLead.leadId,
                            existingLead: existingLead,
                            newSkill: {
                                name: primarySkillName,
                                category: effectivePrimarySkillCategory,
                                ...(experienceLevel
                                    ? {
                                        level: experienceLevel,
                                    }
                                    : {}),
                                toolsAvailable: false,
                                assignedBy: userId,
                                assignedAt: new Date(),
                            },
                        });
                        continue; // Skip creating new lead
                    }
                    else {
                        // Skill already exists, skip
                        logger_1.default.info("Skill already exists for lead, skipping", {
                            leadId: existingLead.leadId,
                            phone: normalizedPhone || normalizedLandline || '',
                            category: primarySkillCategory,
                            userId
                        });
                        errors.push({
                            row: rowNumber,
                            phone: row.phone || row.landline || '',
                            error: `This skill already exists for this lead (Lead ID: ${existingLead.leadId})`,
                        });
                        continue;
                    }
                }
                // No existing lead - create new one
                // Use provided source or row source
                const leadSource = source || row.source;
                // Prepare lead document for bulk insert
                const leadId = LeadService_1.LeadService.generateLeadId();
                // Track normalized contacts for logging (use phone if available, otherwise landline)
                if (normalizedPhone) {
                    normalizedPhones.push(normalizedPhone);
                }
                else if (normalizedLandline) {
                    normalizedPhones.push(normalizedLandline);
                }
                leadsToInsert.push({
                    leadId,
                    name: row.name.trim(),
                    phone: normalizedPhone || undefined,
                    landline: normalizedLandline || undefined,
                    email: row.email?.trim(),
                    city: row.city?.trim() || "",
                    state: row.state?.trim() || "",
                    address: row.address?.trim() || "",
                    pincode: row.pincode?.trim() || undefined,
                    primaryCategory: effectivePrimarySkillCategory,
                    primarySkill: effectivePrimarySkillCategory, // Legacy field
                    secondaryCategory: row.secondaryCategory?.trim() || "",
                    secondarySkill: row.secondaryCategory?.trim() || "", // Legacy field
                    experienceLevel: row.experienceLevel,
                    workingDays: row.workingDays?.trim(),
                    preferredTimeSlot: row.preferredTimeSlot?.trim() || undefined,
                    source: leadSource,
                    sourceDetails: row.sourceDetails?.trim() ||
                        (leadSource && leadSource !== row.source
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
                    skills: effectivePrimarySkillCategory && primarySkillName
                        ? [
                            {
                                name: primarySkillName,
                                category: effectivePrimarySkillCategory,
                                ...(row.experienceLevel
                                    ? {
                                        level: row.experienceLevel,
                                    }
                                    : {}),
                                toolsAvailable: false,
                                assignedBy: userId,
                                assignedAt: new Date(),
                            },
                        ]
                        : [],
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
                progressCallback(70, `Preparing to insert ${leadsToInsert.length} leads into database...`);
            }
            let importedLeadIds = [];
            if (leadsToInsert.length > 0) {
                // Log before insertion for debugging
                logger_1.default.info("Preparing to insert leads", {
                    importId,
                    count: leadsToInsert.length,
                    sampleLeadIds: leadsToInsert.slice(0, 3).map((l) => l.leadId),
                    userId,
                });
                try {
                    // Use insertMany with ordered: false to continue on errors
                    const insertResult = await Lead_1.default.insertMany(leadsToInsert, {
                        ordered: false, // Continue on error, don't stop
                        session,
                    });
                    logger_1.default.info("insertMany completed", {
                        importId,
                        resultCount: insertResult.length,
                        resultType: Array.isArray(insertResult)
                            ? "array"
                            : typeof insertResult,
                        sampleResult: insertResult.length > 0
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
                        .map((lead) => {
                        // Try multiple ways to access leadId (Mongoose document can be accessed differently)
                        const leadId = lead.leadId ||
                            (lead.toObject && lead.toObject().leadId) ||
                            lead._doc?.leadId;
                        if (!leadId) {
                            logger_1.default.error("Lead ID not found in insert result", {
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
                        logger_1.default.warn("Failed to extract leadIds from insertResult, using original data", {
                            importId,
                            insertResultLength: insertResult.length,
                            leadsToInsertLength: leadsToInsert.length,
                        });
                        importedLeadIds = leadsToInsert
                            .map((lead) => lead.leadId)
                            .filter(Boolean);
                    }
                    if (progressCallback) {
                        progressCallback(90, `Successfully inserted ${importedLeadIds.length} leads. Finalizing...`);
                    }
                    logger_1.default.info("Bulk insert completed", {
                        importId,
                        attempted: leadsToInsert.length,
                        successful: importedLeadIds.length,
                        importedLeadIds: importedLeadIds.slice(0, 5), // Log first 5 for debugging
                        userId,
                    });
                    // Handle partial failures (some may fail due to race conditions)
                    if (insertResult.length < leadsToInsert.length) {
                        const failedCount = leadsToInsert.length - insertResult.length;
                        logger_1.default.warn("Some leads failed to insert (likely race conditions)", {
                            importId,
                            failed: failedCount,
                            userId,
                        });
                    }
                }
                catch (bulkError) {
                    // Bulk insert may have partial success
                    if (bulkError.writeErrors) {
                        // Extract successfully inserted leads
                        const insertedLeadIds = leadsToInsert
                            .filter((_, index) => {
                            // Check if this index had an error
                            return !bulkError.writeErrors.some((err) => err.index === index);
                        })
                            .map((lead) => lead.leadId);
                        importedLeadIds = insertedLeadIds;
                        // Add write errors to errors array
                        bulkError.writeErrors.forEach((err) => {
                            const rowIndex = err.index;
                            const row = rows[rowIndex];
                            errors.push({
                                row: rowIndex + 2,
                                phone: row?.phone,
                                error: err.errmsg || "Failed to insert lead",
                            });
                        });
                        logger_1.default.warn("Bulk insert had partial failures", {
                            importId,
                            successful: importedLeadIds.length,
                            failed: bulkError.writeErrors.length,
                            userId,
                        });
                    }
                    else {
                        throw bulkError;
                    }
                }
            }
            // STEP 7.5: Update existing leads with new skills (different category)
            let updatedLeadIds = [];
            if (leadsToUpdate.length > 0) {
                if (progressCallback) {
                    progressCallback(85, `Updating ${leadsToUpdate.length} existing leads with new skills...`);
                }
                logger_1.default.info("Updating existing leads with new skills", {
                    importId,
                    count: leadsToUpdate.length,
                    userId,
                });
                // OPTIMIZATION: Batch fetch all leads in a single query instead of O(n) queries
                const leadIdsToUpdate = leadsToUpdate.map(u => u.leadId);
                const existingLeadsMap = new Map();
                // Single query to fetch all leads that need updating
                const existingLeads = await Lead_1.default.find({
                    leadId: { $in: leadIdsToUpdate }
                })
                    .select('leadId skills primaryCategory primarySkill')
                    .lean()
                    .session(session);
                // Create a map for O(1) lookup
                existingLeads.forEach(lead => {
                    existingLeadsMap.set(lead.leadId, lead);
                });
                // Prepare bulk write operations
                const bulkWriteOps = [];
                const leadsToLogActivity = [];
                for (const updateData of leadsToUpdate) {
                    try {
                        const existingLead = existingLeadsMap.get(updateData.leadId);
                        if (existingLead) {
                            // Normalize categories for comparison (case-insensitive, trim whitespace)
                            const normalizedNewCategory = (updateData.newSkill.category || '').toLowerCase().trim();
                            const normalizedNewName = (updateData.newSkill.name || '').toLowerCase().trim();
                            // Check if this skill already exists in the lead's skills array
                            const skillExists = existingLead.skills?.some((skill) => {
                                const existingCategory = (skill.category || '').toLowerCase().trim();
                                const existingName = (skill.name || '').toLowerCase().trim();
                                const matches = existingCategory === normalizedNewCategory ||
                                    existingName === normalizedNewName ||
                                    existingCategory === normalizedNewName ||
                                    existingName === normalizedNewCategory;
                                if (matches) {
                                    logger_1.default.info("Skill match found", {
                                        importId,
                                        leadId: updateData.leadId,
                                        existingCategory,
                                        existingName,
                                        newCategory: normalizedNewCategory,
                                        newName: normalizedNewName,
                                        userId
                                    });
                                }
                                return matches;
                            });
                            if (!skillExists) {
                                logger_1.default.info("Preparing to add skill to existing lead", {
                                    importId,
                                    leadId: updateData.leadId,
                                    phone: updateData.existingLead.phone,
                                    newSkill: updateData.newSkill,
                                    existingSkills: existingLead.skills?.map((s) => ({
                                        name: s.name,
                                        category: s.category
                                    })) || [],
                                    existingSkillsCount: existingLead.skills?.length || 0,
                                    userId
                                });
                                // Add update operation to bulk write array
                                // Ensure skills array exists and add the new skill
                                // Handle cases where skills might be null/undefined or not an array
                                const existingSkills = existingLead.skills && Array.isArray(existingLead.skills)
                                    ? existingLead.skills
                                    : [];
                                // Add the new skill to the array
                                const updatedSkills = [...existingSkills, updateData.newSkill];
                                bulkWriteOps.push({
                                    updateOne: {
                                        filter: { leadId: updateData.leadId },
                                        update: {
                                            $set: {
                                                skills: updatedSkills,
                                                updatedAt: new Date(),
                                            },
                                        },
                                    },
                                });
                                leadsToLogActivity.push({
                                    leadId: updateData.leadId,
                                    skill: updateData.newSkill
                                });
                            }
                            else {
                                logger_1.default.info("Skill already exists, skipping", {
                                    importId,
                                    leadId: updateData.leadId,
                                    skillCategory: updateData.newSkill.category,
                                    userId
                                });
                            }
                        }
                        else {
                            logger_1.default.warn("Lead not found for skill update", {
                                importId,
                                leadId: updateData.leadId,
                                userId
                            });
                        }
                    }
                    catch (updateError) {
                        logger_1.default.error("Failed to prepare skill update", {
                            importId,
                            leadId: updateData.leadId,
                            error: updateError.message,
                            stack: updateError.stack,
                            userId,
                        });
                        errors.push({
                            row: 0,
                            phone: updateData.existingLead.phone,
                            error: `Failed to add skill to existing lead: ${updateError.message}`,
                        });
                    }
                }
                // Execute all updates in a single bulk write operation
                if (bulkWriteOps.length > 0) {
                    try {
                        const bulkWriteResult = await Lead_1.default.bulkWrite(bulkWriteOps, {
                            session,
                            ordered: false // Continue on errors
                        });
                        // Type assertion for writeErrors (exists at runtime but not in type definition)
                        const writeErrors = bulkWriteResult.writeErrors;
                        logger_1.default.info("Bulk write completed for skill updates", {
                            importId,
                            attempted: bulkWriteOps.length,
                            modified: bulkWriteResult.modifiedCount,
                            matched: bulkWriteResult.matchedCount,
                            userId,
                            writeErrors: writeErrors?.length || 0
                        });
                        // Handle write errors if any
                        if (writeErrors && writeErrors.length > 0) {
                            logger_1.default.error("Some skill updates failed in bulk write", {
                                importId,
                                failedCount: writeErrors.length,
                                errors: writeErrors.map((err) => ({
                                    index: err.index,
                                    code: err.code,
                                    message: err.errmsg
                                })),
                                userId
                            });
                        }
                        // Extract successfully updated lead IDs - match by index
                        // Only include leads whose operations didn't have errors
                        const failedIndices = new Set();
                        if (writeErrors) {
                            writeErrors.forEach((err) => {
                                failedIndices.add(err.index);
                            });
                        }
                        // Get all successful lead IDs (those not in failedIndices)
                        updatedLeadIds = leadsToLogActivity
                            .filter((_, index) => !failedIndices.has(index))
                            .map(item => item.leadId);
                        // Log activities for all successfully updated leads (in parallel)
                        if (updatedLeadIds.length > 0) {
                            await Promise.all(leadsToLogActivity
                                .filter((_, index) => !failedIndices.has(index))
                                .map(item => LeadService_1.LeadService.logActivity(item.leadId, 'skill_added', `New skill added via bulk import: ${item.skill.name} (${item.skill.category})`, userId, adminName).catch(err => {
                                logger_1.default.error("Failed to log activity", {
                                    importId,
                                    leadId: item.leadId,
                                    error: err.message,
                                    userId
                                });
                            })));
                        }
                        logger_1.default.info("Successfully updated leads with new skills", {
                            importId,
                            updatedCount: updatedLeadIds.length,
                            attempted: bulkWriteOps.length,
                            failed: failedIndices.size,
                            userId
                        });
                    }
                    catch (bulkWriteError) {
                        logger_1.default.error("Bulk write failed for skill updates", {
                            importId,
                            error: bulkWriteError.message,
                            stack: bulkWriteError.stack,
                            userId,
                        });
                        // Add errors for all failed updates
                        leadsToUpdate.forEach(updateData => {
                            errors.push({
                                row: 0,
                                phone: updateData.existingLead.phone,
                                error: `Failed to add skill to existing lead: ${bulkWriteError.message}`,
                            });
                        });
                    }
                }
                logger_1.default.info("Completed updating existing leads with new skills", {
                    importId,
                    attempted: leadsToUpdate.length,
                    successful: updatedLeadIds.length,
                    userId,
                });
            }
            // STEP 8: Update import record atomically
            if (progressCallback) {
                progressCallback(95, "Saving import results...");
            }
            const finalStatus = errors.length === rows.length ? "failed" : "completed";
            // Total success count includes both new leads and updated leads
            const totalSuccessCount = importedLeadIds.length + updatedLeadIds.length;
            await BulkImport_1.default.findOneAndUpdate({ importId }, {
                $set: {
                    successCount: totalSuccessCount,
                    failedCount: errors.length + (leadsToInsert.length - importedLeadIds.length),
                    status: finalStatus,
                    importedUserIds: [...importedLeadIds, ...updatedLeadIds],
                    errors: errors,
                    completedAt: new Date(),
                },
            }, { session });
            await session.commitTransaction();
            logger_1.default.info("Transaction committed successfully", {
                importId,
                importedLeadIdsCount: importedLeadIds.length,
                importedLeadIds: importedLeadIds.slice(0, 3),
            });
            if (progressCallback) {
                progressCallback(100, `Import completed! ${importedLeadIds.length} new leads created, ${updatedLeadIds.length} existing leads updated with new skills.`);
            }
            // End session after commit
            await session.endSession();
            // Verify leads were actually saved (for debugging)
            // Use a new query outside the transaction to verify persistence
            if (importedLeadIds.length > 0) {
                try {
                    // Small delay to ensure write is visible (MongoDB eventual consistency)
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    const verifyCount = await Lead_1.default.countDocuments({
                        leadId: { $in: importedLeadIds },
                    });
                    if (verifyCount !== importedLeadIds.length) {
                        logger_1.default.error("❌ Lead count mismatch after commit - leads may not be persisted!", {
                            importId,
                            expected: importedLeadIds.length,
                            actual: verifyCount,
                            importedLeadIds: importedLeadIds.slice(0, 5),
                            missingCount: importedLeadIds.length - verifyCount,
                        });
                        // Try to find which leads are missing
                        const foundLeads = await Lead_1.default.find({
                            leadId: { $in: importedLeadIds },
                        })
                            .select("leadId name phone")
                            .lean();
                        const foundLeadIds = foundLeads.map((l) => l.leadId);
                        const missingLeadIds = importedLeadIds.filter((id) => !foundLeadIds.includes(id));
                        if (missingLeadIds.length > 0) {
                            logger_1.default.error("Missing lead IDs after commit", {
                                importId,
                                missingLeadIds: missingLeadIds.slice(0, 5),
                                foundLeadIds: foundLeadIds.slice(0, 5),
                            });
                            // Try to query one missing lead directly
                            if (missingLeadIds.length > 0) {
                                const testLead = await Lead_1.default.findOne({
                                    leadId: missingLeadIds[0],
                                }).lean();
                                logger_1.default.error("Direct query test for missing lead", {
                                    importId,
                                    testLeadId: missingLeadIds[0],
                                    found: !!testLead,
                                    testLeadData: testLead
                                        ? { leadId: testLead.leadId, name: testLead.name }
                                        : null,
                                });
                            }
                        }
                    }
                    else {
                        logger_1.default.info("✅ Leads verified in database after commit", {
                            importId,
                            count: verifyCount,
                            sampleLeadIds: importedLeadIds.slice(0, 3),
                        });
                    }
                }
                catch (verifyError) {
                    logger_1.default.error("Error verifying leads after commit", {
                        importId,
                        error: verifyError.message,
                        stack: verifyError.stack,
                        importedLeadIds: importedLeadIds.slice(0, 3),
                    });
                }
            }
            logger_1.default.info("Bulk lead import completed", {
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
                successCount: totalSuccessCount,
                failedCount: errors.length,
                errors,
                importedLeadIds,
                updatedLeadIds,
            };
        }
        catch (error) {
            await session.abortTransaction();
            logger_1.default.error("Bulk lead import failed", {
                importId: importRecord?.importId,
                error: error.message,
                stack: error.stack,
                userId,
            });
            // Update import record to failed
            if (importRecord?.importId) {
                try {
                    await BulkImport_1.default.findOneAndUpdate({ importId: importRecord.importId }, {
                        $set: {
                            status: "failed",
                            errors: [
                                ...(importRecord.errors || []),
                                { row: 0, error: error.message || "Import failed" },
                            ],
                        },
                    });
                }
                catch (updateError) {
                    logger_1.default.error("Failed to update import record status", {
                        importId: importRecord.importId,
                        error: updateError.message,
                    });
                }
            }
            throw error;
        }
        finally {
            session.endSession();
        }
    }
    /**
     * Generate CSV template for lead import
     * If categories are provided, they will be pre-filled in the template (or columns removed)
     */
    static generateTemplate(primaryCategory, secondaryCategory) {
        // Helper function to escape CSV values
        const escapeCSV = (value) => {
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
            "Phone Number (Optional)",
            "Landline Number (Optional)",
            "Email (optional)",
            "City / Area (optional)",
            "State (optional)",
            "Address (optional)",
            "Pincode (optional)",
            ...(includeCategoryColumns
                ? ["Primary Category", "Secondary Category"]
                : []),
            "Experience Level (optional: beginner/intermediate/experienced)",
            "Years of Experience (optional)",
            "Working Days (optional)",
            "Preferred Time Slot (optional)",
            "Source (optional: referral/campaign/walk-in/agent/other)",
            // 'Source Details',
            // 'Status'
        ];
        const exampleRow = [
            "John Doe",
            "9876543210",
            "01123456789",
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
        // Quote phone number (index 1), landline (index 2), and pincode to prevent Excel from converting to scientific notation
        const escapedHeaders = headers.map(escapeCSV).join(",");
        const escapedRow = exampleRow
            .map((val, idx) => {
            // Quote phone numbers, landline, and pincodes to prevent Excel auto-formatting
            // Adjust indices: phone is index 1, landline is index 2, pincode index depends on whether categories are included
            const phoneIndex = 1;
            const landlineIndex = 2;
            const pincodeIndex = includeCategoryColumns ? 7 : 7; // Pincode is now 7th column (after name, phone, landline, email, city, state, address)
            if (idx === phoneIndex || idx === landlineIndex || idx === pincodeIndex) {
                return `"${val}"`;
            }
            return escapeCSV(val);
        })
            .join(",");
        // Add note at the top if categories are pre-selected
        let csvContent = "";
        csvContent += `${escapedHeaders}\n${escapedRow}`;
        return csvContent;
    }
    /**
     * Get import history with filters
     * ✅ Efficient: Uses indexes and pagination
     * ✅ Concurrent-safe: Read-only queries
     */
    static async getImportHistory(filters) {
        const page = filters?.page || 1;
        const limit = filters?.limit || 20;
        const skip = (page - 1) * limit;
        // Build efficient query with indexes
        const query = {
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
            BulkImport_1.default.find(query)
                .select("importId fileName createdBy createdByName createdByEmail createdByRole totalRows successCount failedCount status createdAt completedAt")
                .sort({ createdAt: -1 }) // Most recent first
                .skip(skip)
                .limit(limit)
                .lean(),
            BulkImport_1.default.countDocuments(query),
        ]);
        return {
            imports: imports,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    /**
     * Get comprehensive import analytics
     */
    static async getImportAnalytics() {
        // 1. Uploads by User - Aggregation
        const uploadsByUserAgg = await BulkImport_1.default.aggregate([
            {
                $match: { status: { $in: ['completed', 'failed', 'partial'] } }
            },
            {
                $group: {
                    _id: '$createdBy',
                    userName: { $first: '$createdByName' },
                    userRole: { $first: '$createdByRole' },
                    totalUploads: { $sum: 1 },
                    totalLeads: { $sum: '$successCount' },
                    totalRows: { $sum: '$totalRows' },
                    totalFailed: { $sum: '$failedCount' }
                }
            },
            {
                $project: {
                    userId: '$_id',
                    userName: { $ifNull: ['$userName', 'Unknown User'] },
                    userRole: { $ifNull: ['$userRole', 'unknown'] },
                    totalUploads: 1,
                    totalLeads: 1,
                    successRate: {
                        $cond: [
                            { $eq: ['$totalRows', 0] },
                            0,
                            { $multiply: [{ $divide: ['$totalLeads', '$totalRows'] }, 100] }
                        ]
                    },
                    avgLeadsPerUpload: {
                        $cond: [
                            { $eq: ['$totalUploads', 0] },
                            0,
                            { $divide: ['$totalLeads', '$totalUploads'] }
                        ]
                    }
                }
            },
            { $sort: { totalLeads: -1 } }
        ]);
        // 2. Unique vs Duplicate Breakdown
        const uniqueDuplicateAgg = await BulkImport_1.default.aggregate([
            {
                $match: { status: { $in: ['completed', 'partial'] } }
            },
            {
                $group: {
                    _id: null,
                    uniqueLeads: { $sum: { $size: { $ifNull: ['$importedUserIds', []] } } },
                    updatedLeads: { $sum: { $size: { $ifNull: ['$updatedUserIds', []] } } },
                    totalFailed: { $sum: '$failedCount' }
                }
            }
        ]);
        const uniqueVsDuplicate = uniqueDuplicateAgg.length > 0
            ? {
                uniqueLeads: uniqueDuplicateAgg[0].uniqueLeads || 0,
                duplicateLeads: uniqueDuplicateAgg[0].totalFailed || 0,
                updatedLeads: uniqueDuplicateAgg[0].updatedLeads || 0
            }
            : { uniqueLeads: 0, duplicateLeads: 0, updatedLeads: 0 };
        // 3. Status Distribution
        const statusDistributionAgg = await BulkImport_1.default.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    status: '$_id',
                    count: 1,
                    _id: 0
                }
            },
            { $sort: { count: -1 } }
        ]);
        // 4. Role-Based Performance
        const roleBreakdownAgg = await BulkImport_1.default.aggregate([
            {
                $match: { status: { $in: ['completed', 'failed', 'partial'] } }
            },
            {
                $group: {
                    _id: '$createdByRole',
                    totalUploads: { $sum: 1 },
                    totalLeads: { $sum: '$successCount' },
                    totalRows: { $sum: '$totalRows' }
                }
            },
            {
                $project: {
                    role: { $ifNull: ['$_id', 'unknown'] },
                    totalUploads: 1,
                    totalLeads: 1,
                    successRate: {
                        $cond: [
                            { $eq: ['$totalRows', 0] },
                            0,
                            { $multiply: [{ $divide: ['$totalLeads', '$totalRows'] }, 100] }
                        ]
                    },
                    _id: 0
                }
            },
            { $sort: { totalLeads: -1 } }
        ]);
        // 5. Uploads Over Time (Last 30 days, grouped by date)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const uploadsOverTimeAgg = await BulkImport_1.default.aggregate([
            {
                $match: {
                    createdAt: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                    },
                    uploads: { $sum: 1 },
                    leads: { $sum: '$successCount' }
                }
            },
            {
                $project: {
                    date: '$_id',
                    uploads: 1,
                    leads: 1,
                    _id: 0
                }
            },
            { $sort: { date: 1 } }
        ]);
        // 6. Summary Metrics
        const summaryAgg = await BulkImport_1.default.aggregate([
            {
                $group: {
                    _id: null,
                    totalImports: { $sum: 1 },
                    totalLeadsImported: { $sum: '$successCount' },
                    totalRows: { $sum: '$totalRows' },
                    totalFailed: { $sum: '$failedCount' },
                    uniqueUploaders: { $addToSet: '$createdBy' },
                    totalUniqueLeads: { $sum: { $size: { $ifNull: ['$importedUserIds', []] } } },
                    totalUpdated: { $sum: { $size: { $ifNull: ['$updatedUserIds', []] } } }
                }
            },
            {
                $project: {
                    totalImports: 1,
                    totalLeadsImported: 1,
                    totalUniqueLeads: 1,
                    totalDuplicates: '$totalFailed',
                    avgSuccessRate: {
                        $cond: [
                            { $eq: ['$totalRows', 0] },
                            0,
                            { $multiply: [{ $divide: ['$totalLeadsImported', '$totalRows'] }, 100] }
                        ]
                    },
                    totalUploaders: { $size: '$uniqueUploaders' }
                }
            }
        ]);
        const summaryMetrics = summaryAgg.length > 0
            ? {
                totalImports: summaryAgg[0].totalImports || 0,
                totalLeadsImported: summaryAgg[0].totalLeadsImported || 0,
                totalUniqueLeads: summaryAgg[0].totalUniqueLeads || 0,
                totalDuplicates: summaryAgg[0].totalDuplicates || 0,
                avgSuccessRate: Math.round((summaryAgg[0].avgSuccessRate || 0) * 100) / 100,
                totalUploaders: summaryAgg[0].totalUploaders || 0
            }
            : { totalImports: 0, totalLeadsImported: 0, totalUniqueLeads: 0, totalDuplicates: 0, avgSuccessRate: 0, totalUploaders: 0 };
        // 7. Top Uploaders (by volume and success rate)
        const topUploaders = uploadsByUserAgg.slice(0, 5).map(u => ({
            userId: u.userId,
            userName: u.userName,
            totalLeads: u.totalLeads,
            successRate: Math.round(u.successRate * 100) / 100
        }));
        // 8. Quality Metrics
        const qualityAgg = await BulkImport_1.default.aggregate([
            {
                $match: { status: { $in: ['completed', 'failed', 'partial'] } }
            },
            {
                $group: {
                    _id: null,
                    totalRows: { $sum: '$totalRows' },
                    totalSuccess: { $sum: '$successCount' },
                    totalFailed: { $sum: '$failedCount' },
                    totalUploads: { $sum: 1 },
                    maxRows: { $max: '$totalRows' }
                }
            },
            {
                $project: {
                    avgDuplicateRate: {
                        $cond: [
                            { $eq: ['$totalRows', 0] },
                            0,
                            { $multiply: [{ $divide: ['$totalFailed', '$totalRows'] }, 100] }
                        ]
                    },
                    avgSuccessRate: {
                        $cond: [
                            { $eq: ['$totalRows', 0] },
                            0,
                            { $multiply: [{ $divide: ['$totalSuccess', '$totalRows'] }, 100] }
                        ]
                    },
                    avgRowsPerUpload: {
                        $cond: [
                            { $eq: ['$totalUploads', 0] },
                            0,
                            { $divide: ['$totalRows', '$totalUploads'] }
                        ]
                    },
                    largestUpload: '$maxRows'
                }
            }
        ]);
        const qualityMetrics = qualityAgg.length > 0
            ? {
                avgDuplicateRate: Math.round((qualityAgg[0].avgDuplicateRate || 0) * 100) / 100,
                avgSuccessRate: Math.round((qualityAgg[0].avgSuccessRate || 0) * 100) / 100,
                avgRowsPerUpload: Math.round(qualityAgg[0].avgRowsPerUpload || 0),
                largestUpload: qualityAgg[0].largestUpload || 0
            }
            : { avgDuplicateRate: 0, avgSuccessRate: 0, avgRowsPerUpload: 0, largestUpload: 0 };
        return {
            uploadsByUser: uploadsByUserAgg.map(u => ({
                userId: u.userId,
                userName: u.userName,
                userRole: u.userRole,
                totalUploads: u.totalUploads,
                totalLeads: u.totalLeads,
                successRate: Math.round(u.successRate * 100) / 100,
                avgLeadsPerUpload: Math.round(u.avgLeadsPerUpload * 100) / 100
            })),
            uniqueVsDuplicate,
            statusDistribution: statusDistributionAgg,
            roleBreakdown: roleBreakdownAgg,
            uploadsOverTime: uploadsOverTimeAgg,
            summaryMetrics,
            topUploaders,
            qualityMetrics
        };
    }
    /**
     * Get import details
     */
    static async getImportDetails(importId) {
        const importRecord = await BulkImport_1.default.findOne({ importId })
            .select("importId fileName createdBy createdByName createdByEmail createdByRole totalRows successCount failedCount status operationType errors importedUserIds updatedUserIds deletedUserIds createdAt completedAt")
            .lean();
        if (!importRecord) {
            throw new Error("Import not found");
        }
        return importRecord;
    }
}
exports.BulkLeadImportService = BulkLeadImportService;
//# sourceMappingURL=BulkLeadImportService.js.map