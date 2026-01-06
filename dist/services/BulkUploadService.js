"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulkUploadService = void 0;
const sync_1 = require("csv-parse/sync");
const XLSX = __importStar(require("xlsx"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../config/logger"));
const BulkImport_1 = __importDefault(require("../models/BulkImport"));
const LeadService_1 = require("./LeadService");
const UserCreationService_1 = require("./UserCreationService");
const DuplicateCheckService_1 = require("./DuplicateCheckService");
const env_1 = require("../config/env");
class BulkUploadService {
    /**
     * Parse CSV/Excel file
     */
    static parseFile(buffer, fileName) {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (ext === 'csv') {
            const records = (0, sync_1.parse)(buffer.toString(), {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true
            });
            return this.normalizeRecords(records);
        }
        else if (['xlsx', 'xls'].includes(ext || '')) {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const records = XLSX.utils.sheet_to_json(sheet);
            return this.normalizeRecords(records);
        }
        throw new Error('Unsupported file format. Use CSV or Excel (.xlsx, .xls)');
    }
    /**
     * Normalize records to ParsedUser format
     */
    static normalizeRecords(records) {
        return records.map(record => {
            // Detect operation type (default to 'create' if not specified)
            const operation = (record.operation || record.Operation || 'create').toLowerCase();
            return {
                operation: operation,
                uid: record.uid || record.UID || undefined,
                name: record.name || record.Name || '',
                phone: record.phone || record.Phone || '',
                email: record.email || record.Email || undefined,
                address: record.address || record.Address || undefined,
                city: record.city || record.City || undefined,
                state: record.state || record.State || undefined,
                pincode: record.pincode || record.Pincode || record.pinCode || undefined,
                skillsList: record.skills || record.Skills || record.skillsList || undefined,
                primarySkill: record.primarySkill || record.PrimarySkill || 'other',
                isActive: record.isActive !== undefined
                    ? record.isActive === 'true' || record.isActive === true || record.isActive === 1
                    : undefined,
                reason: record.reason || record.Reason || undefined
            };
        });
    }
    /**
     * Validate parsed users based on operation type
     */
    static validateUsers(users) {
        const errors = [];
        if (users.length === 0) {
            errors.push('File is empty');
        }
        if (users.length > 10000) {
            errors.push('Maximum 10000 operations per import');
        }
        // Detect operation types
        const operations = new Set(users.map(u => u.operation || 'create'));
        const isMixed = operations.size > 1;
        users.forEach((user, index) => {
            const row = index + 2; // +2 for header row and 0-index
            const operation = user.operation || 'create';
            // Validate based on operation type
            if (operation === 'update' || operation === 'delete') {
                if (!user.uid || user.uid.trim() === '') {
                    errors.push(`Row ${row}: UID is required for ${operation} operation`);
                }
            }
            if (operation === 'create') {
                if (!user.name || user.name.trim() === '') {
                    errors.push(`Row ${row}: Name is required for create operation`);
                }
                if (!user.phone) {
                    errors.push(`Row ${row}: Phone number is required for create operation`);
                }
                if (user.phone && !this.isValidPhone(user.phone)) {
                    errors.push(`Row ${row}: Invalid phone format: ${user.phone}. Expected E.164 format (e.g., +919876543210)`);
                }
                if (!user.address) {
                    errors.push(`Row ${row}: Address is required for create operation`);
                }
                if (!user.state) {
                    errors.push(`Row ${row}: State is required for create operation`);
                }
                if (!user.primarySkill || user.primarySkill.trim() === '') {
                    errors.push(`Row ${row}: Primary skill is required for create operation`);
                }
            }
            if (operation === 'update') {
                // At least one field besides uid should be provided
                const hasUpdateFields = user.name || user.phone || user.address ||
                    user.skillsList || user.isActive !== undefined;
                if (!hasUpdateFields) {
                    errors.push(`Row ${row}: At least one field to update is required`);
                }
                // Validate phone if provided
                if (user.phone && !this.isValidPhone(user.phone)) {
                    errors.push(`Row ${row}: Invalid phone format: ${user.phone}`);
                }
            }
        });
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    /**
     * Process bulk operations (create, update, delete) - Optimized with Firebase and MongoDB bulk operations
     */
    static async processBulkUpload(fileBuffer, fileName, adminUid) {
        // 1. Parse file
        const users = this.parseFile(fileBuffer, fileName);
        // 2. Validate
        const validation = this.validateUsers(users);
        if (!validation.isValid) {
            throw new Error(`Validation failed:\n${validation.errors.join('\n')}`);
        }
        // 3. Detect operation type
        const operations = new Set(users.map(u => u.operation || 'create'));
        const operationType = operations.size > 1 ? 'mixed' :
            (Array.from(operations)[0] || 'create');
        // 4. Create import record
        const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await BulkImport_1.default.create({
            importId,
            adminUid,
            fileName,
            totalRows: users.length,
            status: 'processing',
            operationType
        });
        const result = {
            importId,
            operation: operationType,
            success: 0,
            failed: 0,
            errors: [],
            importedLeadIds: [],
            importedUserIds: [],
            updatedUserIds: [],
            deletedUserIds: []
        };
        // 5. Separate users by operation type
        const createUsers = users.filter(u => (u.operation || 'create') === 'create');
        const updateUsers = users.filter(u => u.operation === 'update');
        const deleteUsers = users.filter(u => u.operation === 'delete');
        // 6. Process creates (creates leads + Firebase users + MongoDB profiles)
        if (createUsers.length > 0) {
            const createResult = await this.processCreates(createUsers, importId, adminUid);
            result.success += createResult.success;
            result.failed += createResult.failed;
            result.importedLeadIds.push(...createResult.leadIds);
            result.importedUserIds.push(...createResult.userIds);
            result.errors.push(...createResult.errors);
        }
        // 7. Process updates
        if (updateUsers.length > 0) {
            const updateResult = await this.processUpdates(updateUsers, importId);
            result.success += updateResult.success;
            result.failed += updateResult.failed;
            result.updatedUserIds.push(...updateResult.userIds);
            result.errors.push(...updateResult.errors);
        }
        // 8. Process deletes
        if (deleteUsers.length > 0) {
            const deleteResult = await this.processDeletes(deleteUsers, importId);
            result.success += deleteResult.success;
            result.failed += deleteResult.failed;
            result.deletedUserIds.push(...deleteResult.userIds);
            result.errors.push(...deleteResult.errors);
        }
        // 9. Final update
        await BulkImport_1.default.updateOne({ importId }, {
            status: 'completed',
            completedAt: new Date(),
            importedUserIds: result.importedUserIds, // Store Firebase UIDs
            updatedUserIds: result.updatedUserIds || [],
            deletedUserIds: result.deletedUserIds || []
        });
        logger_1.default.info('Bulk operations completed', {
            importId,
            adminUid,
            operation: operationType,
            total: users.length,
            success: result.success,
            failed: result.failed
        });
        return result;
    }
    /**
     * Process bulk creates - Creates leads + Firebase users + MongoDB profiles
     * OPTIMIZED: Uses bulk duplicate checks to minimize database queries and API calls
     */
    static async processCreates(users, importId, adminUid) {
        const processingResult = {
            success: 0,
            failed: 0,
            leadIds: [],
            userIds: [],
            errors: []
        };
        logger_1.default.info(`Processing ${users.length} creates (leads + Firebase + profiles) from bulk upload`);
        // STEP 1: Bulk duplicate check - Check ALL phones at once (single MongoDB query)
        const allPhoneNumbers = users.map(user => user.phone).filter(Boolean);
        const normalizedPhoneNumbers = allPhoneNumbers.map(phone => DuplicateCheckService_1.DuplicateCheckService.normalizePhone(phone));
        logger_1.default.info(`Performing bulk duplicate check for ${normalizedPhoneNumbers.length} phone numbers`);
        const existingLeadsByPhoneMap = await DuplicateCheckService_1.DuplicateCheckService.checkPhonesBulk(allPhoneNumbers);
        // STEP 2: Check for existing profiles (bulk if API supports, otherwise skip)
        const existingProfilePhonesSet = new Set();
        try {
            // Format phones for API check (E.164 format)
            const formattedPhonesForApi = normalizedPhoneNumbers.map(normalizedPhone => {
                const digitsOnly = normalizedPhone.replace(/\D/g, '');
                return digitsOnly.startsWith('91') ? `+${digitsOnly}` : `+91${digitsOnly}`;
            });
            // Try bulk check endpoint (if available)
            const bulkProfileCheckResponse = await axios_1.default.post(`${env_1.env.USER_SERVICE_URL}/api/v1/auth/check-phones-bulk`, { phones: formattedPhonesForApi }, {
                headers: {
                    'X-Service-Auth': env_1.env.SERVICE_AUTH_TOKEN,
                    'X-Service-Name': 'admin-service'
                }
            }).catch(() => null); // Gracefully fail if endpoint doesn't exist
            if (bulkProfileCheckResponse?.data?.existingPhones) {
                bulkProfileCheckResponse.data.existingPhones.forEach((phone) => {
                    existingProfilePhonesSet.add(phone);
                });
                logger_1.default.info(`Bulk profile check found ${existingProfilePhonesSet.size} existing profiles`);
            }
        }
        catch (error) {
            logger_1.default.warn('Bulk profile check not available, will check during profile creation', {
                error: error.message
            });
        }
        const usersToProcess = [];
        const duplicateErrors = [];
        users.forEach((user, index) => {
            const csvRowNumber = index + 2; // +2 for header row and 0-index
            const normalizedPhone = DuplicateCheckService_1.DuplicateCheckService.normalizePhone(user.phone);
            const formattedPhoneForApi = UserCreationService_1.UserCreationService.formatPhone(user.phone);
            // Check if lead already exists
            if (existingLeadsByPhoneMap.has(normalizedPhone)) {
                const existingLead = existingLeadsByPhoneMap.get(normalizedPhone);
                duplicateErrors.push({
                    row: csvRowNumber,
                    phone: user.phone,
                    error: `Duplicate lead found: ${existingLead?.leadId || 'existing lead'}`
                });
                logger_1.default.debug(`Skipping duplicate lead`, {
                    row: csvRowNumber,
                    phone: normalizedPhone,
                    existingLeadId: existingLead?.leadId
                });
                return;
            }
            // Check if profile already exists (if we have bulk check data)
            if (existingProfilePhonesSet.has(formattedPhoneForApi)) {
                duplicateErrors.push({
                    row: csvRowNumber,
                    phone: user.phone,
                    error: `User profile already exists with phone number ${formattedPhoneForApi}`
                });
                logger_1.default.debug(`Skipping duplicate profile`, {
                    row: csvRowNumber,
                    phone: formattedPhoneForApi
                });
                return;
            }
            // User passed duplicate checks, add to processing queue
            usersToProcess.push({
                user,
                originalIndex: index,
                csvRowNumber
            });
        });
        // Add duplicate errors to result
        duplicateErrors.forEach(duplicateError => {
            processingResult.failed++;
            processingResult.errors.push(duplicateError);
        });
        logger_1.default.info(`Duplicate filtering completed: ${duplicateErrors.length} duplicates found, ${usersToProcess.length} users to process`);
        if (usersToProcess.length === 0) {
            logger_1.default.warn('No users to process after duplicate filtering');
            return processingResult;
        }
        // STEP 4: Process remaining users in batches (for Firebase rate limits)
        const FIREBASE_BATCH_SIZE = 10;
        const processingBatches = [];
        for (let i = 0; i < usersToProcess.length; i += FIREBASE_BATCH_SIZE) {
            processingBatches.push(usersToProcess.slice(i, i + FIREBASE_BATCH_SIZE));
        }
        for (let batchIndex = 0; batchIndex < processingBatches.length; batchIndex++) {
            const currentBatch = processingBatches[batchIndex];
            const batchStartRow = processingBatches.slice(0, batchIndex).reduce((sum, batch) => sum + batch.length, 0) + 2;
            try {
                const leadCreationPromises = currentBatch.map(async (userToProcess) => {
                    try {
                        const createdLead = await LeadService_1.LeadService.createLead({
                            name: userToProcess.user.name,
                            phone: userToProcess.user.phone,
                            email: userToProcess.user.email,
                            city: userToProcess.user.city || 'Unknown',
                            state: userToProcess.user.state,
                            address: userToProcess.user.address,
                            pincode: userToProcess.user.pincode,
                            primarySkill: userToProcess.user.primarySkill || 'other',
                            source: 'campaign',
                            sourceDetails: `Bulk upload: ${importId}`,
                            addedBy: adminUid,
                            addedByName: undefined,
                        });
                        // Update lead status and creationMethod
                        createdLead.status = 'account_created';
                        createdLead.creationMethod = 'bulk_upload';
                        createdLead.statusHistory.push({
                            status: 'account_created',
                            changedBy: adminUid,
                            changedAt: new Date(),
                            notes: 'Created via bulk upload'
                        });
                        await createdLead.save();
                        return {
                            success: true,
                            lead: createdLead,
                            userData: userToProcess.user,
                            originalIndex: userToProcess.originalIndex,
                            csvRowNumber: userToProcess.csvRowNumber
                        };
                    }
                    catch (error) {
                        // Check if error is about duplicate (from LeadService.createLead)
                        const isDuplicateError = error.message?.includes('Duplicate') || error.message?.includes('duplicate');
                        return {
                            success: false,
                            error: isDuplicateError ? error.message : `Lead creation failed: ${error.message}`,
                            csvRowNumber: userToProcess.csvRowNumber
                        };
                    }
                });
                const leadCreationResults = await Promise.all(leadCreationPromises);
                // Separate successful and failed lead creations
                const successfulLeadCreations = leadCreationResults.filter(result => result.success);
                const failedLeadCreations = leadCreationResults.filter(result => !result.success);
                // Track failed lead creations
                failedLeadCreations.forEach(failedCreation => {
                    processingResult.failed++;
                    processingResult.errors.push({
                        row: failedCreation.csvRowNumber,
                        phone: currentBatch.find(u => u.csvRowNumber === failedCreation.csvRowNumber)?.user.phone,
                        error: failedCreation.error
                    });
                });
                // Step 4b: Create Firebase users for successfully created leads
                if (successfulLeadCreations.length > 0) {
                    const firebaseUsersToCreate = successfulLeadCreations.map((leadCreation, index) => {
                        const phoneDigitsOnly = leadCreation.userData.phone.replace(/\D/g, '');
                        const timestamp = Date.now();
                        const temporaryEmail = leadCreation.userData.email || `tasker_${phoneDigitsOnly}_${timestamp}_${index}@extrahand.temp`;
                        return {
                            email: temporaryEmail,
                            password: UserCreationService_1.UserCreationService.generateTempPassword(),
                            displayName: leadCreation.userData.name,
                            phoneNumber: UserCreationService_1.UserCreationService.formatPhone(leadCreation.userData.phone),
                            emailVerified: false,
                            disabled: false
                        };
                    });
                    logger_1.default.info(`Creating ${firebaseUsersToCreate.length} Firebase users in batch ${batchIndex + 1}`);
                    const firebaseCreationResult = await UserCreationService_1.UserCreationService.createUsersBulk(firebaseUsersToCreate);
                    const leadFirebasePairs = [];
                    firebaseCreationResult.users.forEach((createdFirebaseUser, firebaseIndex) => {
                        const correspondingLeadCreation = successfulLeadCreations[firebaseIndex];
                        if (correspondingLeadCreation) {
                            leadFirebasePairs.push({
                                lead: correspondingLeadCreation.lead,
                                userData: correspondingLeadCreation.userData,
                                firebaseUid: createdFirebaseUser.uid,
                                originalIndex: correspondingLeadCreation.originalIndex,
                                csvRowNumber: correspondingLeadCreation.csvRowNumber
                            });
                        }
                    });
                    // Handle Firebase creation errors
                    if (firebaseCreationResult.errors && firebaseCreationResult.errors.length > 0) {
                        firebaseCreationResult.errors.forEach((firebaseError) => {
                            const correspondingLeadCreation = successfulLeadCreations[firebaseError.index];
                            if (correspondingLeadCreation) {
                                processingResult.failed++;
                                processingResult.errors.push({
                                    row: correspondingLeadCreation.csvRowNumber,
                                    phone: correspondingLeadCreation.userData.phone,
                                    error: `Firebase creation failed: ${firebaseError.error.message}`
                                });
                            }
                        });
                    }
                    // Step 4d: Create MongoDB profiles for successful Firebase users
                    if (leadFirebasePairs.length > 0) {
                        logger_1.default.info(`Creating ${leadFirebasePairs.length} MongoDB profiles in batch ${batchIndex + 1}`);
                        const profileDocumentsToCreate = leadFirebasePairs.map((pair) => {
                            const profileDocument = UserCreationService_1.UserCreationService.prepareProfileDocument(pair.firebaseUid, pair.userData, {
                                isAdminVerified: true,
                                phoneVerified: false
                            });
                            profileDocument._userData = pair.userData;
                            return profileDocument;
                        });
                        const profileCreationResult = await UserCreationService_1.UserCreationService.createProfilesBulk(profileDocumentsToCreate);
                        // Step 4e: Update leads with activationData and track final results
                        for (const leadFirebasePair of leadFirebasePairs) {
                            const wasProfileCreated = profileCreationResult.success.includes(leadFirebasePair.firebaseUid);
                            if (wasProfileCreated) {
                                // Update lead with activationData
                                leadFirebasePair.lead.activationData = {
                                    activatedAt: new Date(),
                                    firebaseUid: leadFirebasePair.firebaseUid,
                                    profileCreated: true
                                };
                                leadFirebasePair.lead.statusHistory.push({
                                    status: 'account_created',
                                    changedBy: adminUid,
                                    changedAt: new Date(),
                                    notes: 'Firebase account and profile created via bulk upload'
                                });
                                await leadFirebasePair.lead.save();
                                processingResult.success++;
                                processingResult.leadIds.push(leadFirebasePair.lead.leadId);
                                processingResult.userIds.push(leadFirebasePair.firebaseUid);
                                logger_1.default.debug(`Successfully created complete account`, {
                                    leadId: leadFirebasePair.lead.leadId,
                                    firebaseUid: leadFirebasePair.firebaseUid,
                                    name: leadFirebasePair.userData.name
                                });
                            }
                            else {
                                // Profile creation failed, but Firebase user exists
                                const profileCreationError = profileCreationResult.failed.find(failed => failed.uid === leadFirebasePair.firebaseUid);
                                processingResult.failed++;
                                processingResult.errors.push({
                                    row: leadFirebasePair.csvRowNumber,
                                    phone: leadFirebasePair.userData.phone,
                                    error: `Profile creation failed: ${profileCreationError?.error || 'Unknown error'}`
                                });
                            }
                        }
                        // Handle profile creation failures
                        profileCreationResult.failed.forEach((failedProfile) => {
                            const correspondingPair = leadFirebasePairs.find(pair => pair.firebaseUid === failedProfile.uid);
                            if (correspondingPair) {
                                processingResult.failed++;
                                processingResult.errors.push({
                                    row: correspondingPair.csvRowNumber,
                                    phone: correspondingPair.userData.phone,
                                    error: `Profile creation failed: ${failedProfile.error}`
                                });
                            }
                        });
                    }
                }
            }
            catch (batchError) {
                logger_1.default.error(`Batch ${batchIndex + 1} processing failed:`, batchError);
                currentBatch.forEach((userToProcess) => {
                    processingResult.failed++;
                    processingResult.errors.push({
                        row: userToProcess.csvRowNumber,
                        phone: userToProcess.user.phone,
                        error: batchError.message || 'Batch processing failed'
                    });
                });
            }
        }
        logger_1.default.info('Bulk creation completed', {
            totalUsers: users.length,
            duplicatesFound: duplicateErrors.length,
            usersProcessed: usersToProcess.length,
            successfulCreations: processingResult.success,
            failedCreations: processingResult.failed,
            leadsCreated: processingResult.leadIds.length,
            firebaseUsersCreated: processingResult.userIds.length
        });
        return processingResult;
    }
    /**
     * Process bulk updates
     */
    static async processUpdates(users, importId) {
        const result = {
            success: 0,
            failed: 0,
            userIds: [],
            errors: []
        };
        // Process in batches of 100
        const BATCH_SIZE = 100;
        for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const batch = users.slice(i, i + BATCH_SIZE);
            const startRow = i + 2;
            try {
                // Update Firebase users in parallel
                const firebaseUpdates = await Promise.allSettled(batch.map(user => {
                    const updateData = {};
                    if (user.name)
                        updateData.displayName = user.name;
                    if (user.phone)
                        updateData.phoneNumber = UserCreationService_1.UserCreationService.formatPhone(user.phone);
                    return UserCreationService_1.UserCreationService.updateFirebaseUser(user.uid, updateData);
                }));
                // Prepare profile updates
                const profileUpdates = batch
                    .map((user, index) => {
                    if (firebaseUpdates[index].status === 'fulfilled') {
                        return UserCreationService_1.UserCreationService.prepareProfileUpdate(user);
                    }
                    return null;
                })
                    .filter(Boolean);
                // Bulk update profiles
                if (profileUpdates.length > 0) {
                    await UserCreationService_1.UserCreationService.bulkUpdateProfiles(profileUpdates);
                    result.success += profileUpdates.length;
                    result.userIds.push(...profileUpdates.map(u => u.uid));
                }
                // Handle errors
                firebaseUpdates.forEach((settled, index) => {
                    if (settled.status === 'rejected') {
                        result.failed++;
                        result.errors.push({
                            row: startRow + index,
                            uid: batch[index].uid,
                            error: settled.reason?.message || 'Update failed'
                        });
                    }
                });
            }
            catch (error) {
                logger_1.default.error(`Update batch failed:`, error);
                batch.forEach((user, index) => {
                    result.failed++;
                    result.errors.push({
                        row: startRow + index,
                        uid: user.uid,
                        error: error.message || 'Batch update failed'
                    });
                });
            }
        }
        return result;
    }
    /**
     * Process bulk deletes
     */
    static async processDeletes(users, importId) {
        const result = {
            success: 0,
            failed: 0,
            userIds: [],
            errors: []
        };
        // Process in batches of 1000 (Firebase limit)
        const BATCH_SIZE = 1000;
        for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const batch = users.slice(i, i + BATCH_SIZE);
            const uids = batch.map(u => u.uid).filter(Boolean);
            const startRow = i + 2;
            try {
                // Bulk delete Firebase users
                const firebaseResult = await UserCreationService_1.UserCreationService.deleteUsersBulk(uids);
                // Track successful deletes
                result.success += firebaseResult.successCount;
                result.userIds.push(...firebaseResult.deletedUids);
                // Bulk delete profiles
                if (firebaseResult.deletedUids.length > 0) {
                    await UserCreationService_1.UserCreationService.bulkDeleteProfiles(firebaseResult.deletedUids);
                }
                // Handle errors
                if (firebaseResult.errors && firebaseResult.errors.length > 0) {
                    firebaseResult.errors.forEach((error) => {
                        result.failed++;
                        const originalIndex = uids.findIndex(uid => uid === error.uid);
                        result.errors.push({
                            row: startRow + (originalIndex >= 0 ? originalIndex : 0),
                            uid: error.uid,
                            error: error.error.message || 'Delete failed'
                        });
                    });
                }
            }
            catch (error) {
                logger_1.default.error(`Delete batch failed:`, error);
                batch.forEach((user, index) => {
                    result.failed++;
                    result.errors.push({
                        row: startRow + index,
                        uid: user.uid,
                        error: error.message || 'Batch delete failed'
                    });
                });
            }
        }
        return result;
    }
    static isValidPhone(phone) {
        // E.164 format: +[country code][number]
        const cleaned = phone.replace(/\s+/g, '').replace(/-/g, '');
        return /^\+?[1-9]\d{1,14}$/.test(cleaned);
    }
}
exports.BulkUploadService = BulkUploadService;
//# sourceMappingURL=BulkUploadService.js.map