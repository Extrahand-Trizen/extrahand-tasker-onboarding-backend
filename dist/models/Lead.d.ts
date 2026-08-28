import mongoose, { Document } from 'mongoose';
export type LeadStatus = 'lead_added' | 'contacted_not_lifted' | 'contacted_not_interested' | 'contacted_interested' | 'documents_submitted' | 'under_verification' | 'approved' | 'inactive';
export type AccountStatus = 'not_created' | 'invited' | 'activated' | 'suspended';
export type LeadSource = 'referral' | 'campaign' | 'walk-in' | 'agent' | 'other';
export type CreationMethod = 'manual_onboarding' | 'bulk_upload' | 'direct_activation';
export interface IStatusHistory {
    status: LeadStatus;
    changedBy: string;
    changedByName?: string;
    changedAt: Date;
    notes?: string;
    statusReasonCode?: string;
    statusReasonText?: string;
    callbackAt?: Date;
    expectedOnboardingAt?: Date;
}
export interface ILeadDocument {
    type: 'aadhaar' | 'pan' | 'address_proof' | 'skill_certificate' | 'photo' | 'other';
    url?: string;
    uploadedAt?: Date;
    status: 'pending' | 'verified' | 'rejected';
    rejectionReason?: string;
    verifiedBy?: string;
    verifiedAt?: Date;
    aadhaarNumber?: string;
    panNumber?: string;
    addressDetails?: string;
    exactAadhaarNumber?: string;
    exactPANNumber?: string;
    exactAddressDetails?: string;
}
export interface ILeadSkill {
    name: string;
    category?: string;
    level?: 'beginner' | 'intermediate' | 'experienced';
    toolsAvailable?: boolean;
    assignedBy?: string;
    assignedAt?: Date;
}
export interface IVerificationStatus {
    aadhaar?: {
        status: 'pending' | 'verified' | 'failed';
        verifiedAt?: Date;
        refId?: string;
    };
    pan?: {
        status: 'pending' | 'verified' | 'failed';
        verifiedAt?: Date;
    };
    bank?: {
        status: 'pending' | 'verified' | 'failed';
        verifiedAt?: Date;
    };
}
export interface ICommunicationLog {
    type: 'call' | 'sms' | 'whatsapp' | 'email' | 'note';
    by: string;
    byName?: string;
    at: Date;
    notes?: string;
}
export interface IInternalNote {
    note: string;
    addedBy: string;
    addedByName?: string;
    addedAt: Date;
    isPrivate?: boolean;
}
export interface IActivationData {
    activatedAt: Date;
    firebaseUid: string;
    profileCreated: boolean;
}
export interface ILead extends Document {
    leadId: string;
    name: string;
    phone?: string;
    landline?: string;
    email?: string;
    city?: string;
    state?: string;
    address?: string;
    pincode?: string;
    isGatedCommunity?: boolean;
    gatedCommunityName?: string;
    source?: LeadSource;
    sourceDetails?: string;
    agentCampaignId?: string;
    secondarySkill?: string;
    experienceLevel?: 'beginner' | 'intermediate' | 'experienced';
    workingDays?: string;
    preferredTimeSlot?: string;
    addedBy: string;
    addedByName?: string;
    pickedBy?: string;
    pickedByName?: string;
    pickedAt?: Date;
    lastTransferredBy?: string;
    lastTransferredByName?: string;
    lastTransferredAt?: Date;
    lastTransferDecision?: 'accepted' | 'rejected';
    lastTransferDecisionBy?: string;
    lastTransferDecisionByName?: string;
    lastTransferDecisionAt?: Date;
    transferPendingTo?: string;
    transferPendingToName?: string;
    transferPendingAt?: Date;
    status: LeadStatus;
    accountStatus: AccountStatus;
    statusHistory: IStatusHistory[];
    primarySkill?: string;
    primaryCategory?: string;
    secondaryCategory?: string;
    skills: ILeadSkill[];
    documents: ILeadDocument[];
    verificationStatus: IVerificationStatus;
    lastContactedAt?: Date;
    lastContactedBy?: string;
    nextCallbackAt?: Date;
    expectedOnboardingAt?: Date;
    statusReasonCode?: string;
    statusReasonText?: string;
    lastInterestedBy?: string;
    lastNotInterestedBy?: string;
    lastNotLiftedBy?: string;
    attempts?: string;
    communicationLog: ICommunicationLog[];
    internalNotes: IInternalNote[];
    duplicateOf?: string;
    isDuplicate: boolean;
    blacklisted: boolean;
    activationData?: IActivationData;
    conversionData?: {
        platformUid?: string;
        isAadhaarVerified?: boolean;
        lastCheckedAt?: Date;
    };
    creationMethod?: CreationMethod;
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<ILead, {}, {}, {}, mongoose.Document<unknown, {}, ILead, {}, {}> & ILead & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=Lead.d.ts.map