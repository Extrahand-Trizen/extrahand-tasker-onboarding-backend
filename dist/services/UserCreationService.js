"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserCreationService = void 0;
const firebase_1 = require("../config/firebase");
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../config/logger"));
const env_1 = require("../config/env");
class UserCreationService {
    /**
     * Bulk create Firebase users using createUser() in parallel batches
     * Note: Firebase Admin SDK only has createUser() (singular), not createUsers()
     * We process users in batches to handle bulk operations efficiently
     */
    static async createUsersBulk(usersToCreate) {
        const users = [];
        const errors = [];
        // Process in batches to avoid overwhelming Firebase and rate limits
        const BATCH_SIZE = 10; // Process 10 users at a time
        const batches = [];
        for (let i = 0; i < usersToCreate.length; i += BATCH_SIZE) {
            batches.push(usersToCreate.slice(i, i + BATCH_SIZE));
        }
        logger_1.default.info(`Creating ${usersToCreate.length} Firebase users in ${batches.length} batch(es)`);
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            const startIndex = batchIndex * BATCH_SIZE;
            // Create users in parallel within the batch using Promise.allSettled
            // This ensures all attempts are processed even if some fail
            const batchResults = await Promise.allSettled(batch.map((userData) => firebase_1.auth.createUser({
                email: userData.email,
                password: userData.password,
                displayName: userData.displayName,
                phoneNumber: userData.phoneNumber,
                emailVerified: userData.emailVerified,
                disabled: userData.disabled
            })));
            // Process results from this batch
            batchResults.forEach((result, index) => {
                const globalIndex = startIndex + index;
                if (result.status === 'fulfilled') {
                    users.push({
                        uid: result.value.uid,
                        email: result.value.email,
                        phoneNumber: result.value.phoneNumber
                    });
                }
                else {
                    // Extract error information
                    const error = result.reason;
                    errors.push({
                        index: globalIndex,
                        error: {
                            message: error?.message || 'Unknown error during user creation',
                            code: error?.code || 'unknown'
                        }
                    });
                }
            });
            // Small delay between batches to avoid rate limiting
            if (batchIndex < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        logger_1.default.info(`Bulk Firebase user creation: ${users.length} created, ${errors.length} errors`);
        return { users, errors };
    }
    /**
     * Bulk create profiles via API (batched for efficiency)
     */
    static async createProfilesBulk(profiles) {
        const success = [];
        const failed = [];
        // Process in batches of 100 to avoid overwhelming the API
        const API_BATCH_SIZE = 100;
        for (let i = 0; i < profiles.length; i += API_BATCH_SIZE) {
            const batch = profiles.slice(i, i + API_BATCH_SIZE);
            // Create profiles in parallel within batch
            const batchResults = await Promise.allSettled(batch.map(profileData => {
                // Remove _userData before sending (it's only for internal use)
                const { _userData, ...cleanProfileData } = profileData;
                return axios_1.default.post(`${env_1.env.USER_SERVICE_URL}/api/v1/profiles`, cleanProfileData, {
                    headers: {
                        'X-Service-Auth': env_1.env.SERVICE_AUTH_TOKEN,
                        'X-Service-Name': 'admin-service',
                        'X-User-Id': profileData.uid
                    }
                });
            }));
            batchResults.forEach((settled, index) => {
                const profileData = batch[index];
                const userData = profileData._userData || { name: profileData.name || '', phone: profileData.phone || '' };
                if (settled.status === 'fulfilled' &&
                    (settled.value.status === 201 || settled.value.status === 200)) {
                    success.push(profileData.uid);
                }
                else {
                    const error = settled.status === 'rejected'
                        ? settled.reason?.message || settled.reason?.response?.data?.error || 'Unknown error'
                        : `HTTP ${settled.value.status}: ${settled.value.statusText}`;
                    failed.push({
                        uid: profileData.uid,
                        userData,
                        error
                    });
                }
            });
        }
        return { success, failed };
    }
    /**
     * Prepare profile document for bulk insert (doesn't create, just prepares)
     */
    static prepareProfileDocument(uid, userData, metadata) {
        const skills = this.parseSkills(userData);
        const location = userData.address ? {
            type: 'Point',
            coordinates: [0, 0], // Default coordinates (can be updated via geocoding)
            address: userData.address,
            addressDetails: {
                city: userData.city || null,
                state: userData.state || null,
                pinCode: userData.pincode || null,
                country: 'India'
            },
            isPublic: false
        } : null;
        const profileData = {
            uid,
            name: userData.name,
            email: null,
            phone: this.formatPhone(userData.phone),
            userType: 'individual',
            roles: ['tasker'],
            location: location,
            isAdminVerified: metadata.isAdminVerified,
            phoneVerified: metadata.phoneVerified,
            adminCreatedAt: new Date().toISOString(),
            isVerified: false,
            isAadhaarVerified: false, // Aadhaar verification removed from bulk upload
            isPANVerified: false, // PAN verification removed from bulk upload
            isBankVerified: false,
            isFaceVerified: false,
            skills: {
                primaryCategory: this.validatePrimaryCategory(userData.primarySkill),
                list: skills,
                updatedAt: new Date()
            },
            roleVerifications: {
                tasker: {
                    canAcceptTasks: false,
                    requirements: {
                        aadhaar: false,
                        pan: false,
                        bank: false,
                        skills: skills.length > 0,
                        emergency: false
                    }
                }
            },
            rating: 0,
            totalReviews: 0,
            totalTasks: 0,
            completedTasks: 0,
            postedTasks: 0,
            earnedAmount: 0,
            isActive: true,
            verificationTier: 0,
            verificationBadge: 'none',
            onboardingStatus: {
                isCompleted: false,
                completedSteps: {
                    location: !!userData.address,
                    roles: true,
                    profile: true
                },
                lastStep: 'location'
            },
            photoURL: null,
            agreeUpdates: false,
            agreeTerms: false
        };
        // Store userData for error handling
        profileData._userData = userData;
        return profileData;
    }
    /**
     * Create tasker user in Firebase + Profile (legacy method for single user)
     */
    static async createTasker(userData) {
        try {
            // 1. Generate temporary email (required by Firebase)
            const phoneDigits = userData.phone.replace(/\D/g, '');
            const tempEmail = `tasker_${phoneDigits}_${Date.now()}@extrahand.temp`;
            const tempPassword = this.generateTempPassword();
            // 2. Format phone number (E.164 format)
            const formattedPhone = this.formatPhone(userData.phone);
            // 3. Create Firebase user
            const userRecord = await firebase_1.auth.createUser({
                email: tempEmail,
                password: tempPassword,
                displayName: userData.name,
                phoneNumber: formattedPhone, // Stored but not verified
                emailVerified: false,
                disabled: false
            });
            // 4. Create profile in User Service
            await this.createProfile(userRecord.uid, userData, {
                isAdminVerified: true,
                phoneVerified: false
            });
            logger_1.default.info('Tasker created via bulk upload', {
                uid: userRecord.uid,
                phone: formattedPhone,
                name: userData.name
            });
            return userRecord.uid;
        }
        catch (error) {
            logger_1.default.error('Failed to create tasker', {
                error: error.message,
                userData: { name: userData.name, phone: userData.phone }
            });
            throw new Error(`Failed to create tasker: ${error.message}`);
        }
    }
    /**
     * Create profile in User Service - matches exact Profile model structure
     */
    static async createProfile(uid, userData, metadata) {
        try {
            // Parse skills from CSV - matches Profile model structure
            const skills = this.parseSkills(userData);
            // Build location object - matches Profile model structure
            const location = userData.address ? {
                type: 'Point',
                coordinates: [0, 0], // Default coordinates (can be updated via geocoding)
                address: userData.address,
                addressDetails: {
                    city: userData.city || null,
                    state: userData.state || null,
                    pinCode: userData.pincode || null,
                    country: 'India'
                },
                isPublic: false
            } : null;
            const profileData = {
                uid,
                name: userData.name,
                email: null,
                phone: this.formatPhone(userData.phone),
                userType: 'individual',
                roles: ['tasker'],
                // Location - matches Profile model
                location: location,
                // Admin verification flags
                isAdminVerified: metadata.isAdminVerified,
                phoneVerified: metadata.phoneVerified,
                adminCreatedAt: new Date().toISOString(),
                // Verification flags (not verified yet)
                isVerified: false,
                isAadhaarVerified: false,
                isPANVerified: false,
                isBankVerified: false,
                isFaceVerified: false,
                // Skills - matches exact Profile model structure
                skills: {
                    primaryCategory: this.validatePrimaryCategory(userData.primarySkill),
                    list: skills,
                    updatedAt: new Date()
                },
                // Role verifications - matches Profile model
                roleVerifications: {
                    tasker: {
                        canAcceptTasks: false, // Cannot accept until verified
                        requirements: {
                            aadhaar: false,
                            pan: false,
                            bank: false,
                            skills: skills.length > 0, // Skills are present
                            emergency: false
                        }
                    }
                },
                // Stats initialized - matches Profile model
                rating: 0,
                totalReviews: 0,
                totalTasks: 0,
                completedTasks: 0,
                postedTasks: 0,
                earnedAmount: 0,
                // Status
                isActive: true,
                verificationTier: 0,
                verificationBadge: 'none',
                // Onboarding status - matches Profile model
                onboardingStatus: {
                    isCompleted: false,
                    completedSteps: {
                        location: !!userData.address,
                        roles: true, // Admin set roles
                        profile: true // Admin created profile
                    },
                    lastStep: 'location'
                },
                // Optional fields
                photoURL: null,
                agreeUpdates: false,
                agreeTerms: false
            };
            const response = await axios_1.default.post(`${env_1.env.USER_SERVICE_URL}/api/v1/profiles`, profileData, {
                headers: {
                    'X-Service-Auth': env_1.env.SERVICE_AUTH_TOKEN,
                    'X-Service-Name': 'admin-service',
                    'X-User-Id': uid
                }
            });
            if (response.status !== 201 && response.status !== 200) {
                throw new Error(`Failed to create profile: ${response.statusText}`);
            }
        }
        catch (error) {
            logger_1.default.error('Failed to create profile', {
                uid,
                error: error.message,
                response: error.response?.data
            });
            throw new Error(`Failed to create profile: ${error.message}`);
        }
    }
    /**
     * Parse skills from CSV - matches Profile model skills.list structure
     */
    static parseSkills(userData) {
        const skillsList = userData.skillsList || '';
        if (!skillsList)
            return [];
        // Support comma or pipe separated
        const skillNames = skillsList.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        const primaryCategory = this.validatePrimaryCategory(userData.primarySkill);
        return skillNames.map(skillName => ({
            name: skillName,
            category: primaryCategory, // Use primaryCategory as category for each skill
            level: 'intermediate', // Default level
            certified: false,
            verified: false
        }));
    }
    /**
     * Validate primaryCategory against Profile model enum
     */
    static validatePrimaryCategory(category) {
        const validCategories = ['home_services', 'cleaning', 'delivery', 'beauty', 'tech', 'tutoring', 'other'];
        const normalized = category?.toLowerCase() || 'other';
        // Map common variations to valid categories
        const categoryMap = {
            'home services': 'home_services',
            'home-services': 'home_services',
            'home_services': 'home_services',
            'cleaning': 'cleaning',
            'delivery': 'delivery',
            'beauty': 'beauty',
            'tech': 'tech',
            'technology': 'tech',
            'tutoring': 'tutoring',
            'other': 'other'
        };
        const mapped = categoryMap[normalized] || 'other';
        return validCategories.includes(mapped) ? mapped : 'other';
    }
    /**
     * Format phone to E.164 format
     */
    static formatPhone(phone) {
        const cleaned = phone.replace(/\s+/g, '').replace(/-/g, '');
        return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
    }
    static generateTempPassword() {
        const length = 12;
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';
        for (let i = 0; i < length; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return password;
    }
    /**
     * Update Firebase user
     */
    static async updateFirebaseUser(uid, updateData) {
        try {
            await firebase_1.auth.updateUser(uid, updateData);
            logger_1.default.info('Firebase user updated', { uid });
        }
        catch (error) {
            logger_1.default.error('Failed to update Firebase user', { uid, error: error.message });
            throw new Error(`Failed to update Firebase user: ${error.message}`);
        }
    }
    /**
     * Bulk delete Firebase users (up to 1000 per call)
     */
    static async deleteUsersBulk(uids) {
        try {
            // Firebase deleteUsers supports up to 1000 UIDs
            const result = await firebase_1.auth.deleteUsers(uids);
            logger_1.default.info(`Bulk delete: ${result.successCount} deleted, ${result.failureCount} failed`);
            return {
                successCount: result.successCount,
                failureCount: result.failureCount,
                deletedUids: uids.filter((uid, index) => {
                    // Find if this UID had an error
                    const error = result.errors?.find((e) => e.index === index);
                    return !error;
                }),
                errors: result.errors?.map((e) => ({
                    uid: uids[e.index],
                    error: {
                        message: e.error.message,
                        code: e.error.code || 'unknown'
                    }
                })) || []
            };
        }
        catch (error) {
            logger_1.default.error('Bulk delete failed:', error);
            throw new Error(`Bulk delete failed: ${error.message}`);
        }
    }
    /**
     * Prepare profile update document
     */
    static prepareProfileUpdate(userData) {
        const updatePayload = {};
        if (userData.name)
            updatePayload.name = userData.name;
        if (userData.phone)
            updatePayload.phone = this.formatPhone(userData.phone);
        if (userData.isActive !== undefined)
            updatePayload.isActive = userData.isActive;
        // Location update
        if (userData.address) {
            updatePayload.location = {
                type: 'Point',
                coordinates: [0, 0],
                address: userData.address,
                addressDetails: {
                    city: userData.city || null,
                    state: userData.state || null,
                    pinCode: userData.pincode || null,
                    country: 'India'
                },
                isPublic: false
            };
        }
        // Skills update
        if (userData.skillsList) {
            const skills = this.parseSkills(userData);
            updatePayload.skills = {
                primaryCategory: this.validatePrimaryCategory(userData.primarySkill),
                list: skills,
                updatedAt: new Date()
            };
        }
        return {
            uid: userData.uid,
            updatePayload
        };
    }
    /**
     * Bulk update profiles in MongoDB via API
     */
    static async bulkUpdateProfiles(updates) {
        try {
            // Process in batches of 100
            const BATCH_SIZE = 100;
            for (let i = 0; i < updates.length; i += BATCH_SIZE) {
                const batch = updates.slice(i, i + BATCH_SIZE);
                await Promise.allSettled(batch.map(({ uid, updatePayload }) => axios_1.default.put(`${env_1.env.USER_SERVICE_URL}/api/v1/profiles/${uid}`, updatePayload, {
                    headers: {
                        'X-Service-Auth': env_1.env.SERVICE_AUTH_TOKEN,
                        'X-Service-Name': 'admin-service',
                        'X-User-Id': uid
                    }
                })));
            }
        }
        catch (error) {
            logger_1.default.error('Bulk profile update failed:', error);
            throw new Error(`Bulk profile update failed: ${error.message}`);
        }
    }
    /**
     * Bulk delete profiles from MongoDB via API (optimized with deleteMany)
     */
    static async bulkDeleteProfiles(uids) {
        try {
            // Process in batches of 1000 (MongoDB limit for $in operator)
            const BATCH_SIZE = 1000;
            for (let i = 0; i < uids.length; i += BATCH_SIZE) {
                const batch = uids.slice(i, i + BATCH_SIZE);
                const response = await axios_1.default.delete(`${env_1.env.USER_SERVICE_URL}/api/v1/profiles/bulk`, {
                    data: { uids: batch },
                    headers: {
                        'X-Service-Auth': env_1.env.SERVICE_AUTH_TOKEN,
                        'X-Service-Name': 'admin-service',
                        'Content-Type': 'application/json'
                    }
                });
                if (response.status !== 200 || !response.data?.success) {
                    throw new Error(`Bulk delete failed: ${response.data?.error || response.statusText}`);
                }
                logger_1.default.info(`Bulk deleted ${response.data.deletedCount || batch.length} profiles from MongoDB`, {
                    requested: batch.length,
                    deleted: response.data.deletedCount
                });
            }
        }
        catch (error) {
            logger_1.default.error('Bulk profile delete failed:', error);
            throw new Error(`Bulk profile delete failed: ${error.message}`);
        }
    }
}
exports.UserCreationService = UserCreationService;
//# sourceMappingURL=UserCreationService.js.map