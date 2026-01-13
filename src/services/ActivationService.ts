import { auth } from '../config/firebase';
import Lead, { ILead } from '../models/Lead';
import { UserCreationService } from './UserCreationService';
import { LeadService } from './LeadService';
import { UserRole } from '../lib/permissions';
import logger from '../config/logger';
import axios from 'axios';
import { env } from '../config/env';
import { maskAadhaar, maskPAN, sanitizeAadhaarInput, sanitizePANInput, validateAadhaar, validatePAN } from '../utils/compliance';

export interface ActivationResult {
  success: boolean;
  firebaseUid?: string;
  profileCreated?: boolean;
  error?: string;
}

export class ActivationService {
  /**
   * Activate a single lead (create Firebase user + Profile)
   * @param skipVerificationService If true, skips storing verification data (for quick onboarding Scenario B)
   */
  static async activateLead(
    leadId: string,
    activatedBy: string,
    activatedByName?: string,
    role?: string,
    skipVerificationService?: boolean
  ): Promise<ActivationResult> {
    try {
      const lead = await Lead.findOne({ leadId });
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
          userRecord = await auth.getUserByEmail(lead.email);
          existingUser = true;
          logger.info('Found existing Firebase user for lead email', {
            leadId,
            firebaseUid: userRecord.uid,
            email: lead.email
          });
        } catch (error: any) {
          // User doesn't exist, we'll create a new one
          if (error.code !== 'auth/user-not-found') {
            throw error; // Re-throw if it's a different error
          }
        }
      }

