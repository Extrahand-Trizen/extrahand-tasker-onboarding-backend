"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulkLeadImportService = void 0;
const sync_1 = require("csv-parse/sync");
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
            'cleaning services': 'cleaning',
            'cleaning': 'cleaning',
            'home services': 'home_services',
            'home service': 'home_services',
            'home_services': 'home_services',
            'delivery & transport': 'delivery',
            'delivery and transport': 'delivery',
            'delivery': 'delivery',
            'beauty & wellness': 'beauty',
            'beauty and wellness': 'beauty',
            'beauty': 'beauty',
            'tech services': 'tech',
            'tech service': 'tech',
            'tech': 'tech',
            'education & tutoring': 'tutoring',
            'education and tutoring': 'tutoring',
            'tutoring': 'tutoring',
            'plumbing': 'home_services', // Plumbing falls under home services
            'electrician': 'home_services', // Electrician falls under home services
            'other': 'other',
        };
        return skillMap[normalized] || normalized; // Return mapped value or original if not found
    }
    static parseCSV(fileBuffer) {
        try {
            const records = (0, sync_1.parse)(fileBuffer.toString(), {
                columns: true,
                skip_empty_lines: true,
                trim: true,
            });
            return records.map((record) => {
                // Get primary skill from various possible column names
                const rawSkill = record.primarySkill
                    || record['Primary Skill']
                    || record['Primary Skill (Service Category)']
                    || record['Service Category']
                    || record['Skill']
                    || '';
                // Map human-readable skill to enum value
                const mappedSkill = rawSkill ? BulkLeadImportService.mapSkillToEnum(rawSkill) : '';
                return {
                    name: record.name || record['Full Name'] || '',
                    phone: record.phone || record['Phone Number'] || record['Mobile Number'] || record['Phone'] || '',
                    email: record.email || record['Email'] || '',
                    city: record.city || record['City'] || record['City / Area'] || '',
                    state: record.state || record['State'] || '',
                    address: record.address || record['Address'] || '',
                    pincode: record.pincode || record['Pincode'] || record['Pin Code'] || record['PIN'] || '',
                    primarySkill: mappedSkill,
                    source: (record.source || record['Source'] || 'referral').toLowerCase(),
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
     */
    static validateRow(row, rowNumber) {
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
        if (!row.primarySkill || row.primarySkill.trim().length < 2) {
            return { valid: false, error: 'Primary skill is required' };
        }
        // Validate primary skill is one of the allowed categories
        const validSkills = ['home_services', 'cleaning', 'delivery', 'beauty', 'tech', 'tutoring', 'other'];
        const normalizedSkill = row.primarySkill.toLowerCase().trim();
        if (!validSkills.includes(normalizedSkill)) {
            return { valid: false, error: `Invalid primary skill. Must be one of: ${validSkills.join(', ')}` };
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
     * Bulk import leads from CSV
     */
    static async bulkImportLeads(fileBuffer, fileName, adminUid, adminName, source) {
        const importId = `IMPORT-${Date.now()}-${(0, uuid_1.v4)().substring(0, 8).toUpperCase()}`;
        // Create import record
        const importRecord = new BulkImport_1.default({
            importId,
            adminUid,
            fileName,
            totalRows: 0,
            successCount: 0,
            failedCount: 0,
            status: 'processing',
            operationType: 'create',
            errors: [],
            importedUserIds: [],
        });
        try {
            // Parse CSV
            const rows = this.parseCSV(fileBuffer);
            importRecord.totalRows = rows.length;
            const importedLeadIds = [];
            const errors = [];
            // Process each row
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowNumber = i + 2; // +2 because CSV has header and 0-indexed
                try {
                    // Validate row
                    const validation = this.validateRow(row, rowNumber);
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
                    // Check for duplicates
                    const duplicateCheck = await DuplicateCheckService_1.DuplicateCheckService.checkDuplicate(normalizedPhone, row.name, row.city);
                    if (duplicateCheck.isDuplicate) {
                        errors.push({
                            row: rowNumber,
                            phone: normalizedPhone,
                            error: `Duplicate lead found: ${duplicateCheck.existingLead?.leadId || 'existing'}`,
                        });
                        continue;
                    }
                    // Use provided source or row source
                    const leadSource = source || row.source || 'referral';
                    // Create lead
                    const lead = await LeadService_1.LeadService.createLead({
                        name: row.name.trim(),
                        phone: normalizedPhone,
                        email: row.email?.trim(),
                        city: row.city.trim(),
                        state: row.state.trim(), // Required in bulk import
                        address: row.address.trim(), // Required in bulk import
                        pincode: row.pincode?.trim(),
                        primarySkill: row.primarySkill.trim(),
                        source: leadSource,
                        sourceDetails: row.sourceDetails?.trim() || (leadSource !== row.source ? `Bulk import: ${row.source}` : undefined),
                        addedBy: adminUid,
                        addedByName: adminName,
                        // status: row.status as LeadStatus | undefined,
                    });
                    importedLeadIds.push(lead.leadId);
                }
                catch (error) {
                    logger_1.default.error('Error processing row', {
                        row: rowNumber,
                        error: error.message,
                    });
                    errors.push({
                        row: rowNumber,
                        phone: row.phone,
                        error: error.message || 'Failed to create lead',
                    });
                }
            }
            // Update import record
            importRecord.successCount = importedLeadIds.length;
            importRecord.failedCount = errors.length;
            importRecord.status = errors.length === rows.length ? 'failed' : 'completed';
            importRecord.set('errors', errors);
            importRecord.importedUserIds = importedLeadIds;
            importRecord.completedAt = new Date();
            await importRecord.save();
            logger_1.default.info('Bulk lead import completed', {
                importId,
                totalRows: rows.length,
                successCount: importedLeadIds.length,
                failedCount: errors.length,
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
            logger_1.default.error('Bulk lead import failed', {
                importId,
                error: error.message,
            });
            importRecord.status = 'failed';
            importRecord.errors.push({
                row: 0,
                error: error.message || 'Import failed',
            });
            await importRecord.save();
            throw error;
        }
    }
    /**
     * Generate CSV template for lead import
     */
    static generateTemplate() {
        // Helper function to escape CSV values
        const escapeCSV = (value) => {
            // If value contains comma, quote, or newline, wrap in quotes and escape quotes
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        };
        const headers = [
            'Full Name',
            'Phone Number',
            'Email',
            'City / Area',
            'State',
            'Address',
            'Pincode',
            'Primary Skill (Service Category)',
            'Source (Referral, Campaign, Walk-In, Agent, Other)',
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
            'home_services',
            'referral',
            // 'Facebook Ad',
            // 'contacted'
        ];
        // Properly escape and quote values
        // Quote phone number (index 1) and pincode (index 6) to prevent Excel from converting to scientific notation
        const escapedHeaders = headers.map(escapeCSV).join(',');
        const escapedRow = exampleRow.map((val, idx) => {
            // Quote phone numbers and pincodes to prevent Excel auto-formatting
            if (idx === 1 || idx === 6) {
                return `"${val}"`;
            }
            return escapeCSV(val);
        }).join(',');
        return [escapedHeaders, escapedRow].join('\n');
    }
    /**
     * Get import history
     */
    static async getImportHistory(adminUid, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const query = { operationType: 'create' }; // Only lead imports
        if (adminUid) {
            query.adminUid = adminUid;
        }
        const [imports, total] = await Promise.all([
            BulkImport_1.default.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            BulkImport_1.default.countDocuments(query),
        ]);
        return {
            imports: imports.map((imp) => ({
                importId: imp.importId,
                fileName: imp.fileName,
                totalRows: imp.totalRows,
                successCount: imp.successCount,
                failedCount: imp.failedCount,
                status: imp.status,
                operationType: imp.operationType,
                createdAt: imp.createdAt,
                completedAt: imp.completedAt,
            })),
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
    static async getImportDetails(importId) {
        const importRecord = await BulkImport_1.default.findOne({ importId }).lean();
        if (!importRecord) {
            throw new Error('Import not found');
        }
        return importRecord;
    }
}
exports.BulkLeadImportService = BulkLeadImportService;
//# sourceMappingURL=BulkLeadImportService.js.map