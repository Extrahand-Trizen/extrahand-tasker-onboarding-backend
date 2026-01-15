import mongoose, { Document } from 'mongoose';
export type LeadStatus = 'lead_added' | 'contacted' | 'interested' | 'documents_submitted' | 'under_verification' | 'approved' | 'rejected' | 'inactive';
export type AccountStatus = 'not_created' | 'invited' | 'activated' | 'suspended';
export type LeadSource = 'referral' | 'campaign' | 'walk-in' | 'agent' | 'other';
export type CreationMethod = 'manual_onboarding' | 'bulk_upload' | 'direct_activation';
export interface IStatusHistory {
    status: LeadStatus;
    changedBy: string;
    changedByName?: string;
    changedAt: Date;
    notes?: string;
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
    level?: 'beginner' | 'experienced';
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
    phone: string;
    email?: string;
    city: string;
    state?: string;
    address?: string;
    pincode?: string;
    source: LeadSource;
    sourceDetails?: string;
    agentCampaignId?: string;
    secondarySkill?: string;
    experienceLevel?: 'beginner' | 'intermediate' | 'experienced';
    workingDays?: string;
    preferredTimeSlot?: string;
    addedBy: string;
    addedByName?: string;
    status: LeadStatus;
    accountStatus: AccountStatus;
    statusHistory: IStatusHistory[];
    primarySkill: string;
    primaryCategory?: string;
    secondaryCategory?: string;
    skills: ILeadSkill[];
    documents: ILeadDocument[];
    verificationStatus: IVerificationStatus;
    lastContactedAt?: Date;
    lastContactedBy?: string;
    communicationLog: ICommunicationLog[];
    internalNotes: IInternalNote[];
    duplicateOf?: string;
    isDuplicate: boolean;
    blacklisted: boolean;
    activationData?: IActivationData;
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