import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
import { LeadService } from '../services/LeadService';
import { ActivationService } from '../services/ActivationService';
import { VerificationServiceClient } from '../services/VerificationServiceClient';
import logger from '../config/logger';
import { ILeadDocument } from '../models/Lead';
import { maskAadhaar, maskPAN, validateAadhaar, validatePAN, sanitizeAadhaarInput, sanitizePANInput } from '../utils/compliance';
import axios from 'axios';
import { env } from '../config/env';

export class DocumentController {
  /**
   * Upload document for a lead
   * POST /api/v1/admin/caos/leads/:leadId/documents
   */
  static async uploadDocument(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { leadId } = req.params;
      const { type, url, aadhaarNumber, panNumber, addressDetails } = req.body;

      if (!type) {
        res.status(400).json({
          success: false,
          error: 'Document type is required',
        });
        return;
      }

      const validTypes = ['aadhaar', 'pan', 'address_proof', 'skill_certificate', 'photo', 'other'];
      if (!validTypes.includes(type)) {
        res.status(400).json({
          success: false,
          error: `Invalid document type. Must be one of: ${validTypes.join(', ')}`,
        });
        return;
      }

      // Either URL or manual entry must be provided
      if (!url && !aadhaarNumber && !panNumber && !addressDetails) {
        res.status(400).json({
          success: false,
          error: 'Please provide either a document URL or manual entry (Aadhaar/PAN number or Address details)',
        });
        return;
      }

      // Validate and mask Aadhaar if provided
      let maskedAadhaar: string | undefined;
      if (type === 'aadhaar' && aadhaarNumber) {
        const sanitized = sanitizeAadhaarInput(aadhaarNumber);
        if (!validateAadhaar(sanitized)) {
          res.status(400).json({
            success: false,
            error: 'Invalid Aadhaar number. Must be exactly 12 digits.',
          });
          return;
        }
        maskedAadhaar = maskAadhaar(sanitized);
        
        // Audit log for sensitive data entry
        logger.info('Aadhaar number entered manually', {
          leadId,
          adminUid: req.admin.uid,
          adminName: req.admin.name,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate and mask PAN if provided
      let maskedPAN: string | undefined;
      if (type === 'pan' && panNumber) {
        const sanitized = sanitizePANInput(panNumber);
        if (!validatePAN(sanitized)) {
          res.status(400).json({
            success: false,
            error: 'Invalid PAN number. Format: ABCDE1234F (5 letters, 4 digits, 1 letter)',
          });
          return;
        }
        maskedPAN = maskPAN(sanitized);
        
        // Audit log for sensitive data entry
        logger.info('PAN number entered manually', {
          leadId,
          adminUid: req.admin.uid,
          adminName: req.admin.name,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate and process Address Proof if provided
      let addressDetailsText: string | undefined;
      if (type === 'address_proof' && addressDetails) {
        const trimmed = addressDetails.trim();
        if (trimmed.length < 10) {
          res.status(400).json({
            success: false,
            error: 'Address details must be at least 10 characters long',
          });
          return;
        }
        addressDetailsText = trimmed;
        
        // Audit log for address entry
        logger.info('Address proof entered manually', {
          leadId,
          adminUid: req.admin.uid,
          adminName: req.admin.name,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate type-specific requirements
      if (type === 'aadhaar' && !url && !maskedAadhaar) {
        res.status(400).json({
          success: false,
          error: 'Please provide either a document URL or Aadhaar number',
        });
        return;
      }

      if (type === 'pan' && !url && !maskedPAN) {
        res.status(400).json({
          success: false,
          error: 'Please provide either a document URL or PAN number',
        });
        return;
      }

      if (type === 'address_proof' && !url && !addressDetailsText) {
        res.status(400).json({
          success: false,
          error: 'Please provide either a document URL or address details',
        });
        return;
      }

      const lead = await LeadService.getLeadById(leadId);
      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found',
        });
        return;
      }

      // ✅ Document status based on role:
      // - Marketing: 'pending' (needs verification by operations team)
      // - Operations/Admin: 'verified' (trusted uploaders can auto-verify)
      // - Default: 'pending' (safe default - requires manual verification)
      const adminRole = req.admin?.role || 'marketing';
      // ✅ ALL document uploads require manual verification by operations/admin team
      // No auto-approval - all documents start with 'pending' status regardless of who uploads
      const documentStatus = 'pending';
      
      logger.info('Document upload - all documents set to pending for manual verification', {
        leadId,
        adminRole,
        documentStatus,
        documentType: type,
        adminUid: req.admin?.uid,
        uploadedBy: req.admin?.email
      });
      
      const newDocument: ILeadDocument = {
        type: type as ILeadDocument['type'],
        url,
        uploadedAt: new Date(),
        status: documentStatus, // All uploads require manual verification
        ...(maskedAadhaar && { aadhaarNumber: maskedAadhaar }),
        ...(maskedPAN && { panNumber: maskedPAN }),
        ...(addressDetailsText && { addressDetails: addressDetailsText }),
      };

      // Add document to lead
      const updatedLead = await LeadService.addDocument(leadId, newDocument);

      // ✅ Auto-approval removed: Leads will not be automatically approved after document upload
      // Approval must be done manually by the verification/operations team through the approval queue

      res.json({
        success: true,
        data: updatedLead,
        message: 'Document uploaded successfully',
      });
    } catch (error: any) {
      logger.error('Error in uploadDocument controller', {
        error: error.message,
        leadId: req.params.leadId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to upload document',
        message: error.message,
      });
    }
  }

  /**
   * Verify or reject a document
   * PUT /api/v1/admin/caos/leads/:leadId/documents/:documentIndex
   */
  static async verifyDocument(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { leadId, documentIndex } = req.params;
      const { 
        status, 
        rejectionReason,
        // ✅ Exact details (unmasked) - entered by operations/admin during verification
        exactAadhaarNumber,
        exactPANNumber,
        exactAddressDetails
      } = req.body;

      if (!status || !['verified', 'rejected'].includes(status)) {
        res.status(400).json({
          success: false,
          error: 'Status must be "verified" or "rejected"',
        });
        return;
      }

      if (status === 'rejected' && !rejectionReason) {
        res.status(400).json({
          success: false,
          error: 'Rejection reason is required when rejecting a document',
        });
        return;
      }

      const index = parseInt(documentIndex);
      if (isNaN(index) || index < 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid document index',
        });
        return;
      }

      const lead = await LeadService.getLeadById(leadId);
      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found',
        });
        return;
      }

      if (!lead.documents || index >= lead.documents.length) {
        res.status(404).json({
          success: false,
          error: 'Document not found',
        });
        return;
      }

      // ✅ For Aadhaar and PAN, use API verification instead of manual verification
      // This endpoint is now mainly for manual verification of other documents
      // or as a fallback if API verification fails
      const document = lead.documents[index];
      
      if (status === 'verified' && (document.type === 'aadhaar' || document.type === 'pan')) {
        res.status(400).json({
          success: false,
          error: `Please use the API verification endpoint for ${document.type.toUpperCase()}. Use /verify-${document.type} endpoint instead.`,
        });
        return;
      }

      // ✅ Validate exact details if verifying (for address_proof and other documents)
      if (status === 'verified') {
        if (document.type === 'address_proof' && !exactAddressDetails) {
          res.status(400).json({
            success: false,
            error: 'Exact address details are required when verifying Address Proof document',
          });
          return;
        }
      }

      const updatedLead = await LeadService.verifyDocument(
        leadId,
        index,
        status as 'verified' | 'rejected',
        req.admin.uid,
        req.admin.name,
        rejectionReason,
        // ✅ Pass exact details for storage
        status === 'verified' ? {
          exactAadhaarNumber,
          exactPANNumber,
          exactAddressDetails
        } : undefined
      );

      if (!updatedLead) {
        res.status(500).json({
          success: false,
          error: 'Failed to verify document',
        });
        return;
      }

      // ✅ For existing accounts: Update verification flags and store data immediately
      if (status === 'verified' && updatedLead.activationData?.firebaseUid) {
        const firebaseUid = updatedLead.activationData.firebaseUid;
        const document = updatedLead.documents[index];
        
        logger.info('Document verified for existing account, updating immediately', {
          leadId,
          firebaseUid,
          documentType: document.type
        });

        try {
          // 1. Update Profile verification flags
          const profileUpdate: any = {};
          
          if (document.type === 'aadhaar' && exactAadhaarNumber) {
            profileUpdate.isAadhaarVerified = true;
            profileUpdate.aadhaarVerifiedAt = document.verifiedAt;
            profileUpdate.isVerified = true; // Set general verification flag
            logger.info('Setting Aadhaar verification flags for existing account', {
              leadId,
              firebaseUid
            });
          }
          
          if (document.type === 'pan' && exactPANNumber) {
            profileUpdate.isPANVerified = true;
            profileUpdate.panVerifiedAt = document.verifiedAt;
            profileUpdate.isVerified = true; // Set general verification flag
            logger.info('Setting PAN verification flags for existing account', {
              leadId,
              firebaseUid
            });
          }
          
          // Update the profile if we have updates
          if (Object.keys(profileUpdate).length > 0) {
            await axios.patch(
              `${env.USER_SERVICE_URL}/api/v1/profiles/${firebaseUid}`,
              profileUpdate,
              {
                headers: {
                  'Content-Type': 'application/json',
                  'X-Service-Auth': env.SERVICE_AUTH_TOKEN
                }
              }
            );
            
            logger.info('✅ Updated profile verification flags for existing account', {
              leadId,
              firebaseUid,
              documentType: document.type,
              updates: profileUpdate
            });
          }
          
          // 2. Store exact details in verification service
          const verificationData: any = {};
          if (document.type === 'aadhaar' && exactAadhaarNumber) {
            verificationData.aadhaarNumber = exactAadhaarNumber;
          }
          if (document.type === 'pan' && exactPANNumber) {
            verificationData.panNumber = exactPANNumber;
          }
          if (document.type === 'address_proof' && exactAddressDetails) {
            verificationData.addressDetails = exactAddressDetails;
          }
          
          if (Object.keys(verificationData).length > 0) {
            // Pass admin info for tracking who verified the document
            const adminInfo = {
              userId: req.admin.uid,
              userName: req.admin.email || req.admin.uid,
              role: req.admin.role || 'admin'
            };
            
            await ActivationService.storeVerificationData(firebaseUid, verificationData, adminInfo);
            
            logger.info('✅ Stored verification data in verification service for existing account', {
              leadId,
              firebaseUid,
              documentType: document.type,
              verifiedBy: adminInfo.userId
            });
          }
        } catch (updateError: any) {
          logger.warn('Failed to update existing account verification immediately', {
            leadId,
            firebaseUid,
            error: updateError.message,
            stack: updateError.stack
          });
          // Don't fail the document verification if immediate update fails
          // The data is still stored in the lead document and can be synced later
        }
      } else if (status === 'verified') {
        logger.info('Document verified for new lead, data will be used during activation', {
          leadId,
          documentType: updatedLead.documents[index].type
        });
      }

      res.json({
        success: true,
        data: updatedLead,
        message: `Document ${status} successfully`,
      });
    } catch (error: any) {
      logger.error('Error in verifyDocument controller', {
        error: error.message,
        leadId: req.params.leadId,
        documentIndex: req.params.documentIndex,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to verify document',
        message: error.message,
      });
    }
  }

  /**
   * Initiate Aadhaar verification (sends OTP to user's mobile)
   * POST /api/v1/admin/caos/leads/:leadId/documents/:documentIndex/verify-aadhaar/initiate
   */
  static async initiateAadhaarVerification(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { leadId, documentIndex } = req.params;
      const { aadhaarNumber } = req.body;

      if (!aadhaarNumber) {
        res.status(400).json({
          success: false,
          error: 'Aadhaar number is required',
        });
        return;
      }

      // Validate Aadhaar format
      const cleaned = sanitizeAadhaarInput(aadhaarNumber);
      if (!validateAadhaar(cleaned)) {
        res.status(400).json({
          success: false,
          error: 'Invalid Aadhaar number format. Must be exactly 12 digits.',
        });
        return;
      }

      const index = parseInt(documentIndex);
      if (isNaN(index) || index < 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid document index',
        });
        return;
      }

      const lead = await LeadService.getLeadById(leadId);
      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found',
        });
        return;
      }

      if (!lead.documents || index >= lead.documents.length) {
        res.status(404).json({
          success: false,
          error: 'Document not found',
        });
        return;
      }

      const document = lead.documents[index];
      if (document.type !== 'aadhaar') {
        res.status(400).json({
          success: false,
          error: 'Document is not an Aadhaar document',
        });
        return;
      }

      // Get userId (use leadId temporarily if not activated, or firebaseUid if activated)
      const userId = lead.activationData?.firebaseUid || leadId;

      // Initiate Aadhaar verification via Cashfree
      const result = await VerificationServiceClient.initiateAadhaarVerification(userId, cleaned);

      if (!result.success) {
        // ✅ Log detailed error information
        logger.error('Aadhaar verification initiation failed', {
          leadId,
          userId,
          error: result.error,
          documentIndex: index
        });
        
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to initiate Aadhaar verification',
          details: result.error // ✅ Include error details for debugging
        });
        return;
      }

      // Store refId in document for later OTP verification
      // We'll store it temporarily in the document metadata or in a separate field
      // For now, we'll return it and frontend will send it back with OTP

      res.json({
        success: true,
        data: {
          refId: result.refId,
          transactionId: result.transactionId,
          maskedAadhaar: result.maskedAadhaar,
          testOtp: result.testOtp, // Only in sandbox mode
          message: result.testOtp 
            ? 'OTP sent successfully (Sandbox mode - use test OTP for testing)'
            : 'OTP sent to user\'s mobile number. Please ask user for OTP or enter if you have it.'
        },
      });
    } catch (error: any) {
      // ✅ Enhanced error logging
      logger.error('Error initiating Aadhaar verification', {
        error: error.message,
        errorStack: error.stack,
        leadId: req.params.leadId,
        documentIndex: req.params.documentIndex,
        userId: req.body.userId || req.params.leadId || 'unknown',
        aadhaarNumber: req.body.aadhaarNumber ? `${req.body.aadhaarNumber.slice(0, 4)}****` : 'missing'
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to initiate Aadhaar verification',
        message: error.message || 'An unexpected error occurred',
        // ✅ Include error details in development
        ...(process.env.NODE_ENV === 'development' && { details: error.stack })
      });
    }
  }

  /**
   * Verify Aadhaar OTP
   * POST /api/v1/admin/caos/leads/:leadId/documents/:documentIndex/verify-aadhaar/verify
   */
  static async verifyAadhaarOTP(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { leadId, documentIndex } = req.params;
      const { refId, otp, aadhaarNumber } = req.body;

      if (!refId || !otp) {
        res.status(400).json({
          success: false,
          error: 'refId and OTP are required',
        });
        return;
      }

      if (!aadhaarNumber) {
        res.status(400).json({
          success: false,
          error: 'Aadhaar number is required',
        });
        return;
      }

      const index = parseInt(documentIndex);
      if (isNaN(index) || index < 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid document index',
        });
        return;
      }

      const lead = await LeadService.getLeadById(leadId);
      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found',
        });
        return;
      }

      if (!lead.documents || index >= lead.documents.length) {
        res.status(404).json({
          success: false,
          error: 'Document not found',
        });
        return;
      }

      const document = lead.documents[index];
      if (document.type !== 'aadhaar') {
        res.status(400).json({
          success: false,
          error: 'Document is not an Aadhaar document',
        });
        return;
      }

      // Get userId (use leadId temporarily if not activated, or firebaseUid if activated)
      const userId = lead.activationData?.firebaseUid || leadId;

      // Verify Aadhaar OTP via Cashfree
      const result = await VerificationServiceClient.verifyAadhaarOTP(userId, refId, otp);

      if (!result.success || !result.verified) {
        // ✅ Log detailed error information
        logger.error('Aadhaar OTP verification failed', {
          leadId,
          userId,
          refId,
          error: result.error,
          documentIndex: index
        });
        
        res.status(400).json({
          success: false,
          error: result.error || 'Aadhaar verification failed',
          details: result.error, // ✅ Include error details for debugging
          data: {
            attemptsRemaining: 3 // This should come from verification service
          }
        });
        return;
      }

      // Clean and validate Aadhaar number
      const cleaned = sanitizeAadhaarInput(aadhaarNumber);
      if (!validateAadhaar(cleaned)) {
        res.status(400).json({
          success: false,
          error: 'Invalid Aadhaar number format',
        });
        return;
      }

      // Mark document as verified
      const updatedLead = await LeadService.verifyDocument(
        leadId,
        index,
        'verified',
        req.admin.uid,
        req.admin.name || req.admin.email,
        undefined,
        {
          exactAadhaarNumber: cleaned
        }
      );

      if (!updatedLead) {
        res.status(500).json({
          success: false,
          error: 'Failed to update document status',
        });
        return;
      }

      // ✅ Auto-extract and store address from Aadhaar verification
      if (result.verifiedData?.address) {
        try {
          await LeadService.updateAddressFromAadhaar(leadId, {
            line1: result.verifiedData.address.line1 || '',
            line2: result.verifiedData.address.line2,
            city: result.verifiedData.address.city || '',
            state: result.verifiedData.address.state || '',
            pincode: result.verifiedData.address.pincode || ''
          });

          // Mark address as verified (since it came from verified Aadhaar)
          await LeadService.markAddressAsVerified(leadId, {
            verifiedBy: req.admin.uid,
            verifiedAt: new Date(),
            source: 'aadhaar_verification'
          });

          logger.info('✅ Address extracted and verified from Aadhaar verification', {
            leadId,
            address: result.verifiedData.address
          });
        } catch (addressError: any) {
          logger.warn('Failed to update address from Aadhaar verification', {
            leadId,
            error: addressError.message
          });
          // Don't fail the verification if address update fails
        }
      }

      // ✅ Store verification data in verification service
      if (lead.activationData?.firebaseUid) {
        try {
          const adminInfo = {
            userId: req.admin.uid,
            userName: req.admin.name || req.admin.email || req.admin.uid,
            role: req.admin.role || 'admin'
          };

          await ActivationService.storeVerificationData(
            lead.activationData.firebaseUid,
            { aadhaarNumber: cleaned },
            adminInfo,
            { provider: 'cashfree', verificationSource: 'admin_api' } // ✅ Pass correct provider and source
          );

          // ✅ ALSO directly update profile to ensure isAadhaarVerified is set
          try {
            if (env.USER_SERVICE_URL) {
              await axios.patch(
                `${env.USER_SERVICE_URL}/api/v1/profiles/${lead.activationData.firebaseUid}/verification/aadhaar`,
                {
                  isAadhaarVerified: true,
                  aadhaarVerifiedAt: new Date().toISOString(),
                  maskedAadhaar: result.maskedAadhaar
                },
                {
                  headers: {
                    'X-Service-Auth': env.SERVICE_AUTH_TOKEN,
                    'X-Service-Name': 'admin-service',
                    'X-User-Id': lead.activationData.firebaseUid,
                    'Content-Type': 'application/json'
                  }
                }
              );
              logger.info('✅ Directly updated profile Aadhaar verification flag', {
                leadId,
                firebaseUid: lead.activationData.firebaseUid
              });
            }
          } catch (profileUpdateError: any) {
            logger.warn('Failed to directly update profile Aadhaar verification', {
              leadId,
              firebaseUid: lead.activationData.firebaseUid,
              error: profileUpdateError.message
            });
            // Don't fail - verification service update might have worked
          }

          logger.info('✅ Stored Aadhaar verification in verification service', {
            leadId,
            firebaseUid: lead.activationData.firebaseUid
          });
        } catch (verificationError: any) {
          logger.warn('Failed to store verification in verification service', {
            leadId,
            error: verificationError.message
          });
          // Don't fail the verification if storage fails
        }
      }

      res.json({
        success: true,
        data: {
          lead: updatedLead,
          verification: {
            verified: true,
            maskedAadhaar: result.maskedAadhaar,
            verifiedData: result.verifiedData
          },
          addressExtracted: !!result.verifiedData?.address
        },
        message: 'Aadhaar verified successfully' + (result.verifiedData?.address ? '. Address extracted and verified.' : ''),
      });
    } catch (error: any) {
      // ✅ Enhanced error logging
      logger.error('Error verifying Aadhaar OTP', {
        error: error.message,
        errorStack: error.stack,
        leadId: req.params.leadId,
        documentIndex: req.params.documentIndex,
        userId: req.body.userId || 'unknown',
        refId: req.body.refId || 'unknown'
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to verify Aadhaar OTP',
        message: error.message || 'An unexpected error occurred',
        // ✅ Include error details in development
        ...(process.env.NODE_ENV === 'development' && { details: error.stack })
      });
    }
  }

  /**
   * Verify PAN via Cashfree API
   * POST /api/v1/admin/caos/leads/:leadId/documents/:documentIndex/verify-pan
   */
  static async verifyPAN(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { leadId, documentIndex } = req.params;
      const { panNumber } = req.body;

      if (!panNumber) {
        res.status(400).json({
          success: false,
          error: 'PAN number is required',
        });
        return;
      }

      // Validate PAN format
      const cleaned = sanitizePANInput(panNumber);
      if (!validatePAN(cleaned)) {
        res.status(400).json({
          success: false,
          error: 'Invalid PAN number format. Must be in format ABCDE1234F',
        });
        return;
      }

      const index = parseInt(documentIndex);
      if (isNaN(index) || index < 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid document index',
        });
        return;
      }

      const lead = await LeadService.getLeadById(leadId);
      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found',
        });
        return;
      }

      if (!lead.documents || index >= lead.documents.length) {
        res.status(404).json({
          success: false,
          error: 'Document not found',
        });
        return;
      }

      const document = lead.documents[index];
      if (document.type !== 'pan') {
        res.status(400).json({
          success: false,
          error: 'Document is not a PAN document',
        });
        return;
      }

      // Get userId (use leadId temporarily if not activated, or firebaseUid if activated)
      const userId = lead.activationData?.firebaseUid || leadId;

      // Verify PAN via Cashfree
      const result = await VerificationServiceClient.verifyPAN(userId, cleaned);

      if (!result.success || !result.verified) {
        // ✅ Log detailed error information
        logger.error('PAN verification failed', {
          leadId,
          userId,
          error: result.error,
          documentIndex: index
        });
        
        res.status(400).json({
          success: false,
          error: result.error || 'PAN verification failed',
          details: result.error // ✅ Include error details for debugging
        });
        return;
      }

      // Mark document as verified
      const updatedLead = await LeadService.verifyDocument(
        leadId,
        index,
        'verified',
        req.admin.uid,
        req.admin.name || req.admin.email,
        undefined,
        {
          exactPANNumber: cleaned
        }
      );

      if (!updatedLead) {
        res.status(500).json({
          success: false,
          error: 'Failed to update document status',
        });
        return;
      }

      // ✅ Store verification data in verification service
      if (lead.activationData?.firebaseUid) {
        try {
          const adminInfo = {
            userId: req.admin.uid,
            userName: req.admin.name || req.admin.email || req.admin.uid,
            role: req.admin.role || 'admin'
          };

          await ActivationService.storeVerificationData(
            lead.activationData.firebaseUid,
            { panNumber: cleaned },
            adminInfo,
            { provider: 'cashfree', verificationSource: 'admin_api' } // ✅ Pass correct provider and source
          );

          // ✅ ALSO directly update profile to ensure isPANVerified is set
          try {
            if (env.USER_SERVICE_URL) {
              await axios.patch(
                `${env.USER_SERVICE_URL}/api/v1/profiles/${lead.activationData.firebaseUid}/verification/pan`,
                {
                  isPANVerified: true,
                  panVerifiedAt: new Date().toISOString()
                },
                {
                  headers: {
                    'X-Service-Auth': env.SERVICE_AUTH_TOKEN,
                    'X-Service-Name': 'admin-service',
                    'X-User-Id': lead.activationData.firebaseUid,
                    'Content-Type': 'application/json'
                  }
                }
              );
              logger.info('✅ Directly updated profile PAN verification flag', {
                leadId,
                firebaseUid: lead.activationData.firebaseUid
              });
            }
          } catch (profileUpdateError: any) {
            logger.warn('Failed to directly update profile PAN verification', {
              leadId,
              firebaseUid: lead.activationData.firebaseUid,
              error: profileUpdateError.message
            });
            // Don't fail - verification service update might have worked
          }

          logger.info('✅ Stored PAN verification in verification service', {
            leadId,
            firebaseUid: lead.activationData.firebaseUid
          });
        } catch (verificationError: any) {
          logger.warn('Failed to store verification in verification service', {
            leadId,
            error: verificationError.message
          });
          // Don't fail the verification if storage fails
        }
      }

      res.json({
        success: true,
        data: {
          lead: updatedLead,
          verification: {
            verified: true,
            maskedPAN: result.maskedPAN,
            verifiedData: result.verifiedData
          }
        },
        message: 'PAN verified successfully',
      });
    } catch (error: any) {
      // ✅ Enhanced error logging
      logger.error('Error verifying PAN', {
        error: error.message,
        errorStack: error.stack,
        leadId: req.params.leadId,
        documentIndex: req.params.documentIndex,
        userId: req.body.userId || req.params.leadId || 'unknown',
        panNumber: req.body.panNumber ? `${req.body.panNumber.slice(0, 2)}****${req.body.panNumber.slice(6)}` : 'missing'
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to verify PAN',
        message: error.message || 'An unexpected error occurred',
        // ✅ Include error details in development
        ...(process.env.NODE_ENV === 'development' && { details: error.stack })
      });
    }
  }

  /**
   * Delete a document
   * DELETE /api/v1/admin/caos/leads/:leadId/documents/:documentIndex
   */
  static async deleteDocument(req: AdminRequest, res: Response): Promise<void> {
    try {
      if (!req.admin) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { leadId, documentIndex } = req.params;
      const index = parseInt(documentIndex);

      if (isNaN(index) || index < 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid document index',
        });
        return;
      }

      const lead = await LeadService.getLeadById(leadId);
      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead not found',
        });
        return;
      }

      if (!lead.documents || index >= lead.documents.length) {
        res.status(404).json({
          success: false,
          error: 'Document not found',
        });
        return;
      }

      const updatedLead = await LeadService.deleteDocument(leadId, index);

      res.json({
        success: true,
        data: updatedLead,
        message: 'Document deleted successfully',
      });
    } catch (error: any) {
      logger.error('Error in deleteDocument controller', {
        error: error.message,
        leadId: req.params.leadId,
        documentIndex: req.params.documentIndex,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to delete document',
        message: error.message,
      });
    }
  }
}

