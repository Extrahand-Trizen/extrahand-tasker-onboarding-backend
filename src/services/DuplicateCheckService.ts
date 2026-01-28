import Lead, { ILead } from '../models/Lead';
import logger from '../config/logger';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingLead?: ILead;
  matchType?: 'phone' | 'name_city';
  sameCategory?: boolean; // New field: true if duplicate has same category
}

export class DuplicateCheckService {
  /**
   * Check if a phone number already exists in leads
   */
  static async checkPhoneDuplicate(phone: string): Promise<DuplicateCheckResult> {
    try {
      // Normalize phone number (remove spaces, dashes, country code)
      const normalizedPhone = this.normalizePhone(phone);
      
      // Check in phone field
      const existingLeadByPhone = await Lead.findOne({
        phone: normalizedPhone,
        status: { $nin: ['rejected', 'inactive'] } // ✅ Don't match rejected or inactive (deleted) leads
      }).lean();

      if (existingLeadByPhone) {
        logger.info('Duplicate phone found', {
          phone: normalizedPhone,
          existingLeadId: existingLeadByPhone.leadId
        });
        return {
          isDuplicate: true,
          existingLead: existingLeadByPhone as unknown as ILead,
          matchType: 'phone'
        };
      }

      // Also check in landline field (cross-field duplicate check)
      const existingLeadByLandline = await Lead.findOne({
        landline: normalizedPhone,
        status: { $nin: ['rejected', 'inactive'] }
      }).lean();

      if (existingLeadByLandline) {
        logger.info('Duplicate phone found in landline field', {
          phone: normalizedPhone,
          existingLeadId: existingLeadByLandline.leadId
        });
        return {
          isDuplicate: true,
          existingLead: existingLeadByLandline as unknown as ILead,
          matchType: 'phone'
        };
      }

      return { isDuplicate: false };
    } catch (error: any) {
      logger.error('Duplicate check error', {
        error: error.message,
        phone
      });
      throw error;
    }
  }

  /**
   * Check if a landline number already exists in leads
   */
  static async checkLandlineDuplicate(landline: string): Promise<DuplicateCheckResult> {
    try {
      // Normalize landline number
      const normalizedLandline = this.normalizeLandline(landline);
      
      // Check in landline field
      const existingLeadByLandline = await Lead.findOne({
        landline: normalizedLandline,
        status: { $nin: ['rejected', 'inactive'] }
      }).lean();

      if (existingLeadByLandline) {
        logger.info('Duplicate landline found', {
          landline: normalizedLandline,
          existingLeadId: existingLeadByLandline.leadId
        });
        return {
          isDuplicate: true,
          existingLead: existingLeadByLandline as unknown as ILead,
          matchType: 'phone' // Using 'phone' for consistency
        };
      }

      // Also check in phone field (cross-field duplicate check)
      const existingLeadByPhone = await Lead.findOne({
        phone: normalizedLandline,
        status: { $nin: ['rejected', 'inactive'] }
      }).lean();

      if (existingLeadByPhone) {
        logger.info('Duplicate landline found in phone field', {
          landline: normalizedLandline,
          existingLeadId: existingLeadByPhone.leadId
        });
        return {
          isDuplicate: true,
          existingLead: existingLeadByPhone as unknown as ILead,
          matchType: 'phone'
        };
      }

      return { isDuplicate: false };
    } catch (error: any) {
      logger.error('Landline duplicate check error', {
        error: error.message,
        landline
      });
      throw error;
    }
  }

  /**
   * Check for duplicate by name and city (fuzzy match)
   */
  static async checkNameCityDuplicate(name: string, city: string): Promise<DuplicateCheckResult> {
    try {
      const normalizedName = name.toLowerCase().trim();
      const normalizedCity = city.toLowerCase().trim();

      const existingLead = await Lead.findOne({
        $and: [
          { name: { $regex: new RegExp(normalizedName, 'i') } },
          { city: { $regex: new RegExp(normalizedCity, 'i') } },
          { status: { $nin: ['rejected', 'inactive'] } } // ✅ Don't match rejected or inactive (deleted) leads
        ]
      }).lean();

      if (existingLead) {
        logger.info('Duplicate name+city found', {
          name,
          city,
          existingLeadId: existingLead.leadId
        });
        return {
          isDuplicate: true,
          existingLead: existingLead as unknown as ILead,
          matchType: 'name_city'
        };
      }

      return { isDuplicate: false };
    } catch (error: any) {
      logger.error('Name+city duplicate check error', {
        error: error.message,
        name,
        city
      });
      throw error;
    }
  }

