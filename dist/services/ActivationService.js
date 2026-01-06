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
            // Extract Aadhaar and PAN from lead documents
            const aadhaarDoc = lead.documents?.find(doc => doc.type === 'aadhaar' && doc.status === 'verified');
            const panDoc = lead.documents?.find(doc => doc.type === 'pan' && doc.status === 'verified');
            const hasAadhaar = !!aadhaarDoc?.aadhaarNumber;
            const hasPAN = !!panDoc?.panNumber;
            // Get masked values (already masked if manually entered, or we'll mask them)
            let maskedAadhaar;
            let maskedPAN;
            if (hasAadhaar && aadhaarDoc?.aadhaarNumber) {
                // If already masked (format: XXXX XXXX 1234), use as is
                // Otherwise, it shouldn't happen but we'll handle it
                maskedAadhaar = aadhaarDoc.aadhaarNumber;
            }
            if (hasPAN && panDoc?.panNumber) {
                // If already masked (format: ABXXXX1234), use as is
                maskedPAN = panDoc.panNumber;
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
                    address: lead.address || null
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
                isAadhaarVerified: hasAadhaar, // Only true if Aadhaar document exists and is verified
                isPANVerified: hasPAN, // Only true if PAN document exists and is verified
                availability: null,
                photoURL: null,
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
                // Store masked Aadhaar/PAN in verification service if they exist
                if (hasAadhaar || hasPAN) {
                    try {
                        await this.storeVerificationData(userRecord.uid, {
                            aadhaarNumber: maskedAadhaar,
                            panNumber: maskedPAN
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
     * Store masked Aadhaar/PAN data in verification service
     */
    static async storeVerificationData(uid, data) {
        if (!env_1.env.VERIFICATION_SERVICE_URL) {
            logger_1.default.warn('VERIFICATION_SERVICE_URL not configured, skipping verification data storage');
            return;
        }
        const verificationRecords = [];
        // Process Aadhaar
        if (data.aadhaarNumber) {
            verificationRecords.push({ type: 'aadhaar', maskedValue: data.aadhaarNumber });
        }
        // Process PAN
        if (data.panNumber) {
            verificationRecords.push({ type: 'pan', maskedValue: data.panNumber });
        }
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