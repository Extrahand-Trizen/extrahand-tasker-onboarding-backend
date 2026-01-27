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
      
      const existingLead = await Lead.findOne({
        phone: normalizedPhone,
        status: { $nin: ['rejected', 'inactive'] } // ✅ Don't match rejected or inactive (deleted) leads
      }).lean();

      if (existingLead) {
        logger.info('Duplicate phone found', {
          phone: normalizedPhone,
          existingLeadId: existingLead.leadId
        });
        return {
          isDuplicate: true,
          existingLead: existingLead as unknown as ILead,
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
   * Comprehensive duplicate check
   */
  static async checkDuplicate(phone: string, name?: string, city?: string): Promise<DuplicateCheckResult> {
    // First check phone (most reliable)
    const phoneCheck = await this.checkPhoneDuplicate(phone);
    if (phoneCheck.isDuplicate) {
      return phoneCheck;
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
        duplicatePhoneToLeadMap.set(lead.phone, lead as unknown as ILead);
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
   * Check if a phone number already exists with the same category
   */
  static async checkPhoneCategoryDuplicate(
    phone: string, 
    primaryCategory: string, 
    secondaryCategory?: string
  ): Promise<DuplicateCheckResult> {
    try {
      const normalizedPhone = this.normalizePhone(phone);
      
      // Build query for exact category match
      const query: any = {
        phone: normalizedPhone,
        primaryCategory: primaryCategory,
        status: { $nin: ['rejected', 'inactive'] }
      };

      // If secondary category is provided, match it; otherwise check for missing or empty
      if (secondaryCategory && secondaryCategory.trim()) {
        query.secondaryCategory = secondaryCategory.trim();
      } else {
        query.$or = [
          { secondaryCategory: { $exists: false } },
          { secondaryCategory: '' },
          { secondaryCategory: null }
        ];
      }
      
      const existingLead = await Lead.findOne(query).lean();

      if (existingLead) {
        logger.info('Duplicate phone+category found', {
          phone: normalizedPhone,
          primaryCategory,
          secondaryCategory,
          existingLeadId: existingLead.leadId
        });
        return {
          isDuplicate: true,
          existingLead: existingLead as unknown as ILead,
          matchType: 'phone',
          sameCategory: true
        };
      }

      return { isDuplicate: false, sameCategory: false };
    } catch (error: any) {
      logger.error('Phone+category duplicate check error', {
        error: error.message,
        phone,
        primaryCategory
      });
      throw error;
    }
  }

  /**
   * Check duplicate considering category (allows same person with different categories)
   */
  static async checkDuplicateWithCategory(
    phone: string, 
    primaryCategory: string,
    secondaryCategory?: string,
    name?: string, 
    city?: string
  ): Promise<DuplicateCheckResult> {
    // First check if same phone + same category exists
    const phoneCategoryCheck = await this.checkPhoneCategoryDuplicate(
      phone, 
      primaryCategory, 
      secondaryCategory
    );
    
    if (phoneCategoryCheck.isDuplicate) {
      return phoneCategoryCheck;
    }

    // If different category, check if phone exists with different category
    const normalizedPhone = this.normalizePhone(phone);
    const existingLeadDifferentCategory = await Lead.findOne({
      phone: normalizedPhone,
      status: { $nin: ['rejected', 'inactive'] }
    }).lean();

    if (existingLeadDifferentCategory) {
      // Same phone but different category - this is allowed, but we return info
      logger.info('Same phone with different category found', {
        phone: normalizedPhone,
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
    phoneNumbers: string[], 
    categories?: Map<string, { primary: string; secondary?: string }>
  ): Promise<Map<string, ILead[]>> {
    try {
      if (phoneNumbers.length === 0) {
        return new Map();
      }

      // Normalize all phone numbers
      const normalizedPhones = phoneNumbers.map(phone => this.normalizePhone(phone));
      const uniqueNormalizedPhones = [...new Set(normalizedPhones)];
      
      // Single MongoDB query to find all existing leads with these phone numbers
      // Include skills array to check for existing skills during bulk import
      const existingLeads = await Lead.find({
        phone: { $in: uniqueNormalizedPhones },
        status: { $nin: ['rejected', 'inactive'] }
      })
      .select('leadId phone name primaryCategory primarySkill secondaryCategory secondarySkill skills')
      .lean();

      // Create a map for O(1) lookup: normalizedPhone -> existingLeads[]
      const phoneToLeadsMap = new Map<string, ILead[]>();
      existingLeads.forEach(lead => {
        const phone = lead.phone;
        if (!phoneToLeadsMap.has(phone)) {
          phoneToLeadsMap.set(phone, []);
        }
        phoneToLeadsMap.get(phone)!.push(lead as unknown as ILead);
      });

      logger.info('Bulk duplicate check with categories completed', {
        checkedPhones: uniqueNormalizedPhones.length,
        foundLeads: phoneToLeadsMap.size
      });

      return phoneToLeadsMap;
    } catch (error: any) {
      logger.error('Bulk duplicate check with categories error', {
        error: error.message,
        phoneCount: phoneNumbers.length
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