  /**
   * Comprehensive duplicate check (supports both phone and landline)
   */
  static async checkDuplicate(
    phone?: string, 
    landline?: string, 
    name?: string, 
    city?: string
  ): Promise<DuplicateCheckResult> {
    // First check phone if provided (most reliable)
    if (phone) {
      const phoneCheck = await this.checkPhoneDuplicate(phone);
      if (phoneCheck.isDuplicate) {
        return phoneCheck;
      }
    }

    // Then check landline if provided
    if (landline) {
      const landlineCheck = await this.checkLandlineDuplicate(landline);
      if (landlineCheck.isDuplicate) {
        return landlineCheck;
      }
    }

    // Then check name+city if provided
    if (name && city) {
      const nameCityCheck = await this.checkNameCityDuplicate(name, city);
      if (nameCityCheck.isDuplicate) {
        return nameCityCheck;
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Normalize phone number
   */
  static normalizePhone(phone: string): string {
    // Remove all non-digit characters
    let normalized = phone.replace(/\D/g, '');
    
    // Remove leading country code (91 for India)
    if (normalized.startsWith('91') && normalized.length === 12) {
      normalized = normalized.substring(2);
    }
    
    // Ensure 10 digits
    if (normalized.length > 10) {
      normalized = normalized.slice(-10);
    }
    
    return normalized;
  }

  /**
   * Normalize landline number
   */
  static normalizeLandline(landline: string): string {
    // Remove all non-digit characters
    return landline.replace(/\D/g, '');
  }

  /**
   * Bulk check for duplicate phones (optimized - single query)
   * Returns a map of normalized phone -> existing lead for O(1) lookup
   */
  static async checkPhonesBulk(phoneNumbers: string[]): Promise<Map<string, ILead>> {
    try {
      if (phoneNumbers.length === 0) {
        return new Map();
      }

      // Normalize all phone numbers
      const normalizedPhones = phoneNumbers.map(phone => this.normalizePhone(phone));
      const uniqueNormalizedPhones = [...new Set(normalizedPhones)]; // Remove duplicates
      
      // Single MongoDB query to find all existing leads with these phone numbers
      const existingLeads = await Lead.find({
        phone: { $in: uniqueNormalizedPhones },
        status: { $nin: ['rejected', 'inactive'] } // ✅ Don't match rejected or inactive (deleted) leads
      }).lean();

      // Create a map for O(1) lookup: normalizedPhone -> existingLead
      const duplicatePhoneToLeadMap = new Map<string, ILead>();
      existingLeads.forEach(lead => {
        const phone = lead.phone;
        if (phone) {
          duplicatePhoneToLeadMap.set(phone, lead as unknown as ILead);
        }
      });

      logger.info('Bulk duplicate check completed', {
        checkedPhones: uniqueNormalizedPhones.length,
        foundDuplicates: duplicatePhoneToLeadMap.size
      });

      return duplicatePhoneToLeadMap;
    } catch (error: any) {
      logger.error('Bulk duplicate check error', {
        error: error.message,
        phoneCount: phoneNumbers.length
      });
      throw error;
    }
  }

  /**
   * Check if a phone number or landline already exists with the same category
   */
  static async checkPhoneCategoryDuplicate(
    contact: string, 
    primaryCategory: string, 
    secondaryCategory?: string
  ): Promise<DuplicateCheckResult> {
    try {
      const normalizedContact = this.normalizePhone(contact); // Try phone normalization first
      
      // Build query for exact category match - check both phone and landline fields
      const categoryQuery: any = {
        primaryCategory: primaryCategory,
        status: { $nin: ['rejected', 'inactive'] }
      };

      // If secondary category is provided, match it; otherwise check for missing or empty
      if (secondaryCategory && secondaryCategory.trim()) {
        categoryQuery.secondaryCategory = secondaryCategory.trim();
      } else {
        categoryQuery.$or = [
          { secondaryCategory: { $exists: false } },
          { secondaryCategory: '' },
          { secondaryCategory: null }
        ];
      }

      // Check in phone field
      const queryPhone = { ...categoryQuery, phone: normalizedContact };
      const existingLeadByPhone = await Lead.findOne(queryPhone).lean();

      if (existingLeadByPhone) {
        logger.info('Duplicate contact+category found (phone field)', {
          contact: normalizedContact,
          primaryCategory,
          secondaryCategory,
          existingLeadId: existingLeadByPhone.leadId
        });
        return {
          isDuplicate: true,
          existingLead: existingLeadByPhone as unknown as ILead,
          matchType: 'phone',
          sameCategory: true
        };
      }

      // Also check in landline field
      const normalizedLandline = this.normalizeLandline(contact);
      const queryLandline = { ...categoryQuery, landline: normalizedLandline };
      const existingLeadByLandline = await Lead.findOne(queryLandline).lean();

      if (existingLeadByLandline) {
        logger.info('Duplicate contact+category found (landline field)', {
          contact: normalizedLandline,
          primaryCategory,
          secondaryCategory,
          existingLeadId: existingLeadByLandline.leadId
        });
        return {
          isDuplicate: true,
          existingLead: existingLeadByLandline as unknown as ILead,
          matchType: 'phone',
          sameCategory: true
        };
      }

      return { isDuplicate: false, sameCategory: false };
    } catch (error: any) {
      logger.error('Contact+category duplicate check error', {
        error: error.message,
        contact,
        primaryCategory
      });
      throw error;
    }
  }

  /**
   * Check duplicate considering category (allows same person with different categories)
   * Supports both phone and landline
   */
  static async checkDuplicateWithCategory(
    contact: string, 
    primaryCategory: string,
    secondaryCategory?: string,
    name?: string, 
    city?: string
  ): Promise<DuplicateCheckResult> {
    // First check if same contact + same category exists
    const contactCategoryCheck = await this.checkPhoneCategoryDuplicate(
      contact, 
      primaryCategory, 
      secondaryCategory
    );
    
    if (contactCategoryCheck.isDuplicate) {
      return contactCategoryCheck;
    }

    // If different category, check if contact exists with different category (check both phone and landline fields)
    const normalizedContact = this.normalizePhone(contact);
    const normalizedLandline = this.normalizeLandline(contact);
    
    const existingLeadDifferentCategory = await Lead.findOne({
      $or: [
        { phone: normalizedContact },
        { landline: normalizedLandline }
      ],
      status: { $nin: ['rejected', 'inactive'] }
    }).lean();

    if (existingLeadDifferentCategory) {
      // Same phone but different category - this is allowed, but we return info
      logger.info('Same phone with different category found', {
        phone: normalizedContact,
        existingLeadId: existingLeadDifferentCategory.leadId,
        existingCategory: existingLeadDifferentCategory.primaryCategory,
        newCategory: primaryCategory
      });
      return {
        isDuplicate: false, // Not a duplicate because category is different
        existingLead: existingLeadDifferentCategory as unknown as ILead,
        matchType: 'phone',
        sameCategory: false
      };
    }

    // Check name+city if provided
    if (name && city) {
      const nameCityCheck = await this.checkNameCityDuplicate(name, city);
      if (nameCityCheck.isDuplicate) {
        return { ...nameCityCheck, sameCategory: false };
      }
    }

    return { isDuplicate: false, sameCategory: false };
  }

  /**
   * Bulk check for duplicate phones with categories (optimized - single query)
   * Returns a map of normalized phone -> existing leads array for O(1) lookup
   */
  static async checkPhonesBulkWithCategories(
    contacts: string[], 
    categories?: Map<string, { primary: string; secondary?: string }>
  ): Promise<Map<string, ILead[]>> {
    try {
      if (contacts.length === 0) {
        return new Map();
      }

      // Normalize all contacts (try phone normalization first, then landline)
      const normalizedContacts = contacts.map(contact => {
        // Try phone normalization first (for 10-digit numbers)
        const phoneNormalized = this.normalizePhone(contact);
        // Also try landline normalization
        const landlineNormalized = this.normalizeLandline(contact);
        return { phoneNormalized, landlineNormalized, original: contact };
      });
      
      const uniqueNormalizedPhones = [...new Set(normalizedContacts.map(c => c.phoneNormalized))];
      const uniqueNormalizedLandlines = [...new Set(normalizedContacts.map(c => c.landlineNormalized))];
      
      // Single MongoDB query to find all existing leads with these contacts (check both phone and landline fields)
      const existingLeads = await Lead.find({
        $or: [
          { phone: { $in: uniqueNormalizedPhones } },
          { landline: { $in: uniqueNormalizedLandlines } }
        ],
        status: { $nin: ['rejected', 'inactive'] }
      }).lean();

      // Create a map for O(1) lookup: normalizedContact -> existingLeads[]
      const contactToLeadsMap = new Map<string, ILead[]>();
      existingLeads.forEach(lead => {
        // Add to map using phone if present
        if (lead.phone) {
          if (!contactToLeadsMap.has(lead.phone)) {
            contactToLeadsMap.set(lead.phone, []);
          }
          contactToLeadsMap.get(lead.phone)!.push(lead as unknown as ILead);
        }
        // Add to map using landline if present
        if (lead.landline) {
          if (!contactToLeadsMap.has(lead.landline)) {
            contactToLeadsMap.set(lead.landline, []);
          }
          contactToLeadsMap.get(lead.landline)!.push(lead as unknown as ILead);
        }
      });

      logger.info('Bulk duplicate check with categories completed', {
        checkedContacts: contacts.length,
        foundLeads: contactToLeadsMap.size
      });

      return contactToLeadsMap;
    } catch (error: any) {
      logger.error('Bulk duplicate check with categories error', {
        error: error.message,
        contactCount: contacts.length
      });
      throw error;
    }
  }

  /**
   * Mark lead as duplicate
   */
  static async markAsDuplicate(leadId: string, duplicateOf: string): Promise<void> {
    try {
      await Lead.updateOne(
        { leadId },
        {
          isDuplicate: true,
          duplicateOf
        }
      );
      logger.info('Lead marked as duplicate', { leadId, duplicateOf });
    } catch (error: any) {
      logger.error('Error marking lead as duplicate', {
        error: error.message,
        leadId,
        duplicateOf
      });
      throw error;
    }
  }
}






