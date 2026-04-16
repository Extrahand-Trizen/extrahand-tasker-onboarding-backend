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
exports.BulkUploadService = void 0;
const sync_1 = require("csv-parse/sync");
const XLSX = __importStar(require("xlsx"));
const logger_1 = __importDefault(require("../config/logger"));
const BulkImport_1 = __importDefault(require("../models/BulkImport"));
const LeadService_1 = require("./LeadService");
const UserCreationService_1 = require("./UserCreationService");
const DuplicateCheckService_1 = require("./DuplicateCheckService");
class BulkUploadService {
    /**
     * Parse CSV/Excel file
     */
    static parseFile(buffer, fileName, defaultPrimaryCategory, defaultSecondaryCategory) {
        const ext = fileName.split(".").pop()?.toLowerCase();
        if (ext === "csv") {
            const recordsRaw = (0, sync_1.parse)(buffer.toString(), {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true,
            });
            // Normalize header keys by trimming whitespace (e.g., 'Phone Number ' -> 'Phone Number')
            const records = recordsRaw.map((record) => {
                const normalized = {};
                Object.keys(record).forEach((key) => {
                    const trimmedKey = key.trim();
                    normalized[trimmedKey] = record[key];
                });
                return normalized;
            });
            return this.normalizeRecords(records, defaultPrimaryCategory, defaultSecondaryCategory);
        }
        else if (["xlsx", "xls"].includes(ext || "")) {
            const workbook = XLSX.read(buffer, { type: "buffer" });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const recordsRaw = XLSX.utils.sheet_to_json(sheet);
            // Normalize header keys by trimming whitespace for Excel as well
            const records = recordsRaw.map((record) => {
                const normalized = {};
                Object.keys(record).forEach((key) => {
                    const trimmedKey = key.trim();
                    normalized[trimmedKey] = record[key];
                });
                return normalized;
            });
            return this.normalizeRecords(records, defaultPrimaryCategory, defaultSecondaryCategory);
        }
        throw new Error("Unsupported file format. Use CSV or Excel (.xlsx, .xls)");
    }
    /**
     * Normalize records to ParsedUser format
     */
    static normalizeRecords(records, defaultPrimaryCategory, defaultSecondaryCategory) {
        // Filter out comment rows (lines starting with '#'), header rows and empty rows
        const cleanedRecords = records.filter((record) => {
            if (!record)
                return false;
            const values = Object.values(record).map((v) => v === undefined || v === null ? "" : String(v).trim());
            // Skip if all values are empty
            if (values.every((v) => v === ""))
                return false;
            // Skip if the first cell is a comment (starts with '#')
            if (values[0]?.startsWith("#"))
                return false;
            // Skip header rows that were accidentally treated as data rows.
            // Example: a sheet where the real header row is not the very first row,
            // so it shows up in `records` as data with values like "Full Name", "Phone Number", etc.
            const headerIndicators = new Set([
                "full name",
                "phone number",
                "mobile number",
                "email (optional)",
                "city / area",
                "state (optional)",
                "address",
                "pincode",
                "primary category",
                "secondary category",
                "experience level (beginner/intermediate/experienced)",
                "years of experience (optional)",
                "working days (optional)",
                "preferred time slot (optional)",
                "source (referral/campaign/walk-in/agent/other)",
            ].map((s) => s.toLowerCase()));
            const looksLikeHeaderRow = values.some((v) => headerIndicators.has(v.toLowerCase()));
            if (looksLikeHeaderRow)
                return false;
            return true;
        });
        return cleanedRecords.map((record, index) => {
            // Extra-safe detection for phone field: if standard keys are missing,
            // look for any header that contains "phone" or "mobile".
            const detectPhoneFromAnyKey = () => {
                for (const [key, value] of Object.entries(record)) {
                    if (value === undefined || value === null || value === "")
                        continue;
                    const normalizedKey = key.toLowerCase().replace(/\s+/g, "");
                    if (normalizedKey.includes("phonenumber") ||
                        normalizedKey.includes("mobilenumber") ||
                        normalizedKey === "phone" ||
                        normalizedKey === "mobile" ||
                        normalizedKey.includes("phone") ||
                        normalizedKey.includes("mobile")) {
                        return value.toString().trim();
                    }
                }
                return undefined;
            };
            // Detect operation type (default to 'create' if not specified)
            const operation = (record.operation ||
                record.Operation ||
                "create").toLowerCase();
            // Get primary category from CSV or use default
            const primaryCategoryValue = record.primaryCategory ||
                record.PrimaryCategory ||
                record["Primary Category"] ||
                record.primarySkill ||
                record.PrimarySkill ||
                record["Primary Skill"] ||
                record["Primary Skill (Service Category)"] ||
                defaultPrimaryCategory ||
                undefined;
            // Get secondary category from CSV or use default
            const secondaryCategoryValue = record.secondaryCategory ||
                record.SecondaryCategory ||
                record["Secondary Category"] ||
                record.secondarySkill ||
                record.SecondarySkill ||
                record["Secondary Skill"] ||
                defaultSecondaryCategory ||
                undefined;
            const directPhone = record.phone ||
                record.Phone ||
                record["Phone Number"] ||
                record["Mobile Number"] ||
                "";
            const phoneValue = directPhone && directPhone.toString().trim() !== ""
                ? directPhone.toString().trim()
                : detectPhoneFromAnyKey();
            const landlineValue = record.landline ||
                record.Landline ||
                record["Landline Number"] ||
                record["Landline Number (Optional)"] ||
                record["Landline"] ||
                record["Tel"] ||
                record["Telephone"] ||
                undefined;
            // Debug logging for the first few rows to help diagnose header/phone issues
            if (index < 5) {
                try {
                    logger_1.default.debug("BulkUpload normalizeRecords row", {
                        index,
                        keys: Object.keys(record),
                        rawRecord: record,
                        resolvedPhone: phoneValue,
                    });
                }
                catch {
                    // avoid breaking flow if logging fails
                }
            }
            return {
                operation: operation,
                uid: record.uid || record.UID || undefined,
                name: (record.name || record.Name || record["Full Name"] || "").toString().trim() ||
                    "Unknown Tasker",
                phone: phoneValue || undefined,
                landline: landlineValue ? String(landlineValue).trim() : undefined,
                email: record.email || record.Email || undefined,
                address: record.address ||
                    record.Address ||
                    record["Local Area"] ||
                    "Unknown Address",
                city: record.city || record.City || record["City / Area"] || "Unknown",
                state: record.state || record.State || undefined,
                pincode: record.pincode ||
                    record.Pincode ||
                    record.pinCode ||
                    record.Pincode ||
                    "000000",
                primaryCategory: primaryCategoryValue,
                primarySkill: primaryCategoryValue, // For backward compatibility
                secondaryCategory: secondaryCategoryValue,
                secondarySkill: secondaryCategoryValue, // For backward compatibility
                experienceLevel: record.experienceLevel ||
                    record.ExperienceLevel ||
                    record["Experience Level"] ||
                    record["Experience Level (beginner/intermediate/experienced)"] ||
                    undefined,
                yearsOfExperience: record.yearsOfExperience ||
                    record.YearsOfExperience ||
                    record["Years of Experience"] ||
                    record["Years Of Experience"] ||
                    record["Years of Experience (optional)"]
                    ? parseInt(record.yearsOfExperience ||
                        record.YearsOfExperience ||
                        record["Years of Experience"] ||
                        record["Years Of Experience"] ||
                        record["Years of Experience (optional)"] ||
                        "0", 10)
                    : undefined,
                workingDays: record.workingDays ||
                    record.WorkingDays ||
                    record["Working Days"] ||
                    record["Working Days (optional)"] ||
                    undefined,
                preferredTimeSlot: record.preferredTimeSlot ||
                    record.PreferredTimeSlot ||
                    record["Preferred Time Slot"] ||
                    record["Preferred TimeSlot"] ||
                    record["Preferred Time Slot (optional)"] ||
                    undefined,
                source: record.source ||
                    record.Source ||
                    record["Source (referral/campaign/walk-in/agent/other)"] ||
                    "other",
                agentCampaignId: record.agentCampaignId ||
                    record.AgentCampaignId ||
                    record["Agent / Campaign ID"] ||
                    "DIRECT_UPLOAD",
                skillsList: record.skills || record.Skills || record.skillsList || undefined,
                isActive: record.isActive !== undefined
                    ? record.isActive === "true" ||
                        record.isActive === true ||
                        record.isActive === 1
                    : undefined,
                reason: record.reason || record.Reason || undefined,
            };
        });
    }
    /**
     * Validate parsed users based on operation type
     */
    static validateUsers(users) {
        const errors = [];
        if (users.length === 0) {
            errors.push("File is empty");
        }
        if (users.length > 10000) {
            errors.push("Maximum 10000 operations per import");
        }
        // Detect operation types
        const operations = new Set(users.map((u) => u.operation || "create"));
        const isMixed = operations.size > 1;
        users.forEach((user, index) => {
            const row = index + 2; // +2 for header row and 0-index
            const operation = user.operation || "create";
            // Validate based on operation type
            if (operation === "update" || operation === "delete") {
                if (!user.uid || user.uid.trim() === "") {
                    errors.push(`Row ${row}: UID is required for ${operation} operation`);
                }
            }
            if (operation === "create") {
                if (!user.name || user.name.trim() === "") {
                    errors.push(`Row ${row}: Full Name is required for create operation`);
                }
                const hasPhone = !!user.phone && user.phone.trim().length > 0;
                const hasLandline = !!user.landline && user.landline.trim().length > 0;
                if (!hasPhone && !hasLandline) {
                    errors.push(`Row ${row}: At least one contact number (Mobile or Landline) is required for create operation (debug user=${JSON.stringify(user)})`);
                }
                else if (hasPhone && !this.isValidPhone(user.phone)) {
                    errors.push(`Row ${row}: Invalid phone format: ${user.phone}. Expected a 10-digit number`);
                }
                if (hasLandline && !this.isValidLandline(user.landline)) {
                    errors.push(`Row ${row}: Invalid landline format: ${user.landline}. Expected 6-15 digits`);
                }
                // if (!user.city || user.city.trim() === "") {
                //   errors.push(`Row ${row}: City is required for create operation`);
                // }
                // if (!user.address || user.address.trim() === "") {
                //   errors.push(
                //     `Row ${row}: Local Area is required for create operation`
                //   );
                // }
                // if (!user.pincode || user.pincode.trim() === "") {
                //   errors.push(`Row ${row}: Pincode is required for create operation`);
                // }
                // if (!user.primarySkill || user.primarySkill.trim() === "") {
                //   errors.push(
                //     `Row ${row}: Primary Skill is required for create operation`
                //   );
                // }
                // if (!user.source || user.source.trim() === "") {
                //   errors.push(`Row ${row}: Source is required for create operation`);
                // }
                // if (!user.agentCampaignId || user.agentCampaignId.trim() === "") {
                //   errors.push(
                //     `Row ${row}: Agent / Campaign ID is required for create operation`
                //   );
                // }
            }
            if (operation === "update") {
                // At least one field besides uid should be provided
                const hasUpdateFields = user.name ||
                    user.phone ||
                    user.address ||
                    user.skillsList ||
                    user.isActive !== undefined;
                if (!hasUpdateFields) {
                    errors.push(`Row ${row}: At least one field to update is required`);
                }
                // Validate phone if provided
                if (user.phone && !this.isValidPhone(user.phone)) {
                    errors.push(`Row ${row}: Invalid phone format: ${user.phone}`);
                }
            }
        });
        return {
            isValid: errors.length === 0,
            errors,
        };
    }
    /**
     * Preview bulk upload without creating any records
     * Returns parsed data with validation and duplicate checks
     */
    static async previewBulkUpload(fileBuffer, fileName, defaultPrimaryCategory, defaultSecondaryCategory) {
        // 1. Parse file
        const users = this.parseFile(fileBuffer, fileName, defaultPrimaryCategory, defaultSecondaryCategory);
        // 2. Validate
        const validation = this.validateUsers(users);
        // 3. Only preview create operations
        const createUsers = users.filter((u) => (u.operation || "create") === "create");
        // 4. Bulk duplicate check against database
        const allPhones = createUsers
            .map((u) => u.phone)
            .filter((p) => !!p);
        const existingLeadsByPhoneMap = await DuplicateCheckService_1.DuplicateCheckService.checkPhonesBulk(allPhones);
        // 5. Track in-file duplicates
        const seenPhonesInFile = new Set();
        // 6. Build preview rows
        const previewRows = createUsers.map((user, index) => {
            const rowNumber = index + 2; // +2 for header row and 0-index
            const normalizedPhone = user.phone
                ? DuplicateCheckService_1.DuplicateCheckService.normalizePhone(user.phone)
                : "";
            // Check in-file duplicate
            const isDuplicateInFile = normalizedPhone !== "" && seenPhonesInFile.has(normalizedPhone);
            if (!isDuplicateInFile && normalizedPhone) {
                seenPhonesInFile.add(normalizedPhone);
            }
            // Check database duplicate
            const existingLead = normalizedPhone
                ? existingLeadsByPhoneMap.get(normalizedPhone)
                : undefined;
            const isDuplicateInDb = !!existingLead;
            // Collect row-specific validation errors
            const rowErrors = [];
            validation.errors
                .filter((msg) => msg.startsWith(`Row ${rowNumber}:`))
                .forEach((msg) => {
                rowErrors.push(msg.replace(`Row ${rowNumber}: `, ""));
            });
            // Add duplicate errors
            if (isDuplicateInFile) {
                rowErrors.push("Duplicate phone number within uploaded file");
            }
            if (isDuplicateInDb && existingLead) {
                rowErrors.push(`Duplicate in system: ${existingLead.leadId}`);
            }
            return {
                rowNumber,
                name: user.name || "Unknown",
                phone: user.phone,
                email: user.email,
                city: user.city || "Unknown",
                primaryCategory: user.primaryCategory || user.primarySkill || "",
                secondaryCategory: user.secondaryCategory || user.secondarySkill || "",
                experienceLevel: user.experienceLevel,
                status: (rowErrors.length === 0 ? "valid" : "invalid"),
                errors: rowErrors,
                isDuplicateInFile,
                isDuplicateInDb,
                duplicateLeadId: existingLead?.leadId,
            };
        });
        // 7. Build summary
        const summary = {
            total: previewRows.length,
            valid: previewRows.filter((r) => r.status === "valid").length,
            invalid: previewRows.filter((r) => r.status === "invalid").length,
            duplicatesInFile: previewRows.filter((r) => r.isDuplicateInFile).length,
            duplicatesInDb: previewRows.filter((r) => r.isDuplicateInDb).length,
        };
        logger_1.default.info("Bulk upload preview completed", {
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
     * Process bulk operations (create, update, delete) - Optimized with Firebase and MongoDB bulk operations
     */
    static async processBulkUpload(fileBuffer, fileName, adminUid, defaultPrimaryCategory, defaultSecondaryCategory, sendEmails = true) {
        // 1. Parse file with default categories
        const users = this.parseFile(fileBuffer, fileName, defaultPrimaryCategory, defaultSecondaryCategory);
        // 2. Validate categories match (if provided)
        if (defaultPrimaryCategory && defaultSecondaryCategory) {
            const categoryMismatches = [];
            users.forEach((user, index) => {
                const userPrimaryCategory = (user.primaryCategory ||
                    user.primarySkill ||
                    "")
                    .trim()
                    .toLowerCase();
                const userSecondaryCategory = (user.secondaryCategory ||
                    user.secondarySkill ||
                    "").trim();
                // If user has categories in CSV, they must match the provided defaults
                if (userPrimaryCategory &&
                    userPrimaryCategory !== defaultPrimaryCategory.toLowerCase()) {
                    categoryMismatches.push(`Row ${index + 2}: Primary category mismatch. Expected: ${defaultPrimaryCategory}, found: ${userPrimaryCategory}`);
                }
                if (userSecondaryCategory &&
                    userSecondaryCategory !== defaultSecondaryCategory) {
                    categoryMismatches.push(`Row ${index + 2}: Secondary category mismatch. Expected: ${defaultSecondaryCategory}, found: ${userSecondaryCategory}`);
                }
            });
            if (categoryMismatches.length > 0) {
                throw new Error(`Category validation failed:\n${categoryMismatches
                    .slice(0, 10)
                    .join("\n")}${categoryMismatches.length > 10
                    ? `\n... and ${categoryMismatches.length - 10} more mismatches`
                    : ""}`);
            }
        }
        // 3. Validate
        const validation = this.validateUsers(users);
        if (!validation.isValid) {
            throw new Error(`Validation failed:\n${validation.errors.join("\n")}`);
        }
        // 3. Detect operation type
        const operations = new Set(users.map((u) => u.operation || "create"));
        const operationType = operations.size > 1
            ? "mixed"
            : (Array.from(operations)[0] || "create");
        // 4. Create import record
        const importId = `import_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
        await BulkImport_1.default.create({
            importId,
            adminUid,
            fileName,
            totalRows: users.length,
            status: "processing",
            operationType,
        });
        const result = {
            importId,
            operation: operationType,
            success: 0,
            failed: 0,
            errors: [],
            importedLeadIds: [],
            importedUserIds: [],
            updatedUserIds: [],
            deletedUserIds: [],
        };
        // 5. Separate users by operation type
        const createUsers = users.filter((u) => (u.operation || "create") === "create");
        const updateUsers = users.filter((u) => u.operation === "update");
        const deleteUsers = users.filter((u) => u.operation === "delete");
        // 6. Process creates (creates leads + Firebase users + MongoDB profiles)
        if (createUsers.length > 0) {
            const createResult = await this.processCreates(createUsers, importId, adminUid, sendEmails);
            result.success += createResult.success;
            result.failed += createResult.failed;
            result.importedLeadIds.push(...createResult.leadIds);
            result.importedUserIds.push(...createResult.userIds);
            result.errors.push(...createResult.errors);
        }
        // 7. Process updates
        if (updateUsers.length > 0) {
            const updateResult = await this.processUpdates(updateUsers, importId);
            result.success += updateResult.success;
            result.failed += updateResult.failed;
            result.updatedUserIds.push(...updateResult.userIds);
            result.errors.push(...updateResult.errors);
        }
        // 8. Process deletes
        if (deleteUsers.length > 0) {
            const deleteResult = await this.processDeletes(deleteUsers, importId);
            result.success += deleteResult.success;
            result.failed += deleteResult.failed;
            result.deletedUserIds.push(...deleteResult.userIds);
            result.errors.push(...deleteResult.errors);
        }
        // 9. Final update
        await BulkImport_1.default.updateOne({ importId }, {
            status: "completed",
            completedAt: new Date(),
            importedUserIds: result.importedUserIds, // Store Firebase UIDs
            updatedUserIds: result.updatedUserIds || [],
            deletedUserIds: result.deletedUserIds || [],
        });
        logger_1.default.info("Bulk operations completed", {
            importId,
            adminUid,
            operation: operationType,
            total: users.length,
            success: result.success,
            failed: result.failed,
        });
        return result;
    }
    /**
     * Process bulk creates - Creates LEADS ONLY (no Firebase users, no profiles)
     * ✅ SECURITY: Accounts will only be created via invite acceptance flow
     * OPTIMIZED: Uses bulk duplicate checks to minimize database queries
     */
    static async processCreates(users, importId, adminUid, sendEmails = true) {
        const processingResult = {
            success: 0,
            failed: 0,
            leadIds: [],
            userIds: [], // ✅ Always empty - no accounts created
            errors: [],
        };
        logger_1.default.info(`Processing ${users.length} lead creations from bulk upload (NO accounts will be created)`);
        // STEP 1: Bulk duplicate check - Check ALL phones at once (single MongoDB query)
        const allPhoneNumbers = users.map((user) => user.phone).filter((v) => Boolean(v));
        const normalizedPhoneNumbers = allPhoneNumbers.map((phone) => DuplicateCheckService_1.DuplicateCheckService.normalizePhone(phone));
        logger_1.default.info(`Performing bulk duplicate check for ${normalizedPhoneNumbers.length} phone numbers`);
        const existingLeadsByPhoneMap = await DuplicateCheckService_1.DuplicateCheckService.checkPhonesBulk(allPhoneNumbers);
        const usersToProcess = [];
        const duplicateErrors = [];
        // Track phones seen within this file to detect in-file duplicates
        const seenPhonesInFile = new Set();
        users.forEach((user, index) => {
            const csvRowNumber = index + 2; // +2 for header row and 0-index
            const normalizedPhone = user.phone
                ? DuplicateCheckService_1.DuplicateCheckService.normalizePhone(user.phone)
                : "";
            // Check for duplicate within this file first
            if (normalizedPhone && seenPhonesInFile.has(normalizedPhone)) {
                duplicateErrors.push({
                    row: csvRowNumber,
                    phone: user.phone,
                    error: `Duplicate phone number within uploaded file (first occurrence will be processed)`,
                });
                logger_1.default.debug(`Skipping in-file duplicate`, {
                    row: csvRowNumber,
                    phone: normalizedPhone,
                });
                return;
            }
            if (normalizedPhone) {
                seenPhonesInFile.add(normalizedPhone);
            }
            // Check if lead already exists in database
            if (normalizedPhone && existingLeadsByPhoneMap.has(normalizedPhone)) {
                const existingLead = existingLeadsByPhoneMap.get(normalizedPhone);
                duplicateErrors.push({
                    row: csvRowNumber,
                    phone: user.phone,
                    error: `Duplicate lead found: ${existingLead?.leadId || "existing lead"}`,
                });
                logger_1.default.debug(`Skipping duplicate lead`, {
                    row: csvRowNumber,
                    phone: normalizedPhone,
                    existingLeadId: existingLead?.leadId,
                });
                return;
            }
            // User passed duplicate checks, add to processing queue
            usersToProcess.push({
                user,
                originalIndex: index,
                csvRowNumber,
            });
        });
        // Add duplicate errors to result
        duplicateErrors.forEach((duplicateError) => {
            processingResult.failed++;
            processingResult.errors.push(duplicateError);
        });
        logger_1.default.info(`Duplicate filtering completed: ${duplicateErrors.length} duplicates found, ${usersToProcess.length} users to process`);
        if (usersToProcess.length === 0) {
            logger_1.default.warn("No users to process after duplicate filtering");
            return processingResult;
        }
        // STEP 3: Create leads ONLY (no Firebase, no profiles, no accounts)
        const leadCreationPromises = usersToProcess.map(async (userToProcess) => {
            try {
                const createdLead = await LeadService_1.LeadService.createLead({
                    name: userToProcess.user.name,
                    phone: userToProcess.user.phone,
                    landline: userToProcess.user.landline,
                    email: userToProcess.user.email,
                    city: userToProcess.user.city || "Unknown",
                    state: userToProcess.user.state,
                    address: userToProcess.user.address,
                    pincode: userToProcess.user.pincode,
                    primaryCategory: userToProcess.user.primaryCategory ||
                        userToProcess.user.primarySkill ||
                        undefined,
                    primarySkill: userToProcess.user.primaryCategory ||
                        userToProcess.user.primarySkill ||
                        undefined, // For backward compatibility
                    secondaryCategory: userToProcess.user.secondaryCategory ||
                        userToProcess.user.secondarySkill ||
                        "",
                    secondarySkill: userToProcess.user.secondaryCategory ||
                        userToProcess.user.secondarySkill ||
                        "", // For backward compatibility
                    experienceLevel: (userToProcess.user.experienceLevel ||
                        "intermediate"),
                    // ❌ REMOVED: yearsOfExperience - not part of CreateLeadData interface
                    workingDays: userToProcess.user.workingDays,
                    preferredTimeSlot: userToProcess.user.preferredTimeSlot,
                    source: userToProcess.user.source || "campaign",
                    sourceDetails: `Bulk upload: ${importId}`,
                    agentCampaignId: userToProcess.user.agentCampaignId,
                    addedBy: adminUid,
                    addedByName: undefined,
                }, {
                    // For bulk uploads, rely on phone duplicate check only
                    // to avoid false positives on name+city fuzzy matching.
                    skipNameCityDuplicate: true,
                });
                // ✅ Set status to "lead_added" (initial status for new leads)
                // ✅ Accounts will only be created via invite acceptance flow
                createdLead.status = "lead_added";
                createdLead.creationMethod = "bulk_upload";
                createdLead.statusHistory.push({
                    status: "lead_added",
                    changedBy: adminUid,
                    changedAt: new Date(),
                    notes: "Lead created via bulk upload - account will be created after invite acceptance",
                });
                await createdLead.save();
                processingResult.success++;
                processingResult.leadIds.push(createdLead.leadId);
                logger_1.default.debug(`Successfully created lead (no account)`, {
                    leadId: createdLead.leadId,
                    name: userToProcess.user.name,
                    phone: userToProcess.user.phone,
                });
                return {
                    success: true,
                    leadId: createdLead.leadId,
                };
            }
            catch (error) {
                // Check if error is about duplicate (from LeadService.createLead)
                const isDuplicateError = error.message?.includes("Duplicate") ||
                    error.message?.includes("duplicate");
                processingResult.failed++;
                processingResult.errors.push({
                    row: userToProcess.csvRowNumber,
                    phone: userToProcess.user.phone,
                    error: isDuplicateError
                        ? error.message
                        : `Lead creation failed: ${error.message}`,
                });
                return {
                    success: false,
                    error: isDuplicateError
                        ? error.message
                        : `Lead creation failed: ${error.message}`,
                };
            }
        });
        await Promise.allSettled(leadCreationPromises);
        logger_1.default.info("Bulk lead creation completed (NO accounts created)", {
            importId,
            success: processingResult.success,
            failed: processingResult.failed,
            total: users.length,
            note: "Accounts will only be created via invite acceptance flow",
        });
        // ✅ NO Firebase user creation
        // ✅ NO Profile creation
        // ✅ NO Account created emails
        // ✅ NO Status set to "account_created"
        // ✅ userIds array remains empty
        return processingResult;
        logger_1.default.info("Bulk creation completed", {
            totalUsers: users.length,
            duplicatesFound: duplicateErrors.length,
            usersProcessed: usersToProcess.length,
            successfulCreations: processingResult.success,
            failedCreations: processingResult.failed,
            leadsCreated: processingResult.leadIds.length,
            firebaseUsersCreated: processingResult.userIds.length,
        });
        return processingResult;
    }
    /**
     * Process bulk updates
     */
    static async processUpdates(users, importId) {
        const result = {
            success: 0,
            failed: 0,
            userIds: [],
            errors: [],
        };
        // Process in batches of 100
        const BATCH_SIZE = 100;
        for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const batch = users.slice(i, i + BATCH_SIZE);
            const startRow = i + 2;
            try {
                // Update Firebase users in parallel
                const firebaseUpdates = await Promise.allSettled(batch.map((user) => {
                    const updateData = {};
                    if (user.name)
                        updateData.displayName = user.name;
                    if (user.phone)
                        updateData.phoneNumber = UserCreationService_1.UserCreationService.formatPhone(user.phone);
                    return UserCreationService_1.UserCreationService.updateFirebaseUser(user.uid, updateData);
                }));
                // Prepare profile updates
                const profileUpdates = batch
                    .map((user, index) => {
                    if (firebaseUpdates[index].status === "fulfilled") {
                        return UserCreationService_1.UserCreationService.prepareProfileUpdate(user);
                    }
                    return null;
                })
                    .filter(Boolean);
                // Bulk update profiles
                if (profileUpdates.length > 0) {
                    await UserCreationService_1.UserCreationService.bulkUpdateProfiles(profileUpdates);
                    result.success += profileUpdates.length;
                    result.userIds.push(...profileUpdates.map((u) => u.uid));
                }
                // Handle errors
                firebaseUpdates.forEach((settled, index) => {
                    if (settled.status === "rejected") {
                        result.failed++;
                        result.errors.push({
                            row: startRow + index,
                            uid: batch[index].uid,
                            error: settled.reason?.message || "Update failed",
                        });
                    }
                });
            }
            catch (error) {
                logger_1.default.error(`Update batch failed:`, error);
                batch.forEach((user, index) => {
                    result.failed++;
                    result.errors.push({
                        row: startRow + index,
                        uid: user.uid,
                        error: error.message || "Batch update failed",
                    });
                });
            }
        }
        return result;
    }
    /**
     * Process bulk deletes
     */
    static async processDeletes(users, importId) {
        const result = {
            success: 0,
            failed: 0,
            userIds: [],
            errors: [],
        };
        // Process in batches of 1000 (Firebase limit)
        const BATCH_SIZE = 1000;
        for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const batch = users.slice(i, i + BATCH_SIZE);
            const uids = batch.map((u) => u.uid).filter(Boolean);
            const startRow = i + 2;
            try {
                // Bulk delete Firebase users
                const firebaseResult = await UserCreationService_1.UserCreationService.deleteUsersBulk(uids);
                // Track successful deletes
                result.success += firebaseResult.successCount;
                result.userIds.push(...firebaseResult.deletedUids);
                // Bulk delete profiles
                if (firebaseResult.deletedUids.length > 0) {
                    await UserCreationService_1.UserCreationService.bulkDeleteProfiles(firebaseResult.deletedUids);
                }
                // Handle errors
                if (firebaseResult.errors && firebaseResult.errors.length > 0) {
                    firebaseResult.errors.forEach((error) => {
                        result.failed++;
                        const originalIndex = uids.findIndex((uid) => uid === error.uid);
                        result.errors.push({
                            row: startRow + (originalIndex >= 0 ? originalIndex : 0),
                            uid: error.uid,
                            error: error.error.message || "Delete failed",
                        });
                    });
                }
            }
            catch (error) {
                logger_1.default.error(`Delete batch failed:`, error);
                batch.forEach((user, index) => {
                    result.failed++;
                    result.errors.push({
                        row: startRow + index,
                        uid: user.uid,
                        error: error.message || "Batch delete failed",
                    });
                });
            }
        }
        return result;
    }
    static isValidPhone(phone) {
        const digitsOnly = phone.replace(/\D/g, "");
        const last10Digits = digitsOnly.slice(-10);
        return /^\d{10}$/.test(last10Digits);
    }
    static isValidLandline(landline) {
        const digitsOnly = landline.replace(/\D/g, "");
        return digitsOnly.length >= 6 && digitsOnly.length <= 15;
    }
}
exports.BulkUploadService = BulkUploadService;
//# sourceMappingURL=BulkUploadService.js.map