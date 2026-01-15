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
            const existingLead = await Lead_1.default.findOne({
                phone: normalizedPhone,
                status: { $nin: ['rejected', 'inactive'] } // ✅ Don't match rejected or inactive (deleted) leads
            }).lean();
            if (existingLead) {
                logger_1.default.info('Duplicate phone found', {
                    phone: normalizedPhone,
                    existingLeadId: existingLead.leadId
                });
                return {
                    isDuplicate: true,
                    existingLead: existingLead,
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
                    { status: { $nin: ['rejected', 'inactive'] } } // ✅ Don't match rejected or inactive (deleted) leads
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
     * Comprehensive duplicate check
     */
    static async checkDuplicate(phone, name, city) {
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
                status: { $nin: ['rejected', 'inactive'] } // ✅ Don't match rejected or inactive (deleted) leads
            }).lean();
            // Create a map for O(1) lookup: normalizedPhone -> existingLead
            const duplicatePhoneToLeadMap = new Map();
            existingLeads.forEach(lead => {
                duplicatePhoneToLeadMap.set(lead.phone, lead);
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