      // Create new Firebase user if one doesn't exist
      if (!userRecord) {
        try {
          userRecord = await auth.createUser({
            email: lead.email || `user_${Date.now()}@extrahand.temp`,
            password: tempPassword,
            displayName: lead.name,
            phoneNumber: lead.phone ? `+91${lead.phone}` : undefined,
            emailVerified: false,
            disabled: false
          });
          logger.info('Firebase user created for lead', {
            leadId,
            firebaseUid: userRecord.uid
          });
        } catch (error: any) {
          // If email conflict, try with temp email
          if (error.code === 'auth/email-already-exists' || error.message?.includes('already in use')) {
            logger.warn('Email already exists, using temp email', {
              leadId,
              email: lead.email
            });
            userRecord = await auth.createUser({
              email: `user_${lead.phone || Date.now()}@extrahand.temp`,
              password: tempPassword,
              displayName: lead.name,
              phoneNumber: lead.phone ? `+91${lead.phone}` : undefined,
              emailVerified: false,
              disabled: false
            });
            logger.info('Firebase user created with temp email', {
              leadId,
              firebaseUid: userRecord.uid,
              tempEmail: userRecord.email
            });
          } else {
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
          if (!env.USER_SERVICE_URL) {
            throw new Error('USER_SERVICE_URL is required for phone check but not configured');
          }
          const checkResponse = await axios.post(
            `${env.USER_SERVICE_URL}/api/v1/auth/check-phone`,
            { phone: formattedPhone },
            {
              headers: {
                'X-Service-Auth': env.SERVICE_AUTH_TOKEN,
                'X-Service-Name': 'admin-service'
              }
            }
          );

          if (checkResponse.data?.exists) {
            throw new Error(`Profile already exists with phone number ${formattedPhone}. Cannot create duplicate profile.`);
          }

          logger.debug('Phone number check passed - no existing profile found', {
            leadId,
            phone: formattedPhone
          });
        } catch (error: any) {
          // If the error is about existing profile, re-throw it
          if (error.message?.includes('already exists') || error.message?.includes('Profile already exists')) {
            throw error;
          }
          // If check-phone endpoint doesn't exist or returns different format, log and continue
          // We'll let the profile creation fail if there's a duplicate
          logger.warn('Could not check phone existence, proceeding with activation', {
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
      // ✅ Address is now optional - can come from Aadhaar verification or address_proof document
      const hasAddress = !!addressDoc && addressDoc.status === 'verified';
      
      // ✅ Extract exact details (unmasked) for storage in verification service
      // Prefer exact details (entered during verification) over masked values
      // Exact details are entered by operations/admin during document verification
      const exactAadhaar = aadhaarDoc?.exactAadhaarNumber || aadhaarDoc?.aadhaarNumber;
      const exactPAN = panDoc?.exactPANNumber || panDoc?.panNumber;
      // ✅ Address can come from address_proof document OR from Aadhaar verification
      // Priority: Aadhaar verification address > address_proof document > lead address
      const exactAddress = addressDoc?.exactAddressDetails || addressDoc?.addressDetails;
      
      // ✅ Check if address was extracted from Aadhaar verification
      // This would be stored in lead's address fields if Aadhaar verification was done via API
      // For now, we'll use the lead's address/city/state/pincode which should be updated by LeadService.updateAddressFromAadhaar
      
      // ✅ Extract photo URL if photo document exists and is verified
      const photoURL = photoDoc?.url || null;
      
      logger.info('Extracting verification data for account creation (onboarding flow only)', {
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
      let verificationBadge: 'none' | 'basic' | 'verified' | 'trusted' = 'none';
      
      if (hasAadhaar && hasPAN) {
        verificationTier = 2;
        verificationBadge = 'verified';
      } else if (hasAadhaar) {
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
        // ✅ Location format matches Profile model structure
        // Priority: Address from Aadhaar verification > address_proof document > lead address
        location: (lead.address || lead.city || exactAddress) ? {
          type: 'Point',
          coordinates: [0, 0] as [number, number], // Default coordinates (can be updated via geocoding)
          address: exactAddress || lead.address || `${lead.city}, ${lead.state || ''} - ${lead.pincode || ''}`,
          addressDetails: {
            city: lead.city || null,
            state: lead.state || null,
            pinCode: lead.pincode || null,
            country: 'India'
          },
          isPublic: false
        } : null,
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
        await axios.post(
          `${env.USER_SERVICE_URL}/api/v1/profiles`,
          profileData,
          {
            headers: {
              'X-Service-Auth': env.SERVICE_AUTH_TOKEN,
              'X-Service-Name': 'admin-service',
              'X-User-Id': userRecord.uid
            }
          }
        );
        profileCreated = true;
        logger.info('Profile created for lead', { leadId, firebaseUid: userRecord.uid });
        
        // ✅ REMOVED: Auto confirmation email sending
        // Emails should be sent manually when needed, not automatically during activation
        
        // ✅ Store exact details (unmasked) in verification service
        // These will be used for user verification and profile creation
        // Skip for Scenario B (quick onboarding - users verify themselves later)
        if ((hasAadhaar || hasPAN || hasAddress) && !skipVerificationService) {
          try {
            // Get document verifier info if available
            const aadhaarDoc = lead.documents.find(d => d.type === 'aadhaar' && d.status === 'verified');
            const panDoc = lead.documents.find(d => d.type === 'pan' && d.status === 'verified');
            
            // Use the document verifier's info if available
            let verifierInfo: { userId: string; userName: string; role: string } | undefined = undefined;
            if (aadhaarDoc?.verifiedBy || panDoc?.verifiedBy) {
              const verifierId = aadhaarDoc?.verifiedBy || panDoc?.verifiedBy;
              if (verifierId) {
                verifierInfo = {
                  userId: verifierId,
                  userName: 'Document Verifier', // Admin who verified during lead stage
                  role: 'operations'
                };
              }
            }
            
            await this.storeVerificationData(
              userRecord.uid, 
              {
                aadhaarNumber: exactAadhaar,
                panNumber: exactPAN,
                addressDetails: exactAddress
              },
              verifierInfo
            );
            logger.info('✅ Verification data stored for activated lead (Scenario A)', {
              leadId,
              firebaseUid: userRecord.uid,
              hasAadhaar,
              hasPAN,
              verifiedBy: verifierInfo?.userId || 'system'
            });
          } catch (verificationError: any) {
            logger.warn('Failed to store verification data for activated lead', {
              leadId,
              firebaseUid: userRecord.uid,
              error: verificationError.message
            });
            // Don't fail activation if verification storage fails
          }
        } else if (skipVerificationService) {
          logger.info('⏭️  Skipping verification service storage (Scenario B - quick onboarding)', {
            leadId,
            firebaseUid: userRecord.uid,
            note: 'User will verify themselves via Cashfree later'
          });
        }
      } catch (profileError: any) {
        logger.error('Failed to create profile, but Firebase user created', {
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

      // ✅ UPDATE: Set accountStatus to 'activated' (NOT lead status)
      lead.accountStatus = 'activated';
      
      // ✅ KEEP lead status as 'approved' (don't change it)
      // Lead status remains 'approved' - that's the end of the lead journey
      
      // Add status history entry for account activation
      lead.statusHistory.push({
        status: lead.status,  // Keep lead status (should be 'approved')
        changedBy: activatedBy,
        changedAt: new Date(),
        notes: `Account activated. Firebase UID: ${userRecord.uid}. Account status: activated`
      });
      
      await lead.save();

      logger.info('Lead activated successfully', {
        leadId,
        firebaseUid: userRecord.uid,
        profileCreated,
        accountStatus: 'activated',
        leadStatus: lead.status  // Should remain 'approved'
      });

      return {
        success: true,
        firebaseUid: userRecord.uid,
        profileCreated
      };
    } catch (error: any) {
      logger.error('Error activating lead', {
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
   * @param skipVerificationService If true, skips storing verification data (for Scenario B)
   */
  static async bulkActivateLeads(
    leadIds: string[],
    activatedBy: string,
    activatedByName?: string,
    role?: string,
    skipVerificationService?: boolean
  ): Promise<{
    success: Array<{ leadId: string; firebaseUid: string; profileCreated: boolean }>;
    failed: Array<{ leadId: string; error: string }>;
  }> {
    const success: Array<{ leadId: string; firebaseUid: string; profileCreated: boolean }> = [];
    const failed: Array<{ leadId: string; error: string }> = [];

    // Process in batches to avoid overwhelming Firebase
    const BATCH_SIZE = 10;
    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const batch = leadIds.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.allSettled(
        batch.map(leadId => this.activateLead(leadId, activatedBy, activatedByName, role, skipVerificationService))
      );

      results.forEach((result, index) => {
        const leadId = batch[index];
        if (result.status === 'fulfilled' && result.value.success) {
          success.push({
            leadId,
            firebaseUid: result.value.firebaseUid!,
            profileCreated: result.value.profileCreated || false
          });
        } else {
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

    logger.info('Bulk activation completed', {
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
   * 
   * @param uid Firebase UID
   * @param data Verification data (aadhaar/pan/address)
   * @param adminInfo Optional admin information for tracking who verified
   * @param options Optional provider and verificationSource (defaults to admin_manual)
   */
  static async storeVerificationData(
    uid: string,
    data: { aadhaarNumber?: string; panNumber?: string; addressDetails?: string },
    adminInfo?: { userId: string; userName: string; role: string },
    options?: { provider?: string; verificationSource?: string }
  ): Promise<void> {
    if (!env.VERIFICATION_SERVICE_URL) {
      logger.warn('VERIFICATION_SERVICE_URL not configured, skipping verification data storage');
      return;
    }

    const verificationRecords: Array<{ type: string; maskedValue: string }> = [];

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
        await axios.post(
          `${env.VERIFICATION_SERVICE_URL}/api/v1/verification/bulk-store`,
          {
            userId: uid,
            type: record.type,
            maskedValue: record.maskedValue,
            status: 'verified',
            verifiedAt: new Date().toISOString(),
            provider: options?.provider || 'admin_manual', // ✅ Use provided provider
            verificationSource: options?.verificationSource || 'admin_manual', // ✅ Use provided source
            verifiedBy: adminInfo, // ✅ This will now have correct role from database
            consent: {
              given: true,
              givenAt: new Date().toISOString(),
              consentVersion: 'v1.0',
              consentText: `Document verified by admin team - ${record.type} verification`
            }
          },
          {
            headers: {
              'X-Service-Auth': env.SERVICE_AUTH_TOKEN,
              'X-Service-Name': 'admin-service',
              'Content-Type': 'application/json'
            }
          }
        );
        logger.info(`✅ Stored ${record.type} verification for activated user`, {
          uid,
          type: record.type,
          source: options?.verificationSource || 'admin_manual',
          verifiedBy: adminInfo?.userId || 'system',
          role: adminInfo?.role || 'unknown'
        });
      } catch (error: any) {
        logger.error(`Failed to store ${record.type} verification for ${uid}`, {
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
  private static generateTempPassword(): string {
    // Generate a random 12-character password
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}





