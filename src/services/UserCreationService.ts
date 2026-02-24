import { auth } from '../config/firebase';
import axios from 'axios';
import logger from '../config/logger';
import { env } from '../config/env';
import { ParsedUser } from './BulkUploadService';

export class UserCreationService {
  /**
   * Bulk create Firebase users using createUser() in parallel batches
   * Note: Firebase Admin SDK only has createUser() (singular), not createUsers()
   * We process users in batches to handle bulk operations efficiently
   */
  static async createUsersBulk(
    usersToCreate: Array<{
      email: string;
      password: string;
      displayName: string;
      phoneNumber: string;
      emailVerified: boolean;
      disabled: boolean;
    }>
  ): Promise<{
    users: Array<{ uid: string; email?: string; phoneNumber?: string }>;
    errors: Array<{ index: number; error: { message: string; code: string } }>;
  }> {
    const users: Array<{ uid: string; email?: string; phoneNumber?: string }> = [];
    const errors: Array<{ index: number; error: { message: string; code: string } }> = [];

    // Process in batches to avoid overwhelming Firebase and rate limits
    const BATCH_SIZE = 10; // Process 10 users at a time
    const batches: typeof usersToCreate[] = [];
    
    for (let i = 0; i < usersToCreate.length; i += BATCH_SIZE) {
      batches.push(usersToCreate.slice(i, i + BATCH_SIZE));
    }

    logger.info(`Creating ${usersToCreate.length} Firebase users in ${batches.length} batch(es)`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const startIndex = batchIndex * BATCH_SIZE;

      // Create users in parallel within the batch using Promise.allSettled
      // This ensures all attempts are processed even if some fail
      const batchResults = await Promise.allSettled(
        batch.map((userData) =>
          auth.createUser({
            email: userData.email,
            password: userData.password,
            displayName: userData.displayName,
            phoneNumber: userData.phoneNumber,
            emailVerified: userData.emailVerified,
            disabled: userData.disabled
          })
        )
      );

      // Process results from this batch
      batchResults.forEach((result, index) => {
        const globalIndex = startIndex + index;
        
        if (result.status === 'fulfilled') {
          users.push({
            uid: result.value.uid,
            email: result.value.email,
            phoneNumber: result.value.phoneNumber
          });
        } else {
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

    logger.info(`Bulk Firebase user creation: ${users.length} created, ${errors.length} errors`);

    return { users, errors };
  }

  /**
   * Bulk create profiles via API (batched for efficiency)
   */
  static async createProfilesBulk(
    profiles: Array<any>
  ): Promise<{
    success: string[];
    failed: Array<{ uid: string; userData: ParsedUser; error: string }>;
  }> {
    const success: string[] = [];
    const failed: Array<{ uid: string; userData: ParsedUser; error: string }> = [];

    // Process in batches of 100 to avoid overwhelming the API
    const API_BATCH_SIZE = 100;
    
    for (let i = 0; i < profiles.length; i += API_BATCH_SIZE) {
      const batch = profiles.slice(i, i + API_BATCH_SIZE);
      
      // Create profiles in parallel within batch
      const batchResults = await Promise.allSettled(
        batch.map(profileData => {
          // Remove _userData before sending (it's only for internal use)
          const { _userData, ...cleanProfileData } = profileData;
          return axios.post(
            `${env.USER_SERVICE_URL}/api/v1/profiles`,
            cleanProfileData,
            {
              headers: {
                'X-Service-Auth': env.SERVICE_AUTH_TOKEN,
                'X-Service-Name': 'admin-service',
                'X-User-Id': profileData.uid
              }
            }
          );
        })
      );

      batchResults.forEach((settled, index) => {
        const profileData = batch[index];
        const userData = profileData._userData || { name: profileData.name || '', phone: profileData.phone || '' } as ParsedUser;
        
        if (settled.status === 'fulfilled' && 
            (settled.value.status === 201 || settled.value.status === 200)) {
          success.push(profileData.uid);
        } else {
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
  static prepareProfileDocument(
    uid: string,
    userData: ParsedUser,
    metadata: { isAdminVerified: boolean; phoneVerified: boolean }
  ): any {
    const skills = this.parseSkills(userData);
    
    const location = userData.address ? {
      type: 'Point' as const,
      coordinates: [0, 0] as [number, number], // Default coordinates (can be updated via geocoding)
      address: userData.address,
      addressDetails: {
        city: userData.city || null,
        state: userData.state || null,
        pinCode: userData.pincode || null,
        country: 'India'
      },
      isPublic: false
    } : null;
    
    const profileData: any = {
      uid,
      name: userData.name,
      email: null,
      phone: this.formatPhone(userData.phone!),
      userType: 'individual' as const,
      roles: ['helper'] as const,
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
        primaryCategory: this.validatePrimaryCategory(userData.primaryCategory || userData.primarySkill),
        list: skills,
        updatedAt: new Date()
      },
      roleVerifications: {
        helper: {
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
      verificationBadge: 'none' as const,
      onboardingStatus: {
        isCompleted: false,
        completedSteps: {
          location: !!userData.address,
          roles: true,
          profile: true
        },
        lastStep: 'location' as const
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
   * Create helper user in Firebase + Profile (legacy method for single user)
   */
  static async createHelper(userData: ParsedUser): Promise<string> {
    try {
      // 1. Generate temporary email (required by Firebase)
      const phoneDigits = userData.phone!.replace(/\D/g, '');
      const tempEmail = `helper_${phoneDigits}_${Date.now()}@extrahand.temp`;
      const tempPassword = this.generateTempPassword();
      
      // 2. Format phone number (E.164 format)
      const formattedPhone = this.formatPhone(userData.phone!);
      
      // 3. Create Firebase user
      const userRecord = await auth.createUser({
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

      logger.info('Helper created via bulk upload', {
        uid: userRecord.uid,
        phone: formattedPhone,
        name: userData.name
      });

      return userRecord.uid;
    } catch (error: any) {
      logger.error('Failed to create helper', {
        error: error.message,
        userData: { name: userData.name, phone: userData.phone }
      });
      throw new Error(`Failed to create helper: ${error.message}`);
    }
  }

  /**
   * Create profile in User Service - matches exact Profile model structure
   */
  private static async createProfile(
    uid: string, 
    userData: ParsedUser,
    metadata: { isAdminVerified: boolean; phoneVerified: boolean }
  ): Promise<void> {
    try {
      // Parse skills from CSV - matches Profile model structure
      const skills = this.parseSkills(userData);
      
      // Build location object - matches Profile model structure
      const location = userData.address ? {
        type: 'Point' as const,
        coordinates: [0, 0] as [number, number], // Default coordinates (can be updated via geocoding)
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
        phone: this.formatPhone(userData.phone!),
        userType: 'individual' as const,
        roles: ['helper'] as const,
        
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
          primaryCategory: this.validatePrimaryCategory(userData.primaryCategory || userData.primarySkill),
          list: skills,
          updatedAt: new Date()
        },
        
        // Role verifications - matches Profile model
        roleVerifications: {
          helper: {
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
        verificationBadge: 'none' as const,
        
        // Onboarding status - matches Profile model
        onboardingStatus: {
          isCompleted: false,
          completedSteps: {
            location: !!userData.address,
            roles: true, // Admin set roles
            profile: true // Admin created profile
          },
          lastStep: 'location' as const
        },
        
        // Optional fields
        photoURL: null,
        agreeUpdates: false,
        agreeTerms: false
      };

      const response = await axios.post(
        `${env.USER_SERVICE_URL}/api/v1/profiles`,
        profileData,
        {
          headers: {
            'X-Service-Auth': env.SERVICE_AUTH_TOKEN,
            'X-Service-Name': 'admin-service',
            'X-User-Id': uid
          }
        }
      );

      if (response.status !== 201 && response.status !== 200) {
        throw new Error(`Failed to create profile: ${response.statusText}`);
      }
    } catch (error: any) {
      logger.error('Failed to create profile', {
        uid,
        error: error.message,
        response: error.response?.data
      });
      throw new Error(`Failed to create profile: ${error.message}`);
    }
  }

  /**
   * Map experience level to years of experience range
   */
  private static mapExperienceLevelToYears(experienceLevel?: string, yearsOfExperience?: number): number {
    // If yearsOfExperience is provided, use it
    if (yearsOfExperience !== undefined && yearsOfExperience !== null && !isNaN(yearsOfExperience)) {
      return yearsOfExperience;
    }

    // Otherwise, map experience level to a representative value
    const level = (experienceLevel || '').toLowerCase();
    switch (level) {
      case 'beginner':
        return 1; // 0-1 years, use 1 as representative
      case 'intermediate':
        return 3; // 2-4 years, use 3 as representative
      case 'experienced':
        return 6; // 5+ years, use 6 as representative
      default:
        return 1; // Default to beginner
    }
  }

  /**
   * Parse skills from CSV - matches Profile model skills.list structure
   */
  private static parseSkills(userData: ParsedUser): Array<{
    name: string;
    category?: string;
    yearsOfExperience?: number;
    certified?: boolean;
    verified?: boolean;
  }> {
    // Use secondaryCategory as the skill name, or fall back to primaryCategory
    const skillName = userData.secondaryCategory || userData.secondarySkill || userData.primarySkill || userData.primaryCategory || 'General Service';
    
    const primaryCategory = this.validatePrimaryCategory(userData.primaryCategory || userData.primarySkill);
    
    // Map experience level to years of experience
    const yearsOfExperience = this.mapExperienceLevelToYears(
      userData.experienceLevel,
      userData.yearsOfExperience as number | undefined
    );

    return [{
      name: skillName,
      category: primaryCategory,
      yearsOfExperience: yearsOfExperience,
      certified: false,
      verified: false
    }];
  }

  /**
   * Validate primaryCategory against Profile model enum
   */
  private static validatePrimaryCategory(category?: string): string {
    const validCategories = [
      'cleaning',
      'handyperson',
      'moving',
      'gardening',
      'business',
      'marketing',
      'tech',
      'tutoring',
      'photography',
      'beauty',
      'pet-care',
      'events',
      'water-tanker',
      'other'
    ];
    const normalized = category?.toLowerCase() || 'other';
    
    // Map common variations to valid categories
    const categoryMap: Record<string, string> = {
      // Legacy mappings for backward compatibility
      'home services': 'handyperson',
      'home-services': 'handyperson',
      'home_services': 'handyperson',
      'delivery': 'moving',
      'delivery & transport': 'moving',
      'delivery and transport': 'moving',
      // Current categories
      'cleaning': 'cleaning',
      'handyperson': 'handyperson',
      'handy person': 'handyperson',
      'moving': 'moving',
      'moving & delivery': 'moving',
      'moving and delivery': 'moving',
      'gardening': 'gardening',
      'business': 'business',
      'business services': 'business',
      'marketing': 'marketing',
      'marketing & design': 'marketing',
      'marketing and design': 'marketing',
      'tech': 'tech',
      'tech support': 'tech',
      'technology': 'tech',
      'tutoring': 'tutoring',
      'education & tutoring': 'tutoring',
      'education and tutoring': 'tutoring',
      'photography': 'photography',
      'beauty': 'beauty',
      'beauty & wellness': 'beauty',
      'beauty and wellness': 'beauty',
      'pet care': 'pet-care',
      'pet-care': 'pet-care',
      'events': 'events',
      'events & entertainment': 'events',
      'events and entertainment': 'events',
      'water-tanker': 'water-tanker',
      'water & tanker services': 'water-tanker',
      'water and tanker services': 'water-tanker',
      'water tanker': 'water-tanker',
      'other': 'other'
    };
    
    const mapped = categoryMap[normalized] || 'other';
    return validCategories.includes(mapped) ? mapped : 'other';
  }

  /**
   * Format phone to E.164 format
   */
  static formatPhone(phone: string): string {
    // Remove all non-digits
    let digits = phone.replace(/\D/g, '');

    // If starts with India country code and has 12 digits, strip the 91
    if (digits.startsWith('91') && digits.length === 12) {
      digits = digits.slice(2);
    }

    // If exactly 10 digits, assume India and prepend +91
    if (digits.length === 10) {
      return `+91${digits}`;
    }

    // If already includes country code (11-15 digits), prepend +
    if (digits.length >= 11 && digits.length <= 15) {
      return `+${digits}`;
    }

    // Fallback: return with plus, even if length unexpected
    return `+${digits}`;
  }

  static generateTempPassword(): string {
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
  static async updateFirebaseUser(
    uid: string,
    updateData: {
      displayName?: string;
      phoneNumber?: string;
      disabled?: boolean;
    }
  ): Promise<void> {
    try {
      await auth.updateUser(uid, updateData);
      logger.info('Firebase user updated', { uid });
    } catch (error: any) {
      logger.error('Failed to update Firebase user', { uid, error: error.message });
      throw new Error(`Failed to update Firebase user: ${error.message}`);
    }
  }

  /**
   * Bulk delete Firebase users (up to 1000 per call)
   */
  static async deleteUsersBulk(
    uids: string[]
  ): Promise<{
    successCount: number;
    failureCount: number;
    deletedUids: string[];
    errors: Array<{ uid: string; error: { message: string; code: string } }>;
  }> {
    try {
      // Firebase deleteUsers supports up to 1000 UIDs
      const result = await auth.deleteUsers(uids);
      
      logger.info(`Bulk delete: ${result.successCount} deleted, ${result.failureCount} failed`);
      
      return {
        successCount: result.successCount,
        failureCount: result.failureCount,
        deletedUids: uids.filter((uid, index) => {
          // Find if this UID had an error
          const error = result.errors?.find((e: any) => e.index === index);
          return !error;
        }),
        errors: result.errors?.map((e: any) => ({
          uid: uids[e.index],
          error: {
            message: e.error.message,
            code: e.error.code || 'unknown'
          }
        })) || []
      };
    } catch (error: any) {
      logger.error('Bulk delete failed:', error);
      throw new Error(`Bulk delete failed: ${error.message}`);
    }
  }

  /**
   * Prepare profile update document
   */
  static prepareProfileUpdate(userData: ParsedUser): any {
    const updatePayload: any = {};

    if (userData.name) updatePayload.name = userData.name;
    if (userData.phone) updatePayload.phone = this.formatPhone(userData.phone);
    if (userData.isActive !== undefined) updatePayload.isActive = userData.isActive;

    // Location update
    if (userData.address) {
      updatePayload.location = {
        type: 'Point' as const,
        coordinates: [0, 0] as [number, number],
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
        primaryCategory: this.validatePrimaryCategory(userData.primaryCategory || userData.primarySkill),
        list: skills,
        updatedAt: new Date()
      };
    }

    return {
      uid: userData.uid!,
      updatePayload
    };
  }

  /**
   * Bulk update profiles in MongoDB via API
   */
  static async bulkUpdateProfiles(
    updates: Array<{ uid: string; updatePayload: any }>
  ): Promise<void> {
    try {
      // Process in batches of 100
      const BATCH_SIZE = 100;
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        
        await Promise.allSettled(
          batch.map(({ uid, updatePayload }) =>
            axios.put(
              `${env.USER_SERVICE_URL}/api/v1/profiles/${uid}`,
              updatePayload,
              {
                headers: {
                  'X-Service-Auth': env.SERVICE_AUTH_TOKEN,
                  'X-Service-Name': 'admin-service',
                  'X-User-Id': uid
                }
              }
            )
          )
        );
      }
    } catch (error: any) {
      logger.error('Bulk profile update failed:', error);
      throw new Error(`Bulk profile update failed: ${error.message}`);
    }
  }

  /**
   * Bulk delete profiles from MongoDB via API (optimized with deleteMany)
   */
  static async bulkDeleteProfiles(uids: string[]): Promise<void> {
    try {
      // Process in batches of 1000 (MongoDB limit for $in operator)
      const BATCH_SIZE = 1000;
      for (let i = 0; i < uids.length; i += BATCH_SIZE) {
        const batch = uids.slice(i, i + BATCH_SIZE);
        
        const response = await axios.delete(
          `${env.USER_SERVICE_URL}/api/v1/profiles/bulk`,
          {
            data: { uids: batch },
            headers: {
              'X-Service-Auth': env.SERVICE_AUTH_TOKEN,
              'X-Service-Name': 'admin-service',
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.status !== 200 || !response.data?.success) {
          throw new Error(`Bulk delete failed: ${response.data?.error || response.statusText}`);
        }
        
        logger.info(`Bulk deleted ${response.data.deletedCount || batch.length} profiles from MongoDB`, {
          requested: batch.length,
          deleted: response.data.deletedCount
        });
      }
    } catch (error: any) {
      logger.error('Bulk profile delete failed:', error);
      throw new Error(`Bulk profile delete failed: ${error.message}`);
    }
  }
}

