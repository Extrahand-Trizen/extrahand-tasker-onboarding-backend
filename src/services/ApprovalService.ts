import Lead, { ILead, LeadStatus } from '../models/Lead';
import logger from '../config/logger';

export interface ApprovalCriteria {
  hasRequiredDocuments: boolean;
  hasVerifiedDocuments: boolean;
  hasSkills: boolean;
  hasRequiredFields: boolean;
  isNotBlacklisted: boolean;
  isNotDuplicate: boolean;
  missingRequirements: string[];
  canApprove: boolean;
}

export class ApprovalService {
  /**
   * Check if a lead meets approval criteria
   */
  static checkApprovalCriteria(lead: ILead): ApprovalCriteria {
    const missingRequirements: string[] = [];

    // ✅ Documents are now optional - check which documents are present
    const hasAadhaar = lead.documents.some(doc => doc.type === 'aadhaar');
    const hasPan = lead.documents.some(doc => doc.type === 'pan');
    const hasAddressProof = lead.documents.some(doc => doc.type === 'address_proof');
    
    // ✅ Documents are optional - hasRequiredDocuments is true if at least one document exists
    // (or if no documents are required at all)
    const hasRequiredDocuments = true; // Documents are optional, so this is always true
    
    // ✅ Check if documents that ARE present are verified
    // Only add to missingRequirements if a document exists but is not verified
    const aadhaarDoc = lead.documents.find(doc => doc.type === 'aadhaar');
    const panDoc = lead.documents.find(doc => doc.type === 'pan');
    const addressProofDoc = lead.documents.find(doc => doc.type === 'address_proof');
    
    const verifiedAadhaar = aadhaarDoc?.status === 'verified';
    const verifiedPan = panDoc?.status === 'verified';
    const verifiedAddressProof = addressProofDoc?.status === 'verified';
    
    // ✅ hasVerifiedDocuments is true if all present documents are verified (or if no documents exist)
    // Only check verification for documents that actually exist
    const hasVerifiedDocuments = 
      (!hasAadhaar || verifiedAadhaar) &&
      (!hasPan || verifiedPan) &&
      (!hasAddressProof || verifiedAddressProof);
    
    // Only add to missingRequirements if a document exists but is not verified
    if (hasAadhaar && !verifiedAadhaar) {
      missingRequirements.push('Aadhaar verification pending');
    }
    if (hasPan && !verifiedPan) {
      missingRequirements.push('PAN verification pending');
    }
    if (hasAddressProof && !verifiedAddressProof) {
      missingRequirements.push('Address proof verification pending');
    }

    // Check if skills are assigned
    const hasSkills = lead.skills.length > 0 || (lead.primarySkill?.length || 0) > 0;
    if (!hasSkills) {
      missingRequirements.push('At least one skill');
    }

    // Check required fields
    const hasRequiredFields = !!(
      lead.name &&
      lead.phone &&
      lead.city &&
      lead.primarySkill
    );
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
    const canApprove = 
      hasRequiredDocuments &&
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
   * ✅ ISOLATION: Supports addedBy filter for qualifier isolation
   */
  static async getApprovalQueue(
    filters?: {
      city?: string;
      primarySkill?: string;
      addedBy?: string; // ✅ For qualifier isolation
      page?: number;
      limit?: number;
    }
  ): Promise<{
    leads: ILead[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 50;
      const skip = (page - 1) * limit;

      const query: any = {
        status: 'under_verification'
      };

      if (filters?.city) {
        query.city = new RegExp(filters.city, 'i');
      }

      if (filters?.primarySkill) {
        query.primarySkill = new RegExp(filters.primarySkill, 'i');
      }

      // ✅ ISOLATION: Filter by addedBy if provided (for qualifiers)
      if (filters?.addedBy) {
        query.addedBy = filters.addedBy;
      }

      const [leads, total] = await Promise.all([
        Lead.find(query)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Lead.countDocuments(query)
      ]);

      return {
        leads: leads as unknown as ILead[],
        total,
        page,
        limit
      };
    } catch (error: any) {
      logger.error('Error fetching approval queue', {
        error: error.message,
        filters
      });
      throw error;
    }
  }

  /**
   * Get leads ready for activation (approved status)
   * ✅ ISOLATION: Supports addedBy filter for qualifier isolation
   */
  static async getActivationQueue(
    filters?: {
      city?: string;
      primarySkill?: string;
      addedBy?: string; // ✅ For qualifier isolation
      page?: number;
      limit?: number;
    }
  ): Promise<{
    leads: ILead[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 50;
      const skip = (page - 1) * limit;

      // First, let's check how many approved leads exist (for debugging)
      const allApprovedCount = await Lead.countDocuments({ status: 'approved' });
      logger.info('Total approved leads in database', { count: allApprovedCount });

      // Query for approved leads that haven't been activated yet
      // A lead is activated if activationData.firebaseUid exists and is not empty
      // Simplified query: status approved AND (no activationData OR no valid firebaseUid)
      const baseQuery: any = {
        status: 'approved'
      };

      // ✅ ISOLATION: Filter by addedBy if provided (for qualifiers)
      if (filters?.addedBy) {
        baseQuery.addedBy = filters.addedBy;
      }

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

      logger.debug('Activation queue query', { 
        query: JSON.stringify(query),
        filters 
      });

      const [leads, total] = await Promise.all([
        Lead.find(query)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Lead.countDocuments(query)
      ]);

      logger.info('Activation queue query result', {
        totalApproved: allApprovedCount,
        totalReadyForActivation: total,
        leadsReturned: leads.length,
        query: JSON.stringify(query),
        sampleLeadIds: leads.slice(0, 5).map((l: any) => ({ leadId: l.leadId, status: l.status, hasActivationData: !!l.activationData, firebaseUid: l.activationData?.firebaseUid }))
      });

      return {
        leads: leads as unknown as ILead[],
        total,
        page,
        limit
      };
    } catch (error: any) {
      logger.error('Error fetching activation queue', {
        error: error.message,
        stack: error.stack,
        filters
      });
      throw error;
    }
  }

  /**
   * Get verification queue - leads with pending documents
   * GET /api/v1/admin/caos/leads/verification-queue
   */
  static async getVerificationQueue(
    filters?: {
      documentType?: string;
      status?: LeadStatus;
      city?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    leads: Array<ILead & {
      pendingDocuments: Array<{
        index: number;
        type: ILead['documents'][0]['type'];
        url?: string;
        uploadedAt?: Date;
      }>;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 20;
      const skip = (page - 1) * limit;

      // Query for leads with pending documents
      // Status should be 'under_verification' or 'documents_submitted'
      const statusFilter = filters?.status || { $in: ['under_verification', 'documents_submitted'] };
      
      const query: any = {
        status: statusFilter
      };

      if (filters?.city) {
        query.city = new RegExp(filters.city, 'i');
      }

      // Fetch all leads matching status and city filters
      // We'll filter for pending documents in memory since MongoDB array queries are complex
      const allLeads = await Lead.find(query)
        .sort({ updatedAt: -1 })
        .lean();

      // ✅ Filter leads and extract pending documents
      // Show ALL leads with status 'under_verification' or 'documents_submitted'
      // Even if they don't have pending documents (they might need documents uploaded or other verification)
      const leadsWithPendingDocs = (allLeads as unknown as ILead[])
        .map(lead => {
          // Filter for pending documents only
          const pendingDocuments = lead.documents
            .map((doc, index) => ({
              index,
              type: doc.type,
              url: doc.url,
              uploadedAt: doc.uploadedAt
            }))
            .filter((_, index) => lead.documents[index]?.status === 'pending');

          // Filter by document type if specified
          const filteredPendingDocs = filters?.documentType
            ? pendingDocuments.filter(doc => doc.type === filters.documentType)
            : pendingDocuments;

          // ✅ Include ALL leads with matching status, even if no pending documents
          // This allows verification team to see leads that need documents uploaded or other verification
          // If documentType filter is specified, only show leads with matching pending documents
          if (filters?.documentType && filteredPendingDocs.length === 0) {
            return null; // Document type filter specified but no matching pending documents
          }

          return {
            ...lead,
            pendingDocuments: filteredPendingDocs
          };
        })
        .filter((lead): lead is NonNullable<typeof lead> => lead !== null) as (ILead & { pendingDocuments: Array<{ index: number; type: ILead['documents'][0]['type']; url?: string; uploadedAt?: Date }> })[];

      // Apply pagination after filtering
      const total = leadsWithPendingDocs.length;
      const paginatedLeads = leadsWithPendingDocs.slice(skip, skip + limit);

      return {
        leads: paginatedLeads,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error: any) {
      logger.error('Error fetching verification queue', {
        error: error.message,
        filters
      });
      throw error;
    }
  }
}

