"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivationService = void 0;
const firebase_1 = require("../config/firebase");
const Lead_1 = __importDefault(require("../models/Lead"));
const LeadService_1 = require("./LeadService");
const logger_1 = __importDefault(require("../config/logger"));
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
class ActivationService {
    /**
     * Activate a single lead (create Firebase user + Profile)
     */
    static async activateLead(leadId, activatedBy, activatedByName, role) {
        try {
            const lead = await Lead_1.default.findOne({ leadId });
            if (!lead) {
                throw new Error('Lead not found');
            }
            // Check if already activated
            if (lead.activationData?.firebaseUid) {
                throw new Error('Lead already activated');
            }
            // Check status
            if (lead.status !== 'approved') {
                throw new Error(`Lead must be approved before activation. Current status: ${lead.status}`);
            }
            // Generate temporary password (user can reset later)
            const tempPassword = this.generateTempPassword();
            // Check if user with this email already exists
            let userRecord;
            let existingUser = false;
            if (lead.email) {
                try {
                    // Try to get existing user by email
                    userRecord = await firebase_1.auth.getUserByEmail(lead.email);
                    existingUser = true;
                    logger_1.default.info('Found existing Firebase user for lead email', {
                        leadId,
                        firebaseUid: userRecord.uid,
                        email: lead.email
                    });
                }
                catch (error) {
                    // User doesn't exist, we'll create a new one
                    if (error.code !== 'auth/user-not-found') {
                        throw error; // Re-throw if it's a different error
                    }
                }
            }
            // Create new Firebase user if one doesn't exist
            if (!userRecord) {
                try {
                    userRecord = await firebase_1.auth.createUser({
                        email: lead.email || `user_${Date.now()}@extrahand.temp`,
                        password: tempPassword,
                        displayName: lead.name,
                        phoneNumber: lead.phone ? `+91${lead.phone}` : undefined,
                        emailVerified: false,
                        disabled: false
                    });
                    logger_1.default.info('Firebase user created for lead', {
                        leadId,
                        firebaseUid: userRecord.uid
                    });
                }
                catch (error) {
                    // If email conflict, try with temp email
                    if (error.code === 'auth/email-already-exists' || error.message?.includes('already in use')) {
                        logger_1.default.warn('Email already exists, using temp email', {
                            leadId,
                            email: lead.email
                        });
                        userRecord = await firebase_1.auth.createUser({
                            email: `user_${lead.phone || Date.now()}@extrahand.temp`,
                            password: tempPassword,
                            displayName: lead.name,
                            phoneNumber: lead.phone ? `+91${lead.phone}` : undefined,
                            emailVerified: false,
                            disabled: false
                        });
                        logger_1.default.info('Firebase user created with temp email', {
                            leadId,
                            firebaseUid: userRecord.uid,
                            tempEmail: userRecord.email
                        });
                    }
                    else {
                        throw error;
                    }
                }
            }
            // Check if profile already exists with this phone number
            if (lead.phone) {
                try {
                    // Normalize phone number (ensure +91 prefix format)
                    const normalizedPhone = lead.phone.replace(/\D/g, ''); // Remove non-digits
                    const formattedPhone = normalizedPhone.startsWith('91')
                        ? `+${normalizedPhone}`
                        : `+91${normalizedPhone}`;
                    // Check if profile exists via user service API
                    if (!env_1.env.USER_SERVICE_URL) {
                        throw new Error('USER_SERVICE_URL is required for phone check but not configured');
                    }
                    const checkResponse = await axios_1.default.post(`${env_1.env.USER_SERVICE_URL}/api/v1/auth/check-phone`, { phone: formattedPhone }, {
                        headers: {
                            'X-Service-Auth': env_1.env.SERVICE_AUTH_TOKEN,
                            'X-Service-Name': 'admin-service'
                        }
                    });
                    if (checkResponse.data?.exists) {
                        throw new Error(`Profile already exists with phone number ${formattedPhone}. Cannot create duplicate profile.`);
                    }
                    logger_1.default.debug('Phone number check passed - no existing profile found', {
                        leadId,
                        phone: formattedPhone
                    });
                }
                catch (error) {
                    // If the error is about existing profile, re-throw it
                    if (error.message?.includes('already exists') || error.message?.includes('Profile already exists')) {
                        throw error;
                    }
                    // If check-phone endpoint doesn't exist or returns different format, log and continue
                    // We'll let the profile creation fail if there's a duplicate
                    logger_1.default.warn('Could not check phone existence, proceeding with activation', {
                        leadId,
                        phone: lead.phone,
                        error: error.message
                    });
                }
            }
            // Extract Aadhaar, PAN, Address, and Photo from lead documents
            // ✅ Extract verified documents for onboarding activation
            // This is ONLY for the onboarding system - doesn't affect mobile/website verification flows
            const aadhaarDoc = lead.documents?.find(doc => doc.type === 'aadhaar' && doc.status === 'verified');
            const panDoc = lead.documents?.find(doc => doc.type === 'pan' && doc.status === 'verified');
            const addressDoc = lead.documents?.find(doc => doc.type === 'address_proof' && doc.status === 'verified');
            const photoDoc = lead.documents?.find(doc => doc.type === 'photo' && doc.status === 'verified');
            // ✅ Check if verified documents exist (for setting profile flags)
            // Set flags based on document existence and verification status, not just exact details
            const hasAadhaar = !!aadhaarDoc && aadhaarDoc.status === 'verified';
            const hasPAN = !!panDoc && panDoc.status === 'verified';
            const hasAddress = !!addressDoc && addressDoc.status === 'verified';
            // ✅ Extract exact details (unmasked) for storage in verification service
            // Prefer exact details (entered during verification) over masked values
            // Exact details are entered by operations/admin during document verification
            const exactAadhaar = aadhaarDoc?.exactAadhaarNumber || aadhaarDoc?.aadhaarNumber;
            const exactPAN = panDoc?.exactPANNumber || panDoc?.panNumber;
            const exactAddress = addressDoc?.exactAddressDetails || addressDoc?.addressDetails;
            // ✅ Extract photo URL if photo document exists and is verified
            const photoURL = photoDoc?.url || null;
            logger_1.default.info('Extracting verification data for account creation (onboarding flow only)', {
                leadId,
                hasAadhaarDoc: !!aadhaarDoc,
                hasPanDoc: !!panDoc,
                hasAddressDoc: !!addressDoc,
                hasPhotoDoc: !!photoDoc,
                hasAadhaar: hasAadhaar,
                hasPAN: hasPAN,
                hasAddress: hasAddress,
                hasPhoto: !!photoURL,
                hasExactAadhaar: !!aadhaarDoc?.exactAadhaarNumber,
                hasExactPAN: !!panDoc?.exactPANNumber,
                hasExactAddress: !!addressDoc?.exactAddressDetails,
                hasMaskedAadhaar: !!aadhaarDoc?.aadhaarNumber,
                hasMaskedPAN: !!panDoc?.panNumber,
                aadhaarDocStatus: aadhaarDoc?.status,
                panDocStatus: panDoc?.status,
                photoDocStatus: photoDoc?.status
            });
            // ✅ Extract verification timestamps from documents
            const aadhaarVerifiedAt = aadhaarDoc?.verifiedAt ? new Date(aadhaarDoc.verifiedAt).toISOString() : null;
            const panVerifiedAt = panDoc?.verifiedAt ? new Date(panDoc.verifiedAt).toISOString() : null;
            // ✅ Set isVerified flag: true if any verification exists (Aadhaar or PAN)
            const isVerified = hasAadhaar || hasPAN;
            // ✅ Calculate verification tier and badge
            // Tier 0: No verification
            // Tier 1: Basic (Aadhaar only)
            // Tier 2: Verified (Aadhaar + PAN)
            // Tier 3: Trusted (Aadhaar + Face - not applicable here)
            let verificationTier = 0;
            let verificationBadge = 'none';
            if (hasAadhaar && hasPAN) {
                verificationTier = 2;
                verificationBadge = 'verified';
            }
            else if (hasAadhaar) {
                verificationTier = 1;
                verificationBadge = 'basic';
            }
            // Create Profile in MongoDB via User Service API
            const profileData = {
                uid: userRecord.uid,
                name: lead.name,
                email: lead.email || null,
                phone: lead.phone || null,
                emailVerified: false,
                roles: ['both'],
                userType: 'individual',
                location: {
                    city: lead.city,
                    state: lead.state || null,
                    // ✅ Use exact address from verified document if available, otherwise use lead address
                    address: exactAddress || lead.address || null
                },
                skills: {
                    list: lead.skills.map(skill => ({
                        name: skill.name,
                        category: skill.category || null,
                        level: skill.level || null,
                        toolsAvailable: skill.toolsAvailable || false
                    })),
                    primary: lead.primarySkill
                },
                // ✅ Verification flags - properly set based on document verification status
                isVerified: isVerified, // True if any verification exists
                isAadhaarVerified: hasAadhaar, // Only true if Aadhaar document exists and is verified
                aadhaarVerifiedAt: aadhaarVerifiedAt, // Timestamp from document verification
                isPANVerified: hasPAN, // Only true if PAN document exists and is verified
                isBankVerified: false, // Bank verification not handled in onboarding flow
                isFaceVerified: false, // Face verification not handled in onboarding flow
                // ✅ Verification tier and badge
                verificationTier: verificationTier,
                verificationBadge: verificationBadge,
                lastVerifiedAt: isVerified ? (aadhaarVerifiedAt || panVerifiedAt) : null,
                availability: null,
                photoURL: photoURL, // ✅ Use photo URL from verified photo document if available
                rating: 0,
                agreeUpdates: false,
                agreeTerms: false
            };
            let profileCreated = false;
            try {
                await axios_1.default.post(`${env_1.env.USER_SERVICE_URL}/api/v1/profiles`, profileData, {
                    headers: {
                        'X-Service-Auth': env_1.env.SERVICE_AUTH_TOKEN,
                        'X-Service-Name': 'admin-service',
                        'X-User-Id': userRecord.uid
                    }
                });
                profileCreated = true;
                logger_1.default.info('Profile created for lead', { leadId, firebaseUid: userRecord.uid });
                // ✅ Store exact details (unmasked) in verification service
                // These will be used for user verification and profile creation
                if (hasAadhaar || hasPAN || hasAddress) {
                    try {
                        // ✅ Store exact details (unmasked) in verification service
                        // These will be used for user verification and profile creation
                        await this.storeVerificationData(userRecord.uid, {
                            aadhaarNumber: exactAadhaar,
                            panNumber: exactPAN,
                            addressDetails: exactAddress
                        });
                        logger_1.default.info('Verification data stored for activated lead', {
                            leadId,
                            firebaseUid: userRecord.uid,
                            hasAadhaar,
                            hasPAN
                        });
                    }
                    catch (verificationError) {
                        logger_1.default.warn('Failed to store verification data for activated lead', {
                            leadId,
                            firebaseUid: userRecord.uid,
                            error: verificationError.message
                        });
                        // Don't fail activation if verification storage fails
                    }
                }
            }
            catch (profileError) {
                logger_1.default.error('Failed to create profile, but Firebase user created', {
                    leadId,
                    firebaseUid: userRecord.uid,
                    error: profileError.message
                });
                // Continue - profile can be created later
            }
            // Update lead with activation data
            lead.activationData = {
                activatedAt: new Date(),
                firebaseUid: userRecord.uid,
                profileCreated
            };
            // Update status to activated
            // Use 'operations' role for activation (system-initiated status change)
            // This allows activation regardless of the user's role, since activation is a system operation
            const userRole = role || 'operations';
            await LeadService_1.LeadService.updateStatus(leadId, {
                status: 'activated',
                notes: `Lead activated. Firebase UID: ${userRecord.uid}`,
                changedBy: activatedBy,
                changedByName: activatedByName
            }, userRole);
            logger_1.default.info('Lead activated successfully', {
                leadId,
                firebaseUid: userRecord.uid,
                profileCreated
            });
            return {
                success: true,
                firebaseUid: userRecord.uid,
                profileCreated
            };
        }
        catch (error) {
            logger_1.default.error('Error activating lead', {
                error: error.message,
                leadId
            });
            return {
                success: false,
                error: error.message
            };
        }
    }
    /**
     * Bulk activate leads
     */
    static async bulkActivateLeads(leadIds, activatedBy, activatedByName, role) {
        const success = [];
        const failed = [];
        // Process in batches to avoid overwhelming Firebase
        const BATCH_SIZE = 10;
        for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
            const batch = leadIds.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(batch.map(leadId => this.activateLead(leadId, activatedBy, activatedByName, role)));
            results.forEach((result, index) => {
                const leadId = batch[index];
                if (result.status === 'fulfilled' && result.value.success) {
                    success.push({
                        leadId,
                        firebaseUid: result.value.firebaseUid,
                        profileCreated: result.value.profileCreated || false
                    });
                }
                else {
                    const error = result.status === 'rejected'
                        ? result.reason?.message || 'Activation failed'
                        : result.value.error || 'Activation failed';
                    failed.push({ leadId, error });
                }
            });
            // Small delay between batches
            if (i + BATCH_SIZE < leadIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        logger_1.default.info('Bulk activation completed', {
            total: leadIds.length,
            success: success.length,
            failed: failed.length
        });
        return { success, failed };
    }
    /**
     * Store exact Aadhaar/PAN/Address data in verification service
     * Uses exact (unmasked) details entered during document verification
     * Made public to allow immediate updates when documents are verified for existing accounts
     */
    static async storeVerificationData(uid, data) {
        if (!env_1.env.VERIFICATION_SERVICE_URL) {
            logger_1.default.warn('VERIFICATION_SERVICE_URL not configured, skipping verification data storage');
            return;
        }
        const verificationRecords = [];
        // Process Aadhaar
        if (data.aadhaarNumber) {
            // ✅ Store exact value (verification service will handle masking if needed)
            // Note: Verification service currently expects maskedValue, but we're sending exact
            // The service should be updated to accept exact values, or we mask here
            // For now, if it's already masked (contains X), use as is, otherwise mask it
            let aadhaarValue = data.aadhaarNumber;
            if (!aadhaarValue.includes('X')) {
                // It's an exact value, mask it: XXXX XXXX 1234
                const cleaned = aadhaarValue.replace(/\D/g, '');
                if (cleaned.length === 12) {
                    aadhaarValue = `XXXX XXXX ${cleaned.slice(8)}`;
                }
            }
            verificationRecords.push({ type: 'aadhaar', maskedValue: aadhaarValue });
        }
        // Process PAN
        if (data.panNumber) {
            // ✅ Store exact value (verification service will handle masking if needed)
            let panValue = data.panNumber;
            if (!panValue.includes('X')) {
                // It's an exact value, mask it: ABXXXX1234
                const cleaned = panValue.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                if (cleaned.length === 10) {
                    panValue = `${cleaned.slice(0, 2)}XXXX${cleaned.slice(6)}`;
                }
            }
            verificationRecords.push({ type: 'pan', maskedValue: panValue });
        }
        // ✅ Note: Address details are not stored in verification service currently
        // They are stored in the profile's location.address field
        // If verification service needs address, it should be added to the model
        // Store each verification record
        for (const record of verificationRecords) {
            try {
                await axios_1.default.post(`${env_1.env.VERIFICATION_SERVICE_URL}/api/v1/verification/bulk-store`, {
                    userId: uid,
                    type: record.type,
                    maskedValue: record.maskedValue,
                    status: 'verified',
                    verifiedAt: new Date().toISOString(),
                    provider: 'admin_activation',
                    consent: {
                        given: true,
                        givenAt: new Date().toISOString(),
                        consentVersion: 'v1.0',
                        consentText: 'Lead activation - pre-verified documents'
                    }
                }, {
                    headers: {
                        'X-Service-Auth': env_1.env.SERVICE_AUTH_TOKEN,
                        'X-Service-Name': 'admin-service',
                        'Content-Type': 'application/json'
                    }
                });
                logger_1.default.info(`Stored ${record.type} verification for activated user ${uid}`);
            }
            catch (error) {
                logger_1.default.error(`Failed to store ${record.type} verification for ${uid}`, {
                    error: error.message,
                    response: error.response?.data
                });
                // Continue with other records even if one fails
            }
        }
    }
    /**
     * Generate temporary password for new user
     */
    static generateTempPassword() {
        // Generate a random 12-character password
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let password = '';
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }
}
exports.ActivationService = ActivationService;
//# sourceMappingURL=ActivationService.js.map