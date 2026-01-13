import { parse } from 'csv-parse/sync';
import Lead, { ILead, LeadSource, LeadStatus } from '../models/Lead';
import BulkImport, { IBulkImport } from '../models/BulkImport';
import { DuplicateCheckService } from './DuplicateCheckService';
import { LeadService } from './LeadService';
import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

export interface BulkLeadImportRow {
  name: string;
  phone: string;
  email?: string;
  city: string;
  state: string;  // Required for bulk import
  address: string;  // Required for bulk import
  pincode?: string;
  primaryCategory?: string; // New field name
  primarySkill?: string; // Legacy field name (for backward compatibility)
  secondaryCategory?: string;
  experienceLevel?: 'beginner' | 'intermediate' | 'experienced';
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

  static parseCSV(fileBuffer: Buffer, defaultPrimaryCategory?: string, defaultSecondaryCategory?: string): BulkLeadImportRow[] {
    try {
      const recordsRaw = parse(fileBuffer.toString(), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true, // Allow inconsistent column counts
        relax_quotes: true, // Be more flexible with quotes
      });

      // Normalize header keys by trimming whitespace
      const records = recordsRaw.map((record: any) => {
        const normalized: any = {};
        Object.keys(record).forEach((key) => {
          const trimmedKey = key.trim();
          normalized[trimmedKey] = record[key];
        });
        return normalized;
      });

      // Filter out header rows that were accidentally treated as data rows
      const cleanedRecords = records.filter((record: any) => {
        if (!record) return false;
        const values = Object.values(record).map((v) =>
          v === undefined || v === null ? "" : String(v).trim()
        );
        // Skip if all values are empty
        if (values.every((v) => v === "")) return false;
        // Skip if the first cell is a comment (starts with '#')
        if (values[0]?.startsWith("#")) return false;

        // Skip header rows (column name indicators)
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
          ].map((s) => s.toLowerCase())
        );

        const looksLikeHeaderRow = values.some((v) =>
          headerIndicators.has(v.toLowerCase())
        );
        if (looksLikeHeaderRow) return false;

        return true;
      });

      return cleanedRecords.map((record: any) => {
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
        const experienceLevel = (record.experienceLevel || record['Experience Level'] || record['Experience Level (beginner/intermediate/experienced)']||'').toLowerCase();
        const validExperienceLevels = ['beginner', 'intermediate', 'experienced'];
        const mappedExperienceLevel = validExperienceLevels.includes(experienceLevel) 
          ? experienceLevel as 'beginner' | 'intermediate' | 'experienced'
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
          yearsOfExperience: isNaN(yearsOfExperience as number) ? undefined : yearsOfExperience,
          workingDays: record.workingDays || record['Working Days'] || '',
          preferredTimeSlot: record.preferredTimeSlot || record['Preferred Time Slot'] || record['Preferred TimeSlot'] || '',
          source: (record.source || record['Source'] || 'referral').toLowerCase() as LeadSource,
          sourceDetails: record.sourceDetails || record['Source Details'] || '',
        };
      });
    } catch (error: any) {
      logger.error('CSV parsing error', { error: error.message });
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
  static validateRow(
    row: BulkLeadImportRow, 
    rowNumber: number,
    defaultPrimaryCategory?: string,
    defaultSecondaryCategory?: string
  ): { valid: boolean; error?: string } {
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
    if(!row.city || row.city.trim().length < 2) {
      return { valid: false, error: 'City is required' };
    }
    if(!row.state || row.state.trim().length < 2) {
      return { valid: false, error: 'State is required' };
    }
    if(!row.address || row.address.trim().length < 5) {
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

    const validSources: LeadSource[] = ['referral', 'campaign', 'walk-in', 'agent', 'other'];
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
  static async previewBulkImport(
    fileBuffer: Buffer,
    fileName: string,
    defaultPrimaryCategory?: string,
    defaultSecondaryCategory?: string
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
    // 1. Parse CSV
    const rows = this.parseCSV(fileBuffer, defaultPrimaryCategory, defaultSecondaryCategory);

    // 2. Bulk duplicate check against database
    const allPhones = rows.map((r) => r.phone).filter(Boolean);
    logger.info(`[Preview] Performing bulk duplicate check for ${allPhones.length} phone numbers`);
    const existingLeadsByPhoneMap = await DuplicateCheckService.checkPhonesBulk(
      allPhones
    );
    logger.info(`[Preview] Duplicate check completed. Found ${existingLeadsByPhoneMap.size} existing leads`);

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
      const validation = this.validateRow(row, rowNumber, defaultPrimaryCategory, defaultSecondaryCategory);
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
   */
  static async bulkImportLeads(
    fileBuffer: Buffer,
    fileName: string,
    adminUid: string,
    adminName?: string,
    source?: LeadSource,
    defaultPrimaryCategory?: string,
    defaultSecondaryCategory?: string
  ): Promise<BulkLeadImportResult> {
    const importId = `IMPORT-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;
    
    // Create import record
    const importRecord = new BulkImport({
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
      // Parse CSV with default categories
      const rows = this.parseCSV(fileBuffer, defaultPrimaryCategory, defaultSecondaryCategory);
      importRecord.totalRows = rows.length;

      type ImportError = { row: number; uid?: string; phone?: string; error: string };
      const importedLeadIds: string[] = [];
      const errors: ImportError[] = [];

      // STEP 1: Bulk duplicate check - Check ALL phones at once (single MongoDB query)
      const allPhones = rows.map((r) => r.phone).filter(Boolean);
      const existingLeadsByPhoneMap = await DuplicateCheckService.checkPhonesBulk(
        allPhones
      );

      logger.info(
        `Performing bulk duplicate check for ${allPhones.length} phone numbers`
      );

      // STEP 2: Track in-file duplicates
      const seenPhonesInFile = new Set<string>();

      // Process each row
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 2; // +2 because CSV has header and 0-indexed

        try {
          // Validate row (pass default categories for validation)
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
          const normalizedPhone = DuplicateCheckService.normalizePhone(row.phone);

          // Check for duplicate within this file first
          if (seenPhonesInFile.has(normalizedPhone)) {
            errors.push({
              row: rowNumber,
              phone: row.phone,
              error: `Duplicate phone number within uploaded file (first occurrence will be processed)`,
            });
            logger.debug(`Skipping in-file duplicate`, {
              row: rowNumber,
              phone: normalizedPhone,
            });
            continue;
          }
          seenPhonesInFile.add(normalizedPhone);

          // Check for duplicate in database (using bulk result)
          const existingLead = existingLeadsByPhoneMap.get(normalizedPhone);
          if (existingLead) {
            errors.push({
              row: rowNumber,
              phone: normalizedPhone,
              error: `Duplicate lead found: ${existingLead.leadId}`,
            });
            logger.debug(`Skipping duplicate lead`, {
              row: rowNumber,
              phone: normalizedPhone,
              existingLeadId: existingLead.leadId,
            });
            continue;
          }

          // Use provided source or row source
          const leadSource = source || row.source || 'referral';

          // Create lead with all fields from Add Tasker form
          const lead = await LeadService.createLead({
            name: row.name.trim(),
            phone: normalizedPhone,
            email: row.email?.trim(),
            city: row.city.trim(),
            state: row.state.trim(),  // Required in bulk import
            address: row.address.trim(),  // Required in bulk import
            pincode: row.pincode?.trim(),
            primaryCategory: (row.primaryCategory || row.primarySkill || '').trim(),
            primarySkill: (row.primaryCategory || row.primarySkill || '').trim(), // For backward compatibility
            secondaryCategory: row.secondaryCategory?.trim() || '',
            secondarySkill: row.secondaryCategory?.trim() || '', // For backward compatibility
            experienceLevel: row.experienceLevel || 'beginner', // Default to beginner if not provided
            workingDays: row.workingDays?.trim(),
            preferredTimeSlot: row.preferredTimeSlot?.trim(),
            source: leadSource,
            sourceDetails: row.sourceDetails?.trim() || (leadSource !== row.source ? `Bulk import: ${row.source}` : undefined),
            addedBy: adminUid,
            addedByName: adminName,
            // status: row.status as LeadStatus | undefined,
          });

          importedLeadIds.push(lead.leadId);
        } catch (error: any) {
          logger.error('Error processing row', {
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
      importRecord.set('errors', errors as any);
      importRecord.importedUserIds = importedLeadIds;
      importRecord.completedAt = new Date();

      await importRecord.save();

      logger.info('Bulk lead import completed', {
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
    } catch (error: any) {
      logger.error('Bulk lead import failed', {
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
   * If categories are provided, they will be pre-filled in the template (or columns removed)
   */
  static generateTemplate(primaryCategory?: string, secondaryCategory?: string): string {
    // Helper function to escape CSV values
    const escapeCSV = (value: string): string => {
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
   * Get import history
   */
  static async getImportHistory(
    adminUid?: string,
    page: number = 1,
    limit: number = 20
  ) {
    const skip = (page - 1) * limit;
    const query: any = { operationType: 'create' }; // Only lead imports

    if (adminUid) {
      query.adminUid = adminUid;
    }

    const [imports, total] = await Promise.all([
      BulkImport.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BulkImport.countDocuments(query),
    ]);

    return {
      imports: imports.map((imp: any) => ({
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
  static async getImportDetails(importId: string): Promise<IBulkImport> {
    const importRecord = await BulkImport.findOne({ importId }).lean();

    if (!importRecord) {
      throw new Error('Import not found');
    }

    return importRecord as unknown as IBulkImport;
  }
}

