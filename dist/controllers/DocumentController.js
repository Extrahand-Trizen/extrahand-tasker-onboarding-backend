"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentController = void 0;
const LeadService_1 = require("../services/LeadService");
const logger_1 = __importDefault(require("../config/logger"));
const compliance_1 = require("../utils/compliance");
class DocumentController {
    /**
     * Upload document for a lead
     * POST /api/v1/admin/caos/leads/:leadId/documents
     */
    static async uploadDocument(req, res) {
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
            let maskedAadhaar;
            if (type === 'aadhaar' && aadhaarNumber) {
                const sanitized = (0, compliance_1.sanitizeAadhaarInput)(aadhaarNumber);
                if (!(0, compliance_1.validateAadhaar)(sanitized)) {
                    res.status(400).json({
                        success: false,
                        error: 'Invalid Aadhaar number. Must be exactly 12 digits.',
                    });
                    return;
                }
                maskedAadhaar = (0, compliance_1.maskAadhaar)(sanitized);
                // Audit log for sensitive data entry
                logger_1.default.info('Aadhaar number entered manually', {
                    leadId,
                    adminUid: req.admin.uid,
                    adminName: req.admin.name,
                    timestamp: new Date().toISOString(),
                });
            }
            // Validate and mask PAN if provided
            let maskedPAN;
            if (type === 'pan' && panNumber) {
                const sanitized = (0, compliance_1.sanitizePANInput)(panNumber);
                if (!(0, compliance_1.validatePAN)(sanitized)) {
                    res.status(400).json({
                        success: false,
                        error: 'Invalid PAN number. Format: ABCDE1234F (5 letters, 4 digits, 1 letter)',
                    });
                    return;
                }
                maskedPAN = (0, compliance_1.maskPAN)(sanitized);
                // Audit log for sensitive data entry
                logger_1.default.info('PAN number entered manually', {
                    leadId,
                    adminUid: req.admin.uid,
                    adminName: req.admin.name,
                    timestamp: new Date().toISOString(),
                });
            }
            // Validate and process Address Proof if provided
            let addressDetailsText;
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
                logger_1.default.info('Address proof entered manually', {
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
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
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
            logger_1.default.info('Document upload - all documents set to pending for manual verification', {
                leadId,
                adminRole,
                documentStatus,
                documentType: type,
                adminUid: req.admin?.uid,
                uploadedBy: req.admin?.email
            });
            const newDocument = {
                type: type,
                url,
                uploadedAt: new Date(),
                status: documentStatus, // All uploads require manual verification
                ...(maskedAadhaar && { aadhaarNumber: maskedAadhaar }),
                ...(maskedPAN && { panNumber: maskedPAN }),
                ...(addressDetailsText && { addressDetails: addressDetailsText }),
            };
            // Add document to lead
            const updatedLead = await LeadService_1.LeadService.addDocument(leadId, newDocument);
            // ✅ Auto-approval removed: Leads will not be automatically approved after document upload
            // Approval must be done manually by the verification/operations team through the approval queue
            res.json({
                success: true,
                data: updatedLead,
                message: 'Document uploaded successfully',
            });
        }
        catch (error) {
            logger_1.default.error('Error in uploadDocument controller', {
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
    static async verifyDocument(req, res) {
        try {
            if (!req.admin) {
                res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                });
                return;
            }
            const { leadId, documentIndex } = req.params;
            const { status, rejectionReason, 
            // ✅ Exact details (unmasked) - entered by operations/admin during verification
            exactAadhaarNumber, exactPANNumber, exactAddressDetails } = req.body;
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
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
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
            // ✅ Validate exact details if verifying
            if (status === 'verified') {
                const document = lead.documents[index];
                // ✅ Require exact details when verifying Aadhaar, PAN, or Address Proof
                if (document.type === 'aadhaar' && !exactAadhaarNumber) {
                    res.status(400).json({
                        success: false,
                        error: 'Exact Aadhaar number is required when verifying Aadhaar document',
                    });
                    return;
                }
                if (document.type === 'pan' && !exactPANNumber) {
                    res.status(400).json({
                        success: false,
                        error: 'Exact PAN number is required when verifying PAN document',
                    });
                    return;
                }
                if (document.type === 'address_proof' && !exactAddressDetails) {
                    res.status(400).json({
                        success: false,
                        error: 'Exact address details are required when verifying Address Proof document',
                    });
                    return;
                }
            }
            const updatedLead = await LeadService_1.LeadService.verifyDocument(leadId, index, status, req.admin.uid, req.admin.name, rejectionReason, 
            // ✅ Pass exact details for storage
            status === 'verified' ? {
                exactAadhaarNumber,
                exactPANNumber,
                exactAddressDetails
            } : undefined);
            res.json({
                success: true,
                data: updatedLead,
                message: `Document ${status} successfully`,
            });
        }
        catch (error) {
            logger_1.default.error('Error in verifyDocument controller', {
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
     * Delete a document
     * DELETE /api/v1/admin/caos/leads/:leadId/documents/:documentIndex
     */
    static async deleteDocument(req, res) {
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
            const lead = await LeadService_1.LeadService.getLeadById(leadId);
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
            const updatedLead = await LeadService_1.LeadService.deleteDocument(leadId, index);
            res.json({
                success: true,
                data: updatedLead,
                message: 'Document deleted successfully',
            });
        }
        catch (error) {
            logger_1.default.error('Error in deleteDocument controller', {
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
exports.DocumentController = DocumentController;
//# sourceMappingURL=DocumentController.js.map