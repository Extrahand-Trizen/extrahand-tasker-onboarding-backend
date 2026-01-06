"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalService = void 0;
const Lead_1 = __importDefault(require("../models/Lead"));
const logger_1 = __importDefault(require("../config/logger"));
class ApprovalService {
    /**
     * Check if a lead meets approval criteria
     */
    static checkApprovalCriteria(lead) {
        const missingRequirements = [];
        // Check required documents
        const hasAadhaar = lead.documents.some(doc => doc.type === 'aadhaar');
        const hasPan = lead.documents.some(doc => doc.type === 'pan');
        const hasAddressProof = lead.documents.some(doc => doc.type === 'address_proof');
        const hasRequiredDocuments = hasAadhaar && hasPan && hasAddressProof;
        if (!hasRequiredDocuments) {
            if (!hasAadhaar)
                missingRequirements.push('Aadhaar document');
            if (!hasPan)
                missingRequirements.push('PAN document');
            if (!hasAddressProof)
                missingRequirements.push('Address proof document');
        }
        // Check if documents are verified
        const verifiedAadhaar = lead.documents.find(doc => doc.type === 'aadhaar')?.status === 'verified';
        const verifiedPan = lead.documents.find(doc => doc.type === 'pan')?.status === 'verified';
        const verifiedAddressProof = lead.documents.find(doc => doc.type === 'address_proof')?.status === 'verified';
        const hasVerifiedDocuments = verifiedAadhaar && verifiedPan && verifiedAddressProof;
        if (!hasVerifiedDocuments) {
            if (!verifiedAadhaar)
                missingRequirements.push('Aadhaar verification');
            if (!verifiedPan)
                missingRequirements.push('PAN verification');
            if (!verifiedAddressProof)
                missingRequirements.push('Address proof verification');
        }
        // Check if skills are assigned
        const hasSkills = lead.skills.length > 0 || lead.primarySkill.length > 0;
        if (!hasSkills) {
            missingRequirements.push('At least one skill');
        }
        // Check required fields
        const hasRequiredFields = !!(lead.name &&
            lead.phone &&
            lead.city &&
            lead.primarySkill);
        if (!hasRequiredFields) {
            missingRequirements.push('Complete required fields (name, phone, city, primary skill)');
        }
        // Check blacklist
        const isNotBlacklisted = !lead.blacklisted;
        if (lead.blacklisted) {
            missingRequirements.push('Lead is blacklisted');
        }
        // Check duplicate
        const isNotDuplicate = !lead.isDuplicate;
        if (lead.isDuplicate) {
            missingRequirements.push('Lead is marked as duplicate');
        }
        // Can approve if all criteria met
        const canApprove = hasRequiredDocuments &&
            hasVerifiedDocuments &&
            hasSkills &&
            hasRequiredFields &&
            isNotBlacklisted &&
            isNotDuplicate;
        return {
            hasRequiredDocuments,
            hasVerifiedDocuments,
            hasSkills,
            hasRequiredFields,
            isNotBlacklisted,
            isNotDuplicate,
            missingRequirements,
            canApprove
        };
    }
    /**
     * Get leads ready for approval (under_verification status)
     */
    static async getApprovalQueue(filters) {
        try {
            const page = filters?.page || 1;
            const limit = filters?.limit || 50;
            const skip = (page - 1) * limit;
            const query = {
                status: 'under_verification'
            };
            if (filters?.city) {
                query.city = new RegExp(filters.city, 'i');
            }
            if (filters?.primarySkill) {
                query.primarySkill = new RegExp(filters.primarySkill, 'i');
            }
            const [leads, total] = await Promise.all([
                Lead_1.default.find(query)
                    .sort({ updatedAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Lead_1.default.countDocuments(query)
            ]);
            return {
                leads: leads,
                total,
                page,
                limit
            };
        }
        catch (error) {
            logger_1.default.error('Error fetching approval queue', {
                error: error.message,
                filters
            });
            throw error;
        }
    }
    /**
     * Get leads ready for activation (approved status)
     */
    static async getActivationQueue(filters) {
        try {
            const page = filters?.page || 1;
            const limit = filters?.limit || 50;
            const skip = (page - 1) * limit;
            // First, let's check how many approved leads exist (for debugging)
            const allApprovedCount = await Lead_1.default.countDocuments({ status: 'approved' });
            logger_1.default.info('Total approved leads in database', { count: allApprovedCount });
            // Query for approved leads that haven't been activated yet
            // A lead is activated if activationData.firebaseUid exists and is not empty
            // Simplified query: status approved AND (no activationData OR no valid firebaseUid)
            const baseQuery = {
                status: 'approved'
            };
            // Add activation check - lead is NOT activated if:
            // 1. activationData doesn't exist, OR
            // 2. activationData.firebaseUid doesn't exist, OR  
            // 3. activationData.firebaseUid is null/empty
            baseQuery.$or = [
                { activationData: { $exists: false } },
                { 'activationData.firebaseUid': { $exists: false } },
                { 'activationData.firebaseUid': null },
                { 'activationData.firebaseUid': '' }
            ];
            // Apply filters
            if (filters?.city) {
                baseQuery.city = new RegExp(filters.city, 'i');
            }
            if (filters?.primarySkill) {
                baseQuery.primarySkill = new RegExp(filters.primarySkill, 'i');
            }
            const query = baseQuery;
            logger_1.default.debug('Activation queue query', {
                query: JSON.stringify(query),
                filters
            });
            const [leads, total] = await Promise.all([
                Lead_1.default.find(query)
                    .sort({ updatedAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Lead_1.default.countDocuments(query)
            ]);
            logger_1.default.info('Activation queue query result', {
                totalApproved: allApprovedCount,
                totalReadyForActivation: total,
                leadsReturned: leads.length,
                query: JSON.stringify(query),
                sampleLeadIds: leads.slice(0, 5).map((l) => ({ leadId: l.leadId, status: l.status, hasActivationData: !!l.activationData, firebaseUid: l.activationData?.firebaseUid }))
            });
            return {
                leads: leads,
                total,
                page,
                limit
            };
        }
        catch (error) {
            logger_1.default.error('Error fetching activation queue', {
                error: error.message,
                stack: error.stack,
                filters
            });
            throw error;
        }
    }
}
exports.ApprovalService = ApprovalService;
//# sourceMappingURL=ApprovalService.js.map