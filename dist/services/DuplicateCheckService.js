"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DuplicateCheckService = void 0;
const Lead_1 = __importDefault(require("../models/Lead"));
const logger_1 = __importDefault(require("../config/logger"));
class DuplicateCheckService {
    /**
     * Check if a phone number already exists in leads
     */
    static async checkPhoneDuplicate(phone) {
        try {
            // Normalize phone number (remove spaces, dashes, country code)
            const normalizedPhone = this.normalizePhone(phone);
            // Check in phone field
            const existingLeadByPhone = await Lead_1.default.findOne({
                phone: normalizedPhone,
                status: { $nin: ['inactive'] } // Don't match inactive (archived) leads
            }).lean();
            if (existingLeadByPhone) {
                logger_1.default.info('Duplicate phone found', {
                    phone: normalizedPhone,
                    existingLeadId: existingLeadByPhone.leadId
                });
                return {
                    isDuplicate: true,
                    existingLead: existingLeadByPhone,
                    matchType: 'phone'
                };
            }
            // Also check in landline field (cross-field duplicate check)
            const existingLeadByLandline = await Lead_1.default.findOne({
                landline: normalizedPhone,
                status: { $nin: ['inactive'] }
            }).lean();
            if (existingLeadByLandline) {
                logger_1.default.info('Duplicate phone found in landline field', {
                    phone: normalizedPhone,
                    existingLeadId: existingLeadByLandline.leadId
                });
                return {
                    isDuplicate: true,
                    existingLead: existingLeadByLandline,
                    matchType: 'phone'
                };
            }
            return { isDuplicate: false };
        }
        catch (error) {
            logger_1.default.error('Duplicate check error', {
                error: error.message,
                phone
            });
            throw error;
        }
    }
    /**
     * Check if a landline number already exists in leads
     */
    static async checkLandlineDuplicate(landline) {
        try {
            // Normalize landline number
            const normalizedLandline = this.normalizeLandline(landline);
            // Check in landline field
            const existingLeadByLandline = await Lead_1.default.findOne({
                landline: normalizedLandline,
                status: { $nin: ['inactive'] }
            }).lean();
            if (existingLeadByLandline) {
                logger_1.default.info('Duplicate landline found', {
                    landline: normalizedLandline,
                    existingLeadId: existingLeadByLandline.leadId
                });
                return {
                    isDuplicate: true,
                    existingLead: existingLeadByLandline,
                    matchType: 'phone' // Using 'phone' for consistency
                };
            }
            // Also check in phone field (cross-field duplicate check)
            const existingLeadByPhone = await Lead_1.default.findOne({
                phone: normalizedLandline,
                status: { $nin: ['inactive'] }
            }).lean();
            if (existingLeadByPhone) {
                logger_1.default.info('Duplicate landline found in phone field', {
                    landline: normalizedLandline,
                    existingLeadId: existingLeadByPhone.leadId
                });
                return {
                    isDuplicate: true,
                    existingLead: existingLeadByPhone,
                    matchType: 'phone'
                };
            }
            return { isDuplicate: false };
        }
        catch (error) {
            logger_1.default.error('Landline duplicate check error', {
                error: error.message,
                landline
            });
            throw error;
        }
    }
    /**
     * Check for duplicate by name and city (fuzzy match)
     */
    static async checkNameCityDuplicate(name, city) {
        try {
            const normalizedName = name.toLowerCase().trim();
            const normalizedCity = city.toLowerCase().trim();
            const existingLead = await Lead_1.default.findOne({
                $and: [
                    { name: { $regex: new RegExp(normalizedName, 'i') } },
                    { city: { $regex: new RegExp(normalizedCity, 'i') } },
                    { status: { $nin: ['inactive'] } }
                ]
            }).lean();
            if (existingLead) {
                logger_1.default.info('Duplicate name+city found', {
                    name,
                    city,
                    existingLeadId: existingLead.leadId
                });
                return {
                    isDuplicate: true,
                    existingLead: existingLead,
                    matchType: 'name_city'
                };
            }
            return { isDuplicate: false };
        }
        catch (error) {
            logger_1.default.error('Name+city duplicate check error', {
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
    static async checkDuplicate(phone, landline, name, city) {
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
    static normalizePhone(phone) {
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
    static normalizeLandline(landline) {
        // Remove all non-digit characters
        return landline.replace(/\D/g, '');
    }
    /**
     * Bulk check for duplicate phones (optimized - single query)
     * Returns a map of normalized phone -> existing lead for O(1) lookup
     */
    static async checkPhonesBulk(phoneNumbers) {
        try {
            if (phoneNumbers.length === 0) {
                return new Map();
            }
            // Normalize all phone numbers
            const normalizedPhones = phoneNumbers.map(phone => this.normalizePhone(phone));
            const uniqueNormalizedPhones = [...new Set(normalizedPhones)]; // Remove duplicates
            // Single MongoDB query to find all existing leads with these phone numbers
            const existingLeads = await Lead_1.default.find({
                phone: { $in: uniqueNormalizedPhones },
                status: { $nin: ['inactive'] } // Don't match inactive (archived) leads
            }).lean();
            // Create a map for O(1) lookup: normalizedPhone -> existingLead
            const duplicatePhoneToLeadMap = new Map();
            existingLeads.forEach(lead => {
                const phone = lead.phone;
                if (phone) {
                    duplicatePhoneToLeadMap.set(phone, lead);
                }
            });
            logger_1.default.info('Bulk duplicate check completed', {
                checkedPhones: uniqueNormalizedPhones.length,
                foundDuplicates: duplicatePhoneToLeadMap.size
            });
            return duplicatePhoneToLeadMap;
        }
        catch (error) {
            logger_1.default.error('Bulk duplicate check error', {
                error: error.message,
                phoneCount: phoneNumbers.length
            });
            throw error;
        }
    }
    /**
     * Check if a phone number or landline already exists with the same category
     */
    static async checkPhoneCategoryDuplicate(contact, primaryCategory, secondaryCategory) {
        try {
            const normalizedContact = this.normalizePhone(contact); // Try phone normalization first
            // Build query for exact category match - check both phone and landline fields
            const categoryQuery = {
                primaryCategory: primaryCategory,
                status: { $nin: ['inactive'] }
            };
            // If secondary category is provided, match it; otherwise check for missing or empty
            if (secondaryCategory && secondaryCategory.trim()) {
                categoryQuery.secondaryCategory = secondaryCategory.trim();
            }
            else {
                categoryQuery.$or = [
                    { secondaryCategory: { $exists: false } },
                    { secondaryCategory: '' },
                    { secondaryCategory: null }
                ];
            }
            // Check in phone field
            const queryPhone = { ...categoryQuery, phone: normalizedContact };
            const existingLeadByPhone = await Lead_1.default.findOne(queryPhone).lean();
            if (existingLeadByPhone) {
                logger_1.default.info('Duplicate contact+category found (phone field)', {
                    contact: normalizedContact,
                    primaryCategory,
                    secondaryCategory,
                    existingLeadId: existingLeadByPhone.leadId
                });
                return {
                    isDuplicate: true,
                    existingLead: existingLeadByPhone,
                    matchType: 'phone',
                    sameCategory: true
                };
            }
            // Also check in landline field
            const normalizedLandline = this.normalizeLandline(contact);
            const queryLandline = { ...categoryQuery, landline: normalizedLandline };
            const existingLeadByLandline = await Lead_1.default.findOne(queryLandline).lean();
            if (existingLeadByLandline) {
                logger_1.default.info('Duplicate contact+category found (landline field)', {
                    contact: normalizedLandline,
                    primaryCategory,
                    secondaryCategory,
                    existingLeadId: existingLeadByLandline.leadId
                });
                return {
                    isDuplicate: true,
                    existingLead: existingLeadByLandline,
                    matchType: 'phone',
                    sameCategory: true
                };
            }
            return { isDuplicate: false, sameCategory: false };
        }
        catch (error) {
            logger_1.default.error('Contact+category duplicate check error', {
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
    static async checkDuplicateWithCategory(contact, primaryCategory, secondaryCategory, name, city) {
        // First check if same contact + same category exists
        const contactCategoryCheck = await this.checkPhoneCategoryDuplicate(contact, primaryCategory, secondaryCategory);
        if (contactCategoryCheck.isDuplicate) {
            return contactCategoryCheck;
        }
        // If different category, check if contact exists with different category (check both phone and landline fields)
        const normalizedContact = this.normalizePhone(contact);
        const normalizedLandline = this.normalizeLandline(contact);
        const existingLeadDifferentCategory = await Lead_1.default.findOne({
            $or: [
                { phone: normalizedContact },
                { landline: normalizedLandline }
            ],
            status: { $nin: ['inactive'] }
        }).lean();
        if (existingLeadDifferentCategory) {
            // Same phone but different category - this is allowed, but we return info
            logger_1.default.info('Same phone with different category found', {
                phone: normalizedContact,
                existingLeadId: existingLeadDifferentCategory.leadId,
                existingCategory: existingLeadDifferentCategory.primaryCategory,
                newCategory: primaryCategory
            });
            return {
                isDuplicate: false, // Not a duplicate because category is different
                existingLead: existingLeadDifferentCategory,
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
    static async checkPhonesBulkWithCategories(contacts, categories) {
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
            const existingLeads = await Lead_1.default.find({
                $or: [
                    { phone: { $in: uniqueNormalizedPhones } },
                    { landline: { $in: uniqueNormalizedLandlines } }
                ],
                status: { $nin: ['inactive'] }
            }).lean();
            // Create a map for O(1) lookup: normalizedContact -> existingLeads[]
            const contactToLeadsMap = new Map();
            existingLeads.forEach(lead => {
                // Add to map using phone if present
                if (lead.phone) {
                    if (!contactToLeadsMap.has(lead.phone)) {
                        contactToLeadsMap.set(lead.phone, []);
                    }
                    contactToLeadsMap.get(lead.phone).push(lead);
                }
                // Add to map using landline if present
                if (lead.landline) {
                    if (!contactToLeadsMap.has(lead.landline)) {
                        contactToLeadsMap.set(lead.landline, []);
                    }
                    contactToLeadsMap.get(lead.landline).push(lead);
                }
            });
            logger_1.default.info('Bulk duplicate check with categories completed', {
                checkedContacts: contacts.length,
                foundLeads: contactToLeadsMap.size
            });
            return contactToLeadsMap;
        }
        catch (error) {
            logger_1.default.error('Bulk duplicate check with categories error', {
                error: error.message,
                contactCount: contacts.length
            });
            throw error;
        }
    }
    /**
     * Mark lead as duplicate
     */
    static async markAsDuplicate(leadId, duplicateOf) {
        try {
            await Lead_1.default.updateOne({ leadId }, {
                isDuplicate: true,
                duplicateOf
            });
            logger_1.default.info('Lead marked as duplicate', { leadId, duplicateOf });
        }
        catch (error) {
            logger_1.default.error('Error marking lead as duplicate', {
                error: error.message,
                leadId,
                duplicateOf
            });
            throw error;
        }
    }
}
exports.DuplicateCheckService = DuplicateCheckService;
//# sourceMappingURL=DuplicateCheckService.js.map