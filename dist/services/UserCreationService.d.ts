import { ParsedUser } from './BulkUploadService';
export declare class UserCreationService {
    /**
     * Bulk create Firebase users using createUser() in parallel batches
     * Note: Firebase Admin SDK only has createUser() (singular), not createUsers()
     * We process users in batches to handle bulk operations efficiently
     */
    static createUsersBulk(usersToCreate: Array<{
        email: string;
        password: string;
        displayName: string;
        phoneNumber: string;
        emailVerified: boolean;
        disabled: boolean;
    }>): Promise<{
        users: Array<{
            uid: string;
            email?: string;
            phoneNumber?: string;
        }>;
        errors: Array<{
            index: number;
            error: {
                message: string;
                code: string;
            };
        }>;
    }>;
    /**
     * Bulk create profiles via API (batched for efficiency)
     */
    static createProfilesBulk(profiles: Array<any>): Promise<{
        success: string[];
        failed: Array<{
            uid: string;
            userData: ParsedUser;
            error: string;
        }>;
    }>;
    /**
     * Prepare profile document for bulk insert (doesn't create, just prepares)
     */
    static prepareProfileDocument(uid: string, userData: ParsedUser, metadata: {
        isAdminVerified: boolean;
        phoneVerified: boolean;
    }): any;
    /**
     * Create tasker user in Firebase + Profile (legacy method for single user)
     */
    static createTasker(userData: ParsedUser): Promise<string>;
    /**
     * Create profile in User Service - matches exact Profile model structure
     */
    private static createProfile;
    /**
     * Parse skills from CSV - matches Profile model skills.list structure
     */
    private static parseSkills;
    /**
     * Validate primaryCategory against Profile model enum
     */
    private static validatePrimaryCategory;
    /**
     * Format phone to E.164 format
     */
    static formatPhone(phone: string): string;
    static generateTempPassword(): string;
    /**
     * Update Firebase user
     */
    static updateFirebaseUser(uid: string, updateData: {
        displayName?: string;
        phoneNumber?: string;
        disabled?: boolean;
    }): Promise<void>;
    /**
     * Bulk delete Firebase users (up to 1000 per call)
     */
    static deleteUsersBulk(uids: string[]): Promise<{
        successCount: number;
        failureCount: number;
        deletedUids: string[];
        errors: Array<{
            uid: string;
            error: {
                message: string;
                code: string;
            };
        }>;
    }>;
    /**
     * Prepare profile update document
     */
    static prepareProfileUpdate(userData: ParsedUser): any;
    /**
     * Bulk update profiles in MongoDB via API
     */
    static bulkUpdateProfiles(updates: Array<{
        uid: string;
        updatePayload: any;
    }>): Promise<void>;
    /**
     * Bulk delete profiles from MongoDB via API (optimized with deleteMany)
     */
    static bulkDeleteProfiles(uids: string[]): Promise<void>;
}
//# sourceMappingURL=UserCreationService.d.ts.map