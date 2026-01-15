"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulkLeadImportService = void 0;
const sync_1 = require("csv-parse/sync");
const mongoose_1 = __importDefault(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const Lead_1 = __importDefault(require("../models/Lead"));
const BulkImport_1 = __importDefault(require("../models/BulkImport"));
const DuplicateCheckService_1 = require("./DuplicateCheckService");
const LeadService_1 = require("./LeadService");
const logger_1 = __importDefault(require("../config/logger"));
const uuid_1 = require("uuid");
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
            'home services': 'handyperson',
            'home service': 'handyperson',
            'home_services': 'handyperson',
            'plumbing': 'handyperson', // Plumbing falls under handyperson
            'electrician': 'handyperson', // Electrician falls under handyperson
            'delivery & transport': 'moving',
            'delivery and transport': 'moving',
            'delivery': 'moving',
            // Current categories
            'cleaning services': 'cleaning',
            'cleaning': 'cleaning',
            'handyperson': 'handyperson',
            'handy person': 'handyperson',
            'moving': 'moving',
            'moving & delivery': 'moving',
            'moving and delivery': 'moving',
            'gardening': 'gardening',
            'business': 'business',
            'business services': 'business',
            'marketing': 'marketing',
            'marketing & design': 'marketing',
            'marketing and design': 'marketing',
            'tech services': 'tech',
            'tech service': 'tech',
            'tech support': 'tech',
            'tech': 'tech',
            'technology': 'tech',
            'education & tutoring': 'tutoring',
            'education and tutoring': 'tutoring',
            'tutoring': 'tutoring',
            'photography': 'photography',
            'beauty & wellness': 'beauty',
            'beauty and wellness': 'beauty',
            'beauty': 'beauty',
            'pet care': 'pet-care',
            'pet-care': 'pet-care',
            'events': 'events',
            'events & entertainment': 'events',
            'events and entertainment': 'events',
            'other': 'other',
        };
        return skillMap[normalized] || normalized; // Return mapped value or original if not found
    }
    static parseCSV(fileBuffer, defaultPrimaryCategory, defaultSecondaryCategory) {
        try {
            const recordsRaw = (0, sync_1.parse)(fileBuffer.toString(), {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true, // Allow inconsistent column counts
                relax_quotes: true, // Be more flexible with quotes
            });
            // Normalize header keys by trimming whitespace
            const records = recordsRaw.map((record) => {
                const normalized = {};
                Object.keys(record).forEach((key) => {
                    const trimmedKey = key.trim();
                    normalized[trimmedKey] = record[key];
                });
                return normalized;
            });
            // Filter out header rows that were accidentally treated as data rows
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
                // Skip header rows (column name indicators)
                const headerIndicators = new Set([
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
                ].map((s) => s.toLowerCase()));
                const looksLikeHeaderRow = values.some((v) => headerIndicators.has(v.toLowerCase()));
                if (looksLikeHeaderRow)
                    return false;
                return true;
            });
            return cleanedRecords.map((record) => {
                // Get primary category/skill from CSV or use default provided
                const rawPrimaryCategory = record.primaryCategory
                    || record['Primary Category']
                    || record.primarySkill
                    || record['Primary Skill']
                    || record['Primary Skill (Service Category)']
                    || record['Service Category']
                    || record['Skill']
                    || defaultPrimaryCategory
                    || '';
                // Map human-readable skill to enum value
                const mappedPrimaryCategory = rawPrimaryCategory ? BulkLeadImportService.mapSkillToEnum(rawPrimaryCategory) : '';
                // Get secondary category from CSV or use default provided
                const rawSecondaryCategory = record.secondaryCategory
                    || record['Secondary Category']
                    || record.secondarySkill
                    || record['Secondary Skill']
                    || defaultSecondaryCategory
                    || '';
                // Parse experience level
                const experienceLevel = (record.experienceLevel || record['Experience Level'] || record['Experience Level (beginner/intermediate/experienced)'] || '').toLowerCase();
                const validExperienceLevels = ['beginner', 'intermediate', 'experienced'];
                const mappedExperienceLevel = validExperienceLevels.includes(experienceLevel)
                    ? experienceLevel
                    : undefined;
                // Parse years of experience (optional)
                const yearsOfExperience = record.yearsOfExperience
                    || record['Years of Experience']
                    || record['Years Of Experience']
                    ? parseInt(record.yearsOfExperience || record['Years of Experience'] || record['Years Of Experience'] || '0', 10)
                    : undefined;
                return {
                    name: record.name || record['Full Name'] || '',
                    phone: record.phone || record['Phone Number'] || record['Mobile Number'] || record['Phone'] || '',
                    email: record.email || record['Email'] || '',
                    city: record.city || record['City'] || record['City / Area'] || record['City (optional)'] || '',
                    state: record.state || record['State'] || record['State (optional)'] || '',
                    address: record.address || record['Address'] || '',
                    pincode: record.pincode || record['Pincode'] || record['Pin Code'] || record['PIN'] || '',
                    primaryCategory: mappedPrimaryCategory,
                    primarySkill: mappedPrimaryCategory, // For backward compatibility
                    secondaryCategory: rawSecondaryCategory,
                    experienceLevel: mappedExperienceLevel,
                    yearsOfExperience: isNaN(yearsOfExperience) ? undefined : yearsOfExperience,
                    workingDays: record.workingDays || record['Working Days'] || '',
                    preferredTimeSlot: record.preferredTimeSlot || record['Preferred Time Slot'] || record['Preferred TimeSlot'] || '',
                    source: (record.source || record['Source'] || 'referral').toLowerCase(),
                    sourceDetails: record.sourceDetails || record['Source Details'] || '',
                };
            });
        }
        catch (error) {
            logger_1.default.error('CSV parsing error', { error: error.message });
            throw new Error(`Failed to parse CSV: ${error.message}`);
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
            return { valid: false, error: 'Name is required and must be at least 2 characters' };
        }
        // Normalize phone - handle +91-XXXXXXXXXX or just XXXXXXXXXX
        const phoneDigits = row.phone.replace(/\D/g, ''); // Remove all non-digits
        const last10Digits = phoneDigits.slice(-10); // Get last 10 digits
        if (!row.phone || !/^[6-9]\d{9}$/.test(last10Digits)) {
            return { valid: false, error: 'Invalid phone number (10 digits, starting with 6-9). Can be +91-XXXXXXXXXX or just XXXXXXXXXX' };
        }
        if (!row.city || row.city.trim().length < 2) {
            return { valid: false, error: 'City is required' };
        }
        if (!row.state || row.state.trim().length < 2) {
            return { valid: false, error: 'State is required' };
        }
        if (!row.address || row.address.trim().length < 5) {
            return { valid: false, error: 'Address is required (minimum 5 characters)' };
        }
        // Check primary category - use row value or default
        const primaryCategory = (row.primaryCategory || row.primarySkill || defaultPrimaryCategory || '').trim();
        if (!primaryCategory || primaryCategory.length < 2) {
            return { valid: false, error: 'Primary category is required (either in CSV or provided as default)' };
        }
        // Validate primary category is one of the allowed categories
        const validCategories = [
            'cleaning',
            'handyperson',
            'moving',
            'gardening',
            'business',
            'marketing',
            'tech',
            'tutoring',
            'photography',
            'beauty',
            'pet-care',
            'events',
            'other'
        ];
        const normalizedCategory = primaryCategory.toLowerCase().trim();
        if (!validCategories.includes(normalizedCategory)) {
            return { valid: false, error: `Invalid primary category. Must be one of: ${validCategories.join(', ')}` };
        }
        // Check secondary category - use row value or default
        const secondaryCategory = (row.secondaryCategory || defaultSecondaryCategory || '').trim();
        if (!secondaryCategory || secondaryCategory.length < 1) {
            return { valid: false, error: 'Secondary category is required (either in CSV or provided as default)' };
        }
        if (!row.city || row.city.trim().length < 2) {
            return { valid: false, error: 'City is required' };
        }
        if (!row.state || row.state.trim().length < 2) {
            return { valid: false, error: 'State is required' };
        }
        if (!row.address || row.address.trim().length < 5) {
            return { valid: false, error: 'Address is required (minimum 5 characters)' };
        }
        // Validate experience level is provided
        if (!row.experienceLevel) {
            return { valid: false, error: 'Experience level is required (beginner, intermediate, or experienced)' };
        }
        const validExperienceLevels = ['beginner', 'intermediate', 'experienced'];
        if (!validExperienceLevels.includes(row.experienceLevel.toLowerCase())) {
            return { valid: false, error: `Invalid experience level. Must be one of: ${validExperienceLevels.join(', ')}` };
        }
        if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
            return { valid: false, error: 'Invalid email format' };
        }
        const validSources = ['referral', 'campaign', 'walk-in', 'agent', 'other'];
        if (!validSources.includes(row.source)) {
            return { valid: false, error: `Invalid source. Must be one of: ${validSources.join(', ')}` };
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
    static async previewBulkImport(fileBuffer, fileName, defaultPrimaryCategory, defaultSecondaryCategory) {
        // 1. Parse CSV
        const rows = this.parseCSV(fileBuffer, defaultPrimaryCategory, defaultSecondaryCategory);
        // 2. Bulk duplicate check against database
        const allPhones = rows.map((r) => r.phone).filter(Boolean);
        logger_1.default.info(`[Preview] Performing bulk duplicate check for ${allPhones.length} phone numbers`);
        const existingLeadsByPhoneMap = await DuplicateCheckService_1.DuplicateCheckService.checkPhonesBulk(allPhones);
        logger_1.default.info(`[Preview] Duplicate check completed. Found ${existingLeadsByPhoneMap.size} existing leads`);
        // 3. Track in-file duplicates
        const seenPhonesInFile = new Set();
        // 4. Build preview rows
        const previewRows = rows.map((row, index) => {
            const rowNumber = index + 2; // +2 for header row and 0-index
            const normalizedPhone = row.phone
                ? DuplicateCheckService_1.DuplicateCheckService.normalizePhone(row.phone)
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
            // Validate row (pass default categories for validation)
            const validation = this.validateRow(row, rowNumber, defaultPrimaryCategory, defaultSecondaryCategory);
            const rowErrors = [];
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
                status: (rowErrors.length === 0 ? "valid" : "invalid"),
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
    adminName, adminEmail, adminRole, source, defaultPrimaryCategory, defaultSecondaryCategory) {
        const session = await mongoose_1.default.startSession();
        session.startTransaction();
        let importRecord = null;
        try {
            // STEP 1: Calculate file hash for idempotency
            const fileHash = crypto_1.default.createHash('sha256').update(fileBuffer).digest('hex');
            // STEP 2: Check if this file was already uploaded by this user (idempotency)
            const existingImport = await BulkImport_1.default.findOne({
                fileHash,
                createdBy: userId
            }).session(session).lean();
            if (existingImport && existingImport.status === 'completed') {
                // ✅ Check if all leads from previous import are inactive/deleted
                // If so, allow re-import
                if (existingImport.importedUserIds && existingImport.importedUserIds.length > 0) {
                    const activeLeadsCount = await Lead_1.default.countDocuments({
                        leadId: { $in: existingImport.importedUserIds },
                        status: { $nin: ['inactive', 'rejected'] } // Count only active leads
                    }).session(session);
                    if (activeLeadsCount === 0) {
                        // All leads from previous import are inactive/deleted - allow re-import
                        logger_1.default.info('Previous import leads are all inactive - allowing re-import', {
                            previousImportId: existingImport.importId,
                            fileHash: fileHash.substring(0, 16) + '...',
                            userId,
                            previousLeadCount: existingImport.importedUserIds.length
                        });
                        // Continue with new import (don't return existing result)
                    }
                    else {
                        // Some leads are still active - return existing result (idempotent)
                        await session.commitTransaction();
                        logger_1.default.info('Idempotent import: returning existing result', {
                            importId: existingImport.importId,
                            fileHash: fileHash.substring(0, 16) + '...',
                            userId,
                            activeLeadsCount
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
                    logger_1.default.info('Idempotent import: returning existing result (no leads imported)', {
                        importId: existingImport.importId,
                        fileHash: fileHash.substring(0, 16) + '...',
                        userId
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
            // STEP 3: Parse CSV
            const rows = this.parseCSV(fileBuffer, defaultPrimaryCategory, defaultSecondaryCategory);
            // STEP 4: Create or get import record atomically (prevent duplicate processing)
            const importId = `IMPORT-${Date.now()}-${(0, uuid_1.v4)().substring(0, 8).toUpperCase()}`;
            // ✅ If previous import exists and all leads are inactive, delete it first to allow re-import
            if (existingImport && existingImport.status === 'completed') {
                const activeLeadsCount = await Lead_1.default.countDocuments({
                    leadId: { $in: existingImport.importedUserIds || [] },
                    status: { $nin: ['inactive', 'rejected'] }
                }).session(session);
                if (activeLeadsCount === 0) {
                    // Delete the old import record to allow new one
                    await BulkImport_1.default.deleteOne({
                        importId: existingImport.importId
                    }).session(session);
                    logger_1.default.info('Deleted previous import record to allow re-import', {
                        previousImportId: existingImport.importId,
                        userId
                    });
                }
            }
            const importRecordResult = await BulkImport_1.default.findOneAndUpdate({
                fileHash,
                createdBy: userId,
                status: { $ne: 'processing' } // Only if not already processing
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
                    status: 'processing',
                    operationType: 'create',
                    errors: [],
                    importedUserIds: [],
                }
            }, {
                upsert: true,
                new: true,
                session
            });
            importRecord = importRecordResult;
            // If record was already processing, wait a bit and check again
            if (!importRecordResult || importRecordResult.status === 'processing') {
                const checkAgain = await BulkImport_1.default.findOne({ fileHash, createdBy: userId })
                    .session(session)
                    .lean();
                if (checkAgain && checkAgain.status === 'completed') {
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
            // STEP 5: Bulk duplicate check - Check ALL phones at once (single MongoDB query)
            const allPhones = rows.map((r) => r.phone).filter(Boolean);
            const existingLeadsByPhoneMap = await DuplicateCheckService_1.DuplicateCheckService.checkPhonesBulk(allPhones);
            logger_1.default.info('Performing bulk duplicate check', {
                importId,
                phoneCount: allPhones.length,
                userId
            });
            // STEP 6: Track in-file duplicates and prepare bulk insert documents
            const seenPhonesInFile = new Set();
            const leadsToInsert = [];
            const normalizedPhones = [];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowNumber = i + 2; // +2 because CSV has header and 0-indexed
                // Validate row
                const validation = this.validateRow(row, rowNumber, defaultPrimaryCategory, defaultSecondaryCategory);
                if (!validation.valid) {
                    errors.push({
                        row: rowNumber,
                        phone: row.phone,
                        error: validation.error || 'Validation failed',
                    });
                    continue;
                }
                // Normalize phone
                const normalizedPhone = DuplicateCheckService_1.DuplicateCheckService.normalizePhone(row.phone);
                // Check for duplicate within this file
                if (seenPhonesInFile.has(normalizedPhone)) {
                    errors.push({
                        row: rowNumber,
                        phone: row.phone,
                        error: 'Duplicate phone number within uploaded file',
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
                const leadSource = source || row.source || 'referral';
                // Prepare lead document for bulk insert
                const leadId = LeadService_1.LeadService.generateLeadId();
                normalizedPhones.push(normalizedPhone);
                // Map primary skill category to human-readable name (same as LeadService)
                const primarySkillCategory = (row.primaryCategory || row.primarySkill || '').trim();
                const primarySkillNameMap = {
                    'cleaning': 'Cleaning',
                    'handyperson': 'Handyperson',
                    'moving': 'Moving & Delivery',
                    'gardening': 'Gardening',
                    'business': 'Business Services',
                    'marketing': 'Marketing & Design',
                    'tech': 'Tech Support',
                    'tutoring': 'Tutoring',
                    'photography': 'Photography',
                    'beauty': 'Beauty & Wellness',
                    'pet-care': 'Pet Care',
                    'events': 'Events & Entertainment',
                    'other': 'Other'
                };
                const primarySkillName = primarySkillNameMap[primarySkillCategory] || primarySkillCategory;
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
                    secondaryCategory: row.secondaryCategory?.trim() || '',
                    secondarySkill: row.secondaryCategory?.trim() || '', // Legacy field
                    experienceLevel: row.experienceLevel || 'beginner',
                    workingDays: row.workingDays?.trim(),
                    preferredTimeSlot: row.preferredTimeSlot?.trim(),
                    source: leadSource,
                    sourceDetails: row.sourceDetails?.trim() || (leadSource !== row.source ? `Bulk import: ${row.source}` : undefined),
                    status: 'lead_added',
                    accountStatus: 'not_created',
                    statusHistory: [{
                            status: 'lead_added',
                            changedBy: userId,
                            changedByName: adminName,
                            changedAt: new Date()
                        }],
                    skills: [{
                            name: primarySkillName,
                            category: primarySkillCategory,
                            level: 'experienced',
                            toolsAvailable: false,
                            assignedBy: userId,
                            assignedAt: new Date()
                        }],
                    documents: [],
                    verificationStatus: {},
                    communicationLog: [],
                    internalNotes: [],
                    isDuplicate: false,
                    blacklisted: false,
                    creationMethod: 'bulk_upload',
                    addedBy: userId,
                    addedByName: adminName,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }
            // STEP 7: Bulk insert leads (atomic, efficient)
            let importedLeadIds = [];
            if (leadsToInsert.length > 0) {
                // Log before insertion for debugging
                logger_1.default.info('Preparing to insert leads', {
                    importId,
                    count: leadsToInsert.length,
                    sampleLeadIds: leadsToInsert.slice(0, 3).map(l => l.leadId),
                    userId
                });
                try {
                    // Use insertMany with ordered: false to continue on errors
                    const insertResult = await Lead_1.default.insertMany(leadsToInsert, {
                        ordered: false, // Continue on error, don't stop
                        session
                    });
                    logger_1.default.info('insertMany completed', {
                        importId,
                        resultCount: insertResult.length,
                        resultType: Array.isArray(insertResult) ? 'array' : typeof insertResult,
                        sampleResult: insertResult.length > 0 ? {
                            hasLeadId: !!insertResult[0].leadId,
                            keys: Object.keys(insertResult[0] || {}),
                            leadIdValue: insertResult[0]?.leadId
                        } : null
                    });
                    // Extract leadIds from inserted documents
                    // insertMany returns Mongoose documents, leadId should be directly accessible
                    importedLeadIds = insertResult.map((lead) => {
                        // Try multiple ways to access leadId (Mongoose document can be accessed differently)
                        const leadId = lead.leadId || (lead.toObject && lead.toObject().leadId) || lead._doc?.leadId;
                        if (!leadId) {
                            logger_1.default.error('Lead ID not found in insert result', {
                                leadKeys: Object.keys(lead),
                                leadIdType: typeof lead.leadId,
                                importId
                            });
                        }
                        return leadId;
                    }).filter(Boolean); // Remove any undefined values
                    // If extraction failed, try to get from original leadsToInsert
                    if (importedLeadIds.length === 0 && insertResult.length > 0) {
                        logger_1.default.warn('Failed to extract leadIds from insertResult, using original data', {
                            importId,
                            insertResultLength: insertResult.length,
                            leadsToInsertLength: leadsToInsert.length
                        });
                        importedLeadIds = leadsToInsert.map(lead => lead.leadId).filter(Boolean);
                    }
                    logger_1.default.info('Bulk insert completed', {
                        importId,
                        attempted: leadsToInsert.length,
                        successful: importedLeadIds.length,
                        importedLeadIds: importedLeadIds.slice(0, 5), // Log first 5 for debugging
                        userId
                    });
                    // Handle partial failures (some may fail due to race conditions)
                    if (insertResult.length < leadsToInsert.length) {
                        const failedCount = leadsToInsert.length - insertResult.length;
                        logger_1.default.warn('Some leads failed to insert (likely race conditions)', {
                            importId,
                            failed: failedCount,
                            userId
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
                            .map(lead => lead.leadId);
                        importedLeadIds = insertedLeadIds;
                        // Add write errors to errors array
                        bulkError.writeErrors.forEach((err) => {
                            const rowIndex = err.index;
                            const row = rows[rowIndex];
                            errors.push({
                                row: rowIndex + 2,
                                phone: row?.phone,
                                error: err.errmsg || 'Failed to insert lead',
                            });
                        });
                        logger_1.default.warn('Bulk insert had partial failures', {
                            importId,
                            successful: importedLeadIds.length,
                            failed: bulkError.writeErrors.length,
                            userId
                        });
                    }
                    else {
                        throw bulkError;
                    }
                }
            }
            // STEP 8: Update import record atomically
            const finalStatus = errors.length === rows.length ? 'failed' : 'completed';
            await BulkImport_1.default.findOneAndUpdate({ importId }, {
                $set: {
                    successCount: importedLeadIds.length,
                    failedCount: errors.length + (leadsToInsert.length - importedLeadIds.length),
                    status: finalStatus,
                    importedUserIds: importedLeadIds,
                    errors: errors,
                    completedAt: new Date()
                }
            }, { session });
            await session.commitTransaction();
            logger_1.default.info('Transaction committed successfully', {
                importId,
                importedLeadIdsCount: importedLeadIds.length,
                importedLeadIds: importedLeadIds.slice(0, 3)
            });
            // End session after commit
            await session.endSession();
            // Verify leads were actually saved (for debugging)
            // Use a new query outside the transaction to verify persistence
            if (importedLeadIds.length > 0) {
                try {
                    // Small delay to ensure write is visible (MongoDB eventual consistency)
                    await new Promise(resolve => setTimeout(resolve, 100));
                    const verifyCount = await Lead_1.default.countDocuments({
                        leadId: { $in: importedLeadIds }
                    });
                    if (verifyCount !== importedLeadIds.length) {
                        logger_1.default.error('❌ Lead count mismatch after commit - leads may not be persisted!', {
                            importId,
                            expected: importedLeadIds.length,
                            actual: verifyCount,
                            importedLeadIds: importedLeadIds.slice(0, 5),
                            missingCount: importedLeadIds.length - verifyCount
                        });
                        // Try to find which leads are missing
                        const foundLeads = await Lead_1.default.find({
                            leadId: { $in: importedLeadIds }
                        }).select('leadId name phone').lean();
                        const foundLeadIds = foundLeads.map(l => l.leadId);
                        const missingLeadIds = importedLeadIds.filter(id => !foundLeadIds.includes(id));
                        if (missingLeadIds.length > 0) {
                            logger_1.default.error('Missing lead IDs after commit', {
                                importId,
                                missingLeadIds: missingLeadIds.slice(0, 5),
                                foundLeadIds: foundLeadIds.slice(0, 5)
                            });
                            // Try to query one missing lead directly
                            if (missingLeadIds.length > 0) {
                                const testLead = await Lead_1.default.findOne({ leadId: missingLeadIds[0] }).lean();
                                logger_1.default.error('Direct query test for missing lead', {
                                    importId,
                                    testLeadId: missingLeadIds[0],
                                    found: !!testLead,
                                    testLeadData: testLead ? { leadId: testLead.leadId, name: testLead.name } : null
                                });
                            }
                        }
                    }
                    else {
                        logger_1.default.info('✅ Leads verified in database after commit', {
                            importId,
                            count: verifyCount,
                            sampleLeadIds: importedLeadIds.slice(0, 3)
                        });
                    }
                }
                catch (verifyError) {
                    logger_1.default.error('Error verifying leads after commit', {
                        importId,
                        error: verifyError.message,
                        stack: verifyError.stack,
                        importedLeadIds: importedLeadIds.slice(0, 3)
                    });
                }
            }
            logger_1.default.info('Bulk lead import completed', {
                importId,
                totalRows: rows.length,
                successCount: importedLeadIds.length,
                failedCount: errors.length,
                userId,
                role: adminRole
            });
            return {
                importId,
                totalRows: rows.length,
                successCount: importedLeadIds.length,
                failedCount: errors.length,
                errors,
                importedLeadIds,
            };
        }
        catch (error) {
            await session.abortTransaction();
            logger_1.default.error('Bulk lead import failed', {
                importId: importRecord?.importId,
                error: error.message,
                stack: error.stack,
                userId
            });
            // Update import record to failed
            if (importRecord?.importId) {
                try {
                    await BulkImport_1.default.findOneAndUpdate({ importId: importRecord.importId }, {
                        $set: {
                            status: 'failed',
                            errors: [
                                ...(importRecord.errors || []),
                                { row: 0, error: error.message || 'Import failed' }
                            ]
                        }
                    });
                }
                catch (updateError) {
                    logger_1.default.error('Failed to update import record status', {
                        importId: importRecord.importId,
                        error: updateError.message
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
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        };
        // If categories are provided, exclude them from template (they'll be applied automatically)
        const includeCategoryColumns = !primaryCategory || !secondaryCategory;
        const headers = [
            'Full Name',
            'Phone Number',
            'Email (optional)',
            'City / Area',
            'State (optional)',
            'Address',
            'Pincode',
            ...(includeCategoryColumns ? ['Primary Category', 'Secondary Category'] : []),
            'Experience Level (beginner/intermediate/experienced)',
            'Years of Experience (optional)',
            'Working Days (optional)',
            'Preferred Time Slot (optional)',
            'Source (referral/campaign/walk-in/agent/other)',
            // 'Source Details',
            // 'Status'
        ];
        const exampleRow = [
            'John Doe',
            '9876543210',
            'john@example.com',
            'Delhi',
            'Delhi',
            '123 Main Street, Connaught Place',
            '110001',
            ...(includeCategoryColumns ? [primaryCategory || 'handyperson', secondaryCategory || 'Plumbing'] : []),
            'intermediate',
            '3',
            'Mon-Fri',
            'Morning',
            'referral',
            // 'Facebook Ad',
            // 'contacted'
        ];
        // Properly escape and quote values
        // Quote phone number (index 1) and pincode (index 6) to prevent Excel from converting to scientific notation
        const escapedHeaders = headers.map(escapeCSV).join(',');
        const escapedRow = exampleRow.map((val, idx) => {
            // Quote phone numbers and pincodes to prevent Excel auto-formatting
            // Adjust indices: phone is always index 1, pincode index depends on whether categories are included
            const phoneIndex = 1;
            const pincodeIndex = includeCategoryColumns ? 6 : 6; // Pincode is always 6th column (after name, phone, email, city, state, address)
            if (idx === phoneIndex || idx === pincodeIndex) {
                return `"${val}"`;
            }
            return escapeCSV(val);
        }).join(',');
        // Add note at the top if categories are pre-selected
        let csvContent = '';
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
    static async getImportHistory(filters) {
        const page = filters?.page || 1;
        const limit = filters?.limit || 20;
        const skip = (page - 1) * limit;
        // Build efficient query with indexes
        const query = {
            operationType: 'create' // Only lead imports (not user imports)
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
            query.createdByName = { $regex: filters.createdByName, $options: 'i' };
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
                .select('importId fileName createdBy createdByName createdByEmail createdByRole totalRows successCount failedCount status createdAt completedAt')
                .sort({ createdAt: -1 }) // Most recent first
                .skip(skip)
                .limit(limit)
                .lean(),
            BulkImport_1.default.countDocuments(query)
        ]);
        return {
            imports: imports,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }
    /**
     * Get import details
     */
    static async getImportDetails(importId) {
        const importRecord = await BulkImport_1.default.findOne({ importId })
            .select('importId fileName createdBy createdByName createdByEmail createdByRole totalRows successCount failedCount status operationType errors importedUserIds updatedUserIds deletedUserIds createdAt completedAt')
            .lean();
        if (!importRecord) {
            throw new Error('Import not found');
        }
        return importRecord;
    }
}
exports.BulkLeadImportService = BulkLeadImportService;
//# sourceMappingURL=BulkLeadImportService.js.map