import mongoose, { Schema, Document } from 'mongoose';

// ✅ LEAD STATUS - CRM/Onboarding concern (ends at approved)
export type LeadStatus = 
  | 'lead_added'
  | 'contacted_not_lifted'
  | 'contacted_not_interested'
  | 'contacted_interested'
  | 'documents_submitted'
  | 'under_verification'
  | 'approved'
  | 'inactive';

// ✅ ACCOUNT STATUS - Auth/Platform concern (starts after lead approval)
export type AccountStatus = 
  | 'not_created'  // No login exists yet
  | 'invited'      // Invite sent, waiting for user
  | 'activated'    // User accepted invite + can log in
  | 'suspended';   // Access blocked

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
  // Manual entry fields (stored in masked format for compliance)
  aadhaarNumber?: string; // Masked format: XXXX XXXX 1234 (never store full number)
  panNumber?: string; // Masked format: ABXXXX1234 (first 2 + last 4 visible)
  addressDetails?: string; // Manual address entry (full address text)
  // ✅ Exact details (unmasked) - entered by onboarder/admin during verification
  // These are used during account creation to store in verification service
  exactAadhaarNumber?: string; // Full 12-digit Aadhaar: 1234 5678 9012 (stored securely)
  exactPANNumber?: string; // Full PAN: ABCDE1234F (stored securely)
  exactAddressDetails?: string; // Full address details (unmasked, stored securely)
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
  address?: string; // Local Area
  pincode?: string;

  // Gated community
  isGatedCommunity?: boolean;
  gatedCommunityName?: string;
  
  // Lead source & tracking
  source?: LeadSource;
  sourceDetails?: string;
  agentCampaignId?: string; // Agent / Campaign ID
  
  // Additional lead information
  secondarySkill?: string;
  experienceLevel?: 'beginner' | 'intermediate' | 'experienced';
  workingDays?: string; // e.g., "Mon-Fri" or "Monday, Tuesday, Wednesday"
  preferredTimeSlot?: string; // e.g., "Morning", "Afternoon", "Evening" or specific times
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
  
  // Status pipeline
  status: LeadStatus;  // ✅ Lead status only (ends at approved)
  accountStatus: AccountStatus;  // ✅ NEW: Separate account status (starts after approval)
  statusHistory: IStatusHistory[];
  
  // Skills & services
  primarySkill?: string;  // Legacy field (for backward compatibility)
  primaryCategory?: string;  // New field name (preferred)
  secondaryCategory?: string;  // New field name (preferred)
  skills: ILeadSkill[];
  
  // Documents
  documents: ILeadDocument[];
  
  // Verification status
  verificationStatus: IVerificationStatus;
  
  // Communication
  lastContactedAt?: Date;
  lastContactedBy?: string;
  nextCallbackAt?: Date;
  expectedOnboardingAt?: Date;
  statusReasonCode?: string;
  statusReasonText?: string;
  // Tracks who most recently moved lead into each contact bucket.
  lastInterestedBy?: string;
  lastNotInterestedBy?: string;
  lastNotLiftedBy?: string;
  /** Tracks who last edited lead fields (name, phone, city, etc.) */
  lastUpdatedBy?: string;
  lastUpdatedByName?: string;
  /** When lead profile fields were last edited (excludes status-only updates) */
  lastFieldEditedAt?: Date;
  communicationLog: ICommunicationLog[];
  
  // Internal notes
  internalNotes: IInternalNote[];
  
  // Duplicate check
  duplicateOf?: string;
  isDuplicate: boolean;
  blacklisted: boolean;
  
  // Activation
  activationData?: IActivationData;

  // Conversion (lead registered on main website and verification status)
  conversionData?: {
    platformUid?: string;
    isAadhaarVerified?: boolean;
    lastCheckedAt?: Date;
  };
  
  // Creation method tracking
  creationMethod?: CreationMethod;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>({
  leadId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: false,
    trim: true,
    index: true,
    sparse: true
  },
  landline: {
    type: String,
    required: false,
    trim: true,
    index: true,
    sparse: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  city: {
    type: String,
    trim: true,
    index: true
  },
  state: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  pincode: {
    type: String,
    trim: true
  },
  isGatedCommunity: {
    type: Boolean,
    default: false,
    index: true
  },
  gatedCommunityName: {
    type: String,
    trim: true,
    index: true,
    sparse: true
  },
  source: {
    type: String,
    enum: ['referral', 'campaign', 'walk-in', 'agent', 'other'],
    index: true
  },
  sourceDetails: {
    type: String,
    trim: true
  },
  agentCampaignId: {
    type: String,
    trim: true
  },
  secondarySkill: {
    type: String,
    trim: true
  },
  experienceLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'experienced']
  },
  workingDays: {
    type: String,
    trim: true
  },
  preferredTimeSlot: {
    type: String,
    trim: true
  },
  addedBy: {
    type: String,
    required: true,
    index: true
  },
  addedByName: {
    type: String,
    trim: true
  },
  pickedBy: {
    type: String,
    index: true
  },
  pickedByName: {
    type: String,
    trim: true
  },
  pickedAt: {
    type: Date
  },
  lastTransferredBy: {
    type: String,
    index: true
  },
  lastTransferredByName: {
    type: String,
    trim: true
  },
  lastTransferredAt: {
    type: Date
  },
  lastTransferDecision: {
    type: String,
    enum: ['accepted', 'rejected'],
    default: undefined
  },
  lastTransferDecisionBy: {
    type: String,
    default: undefined
  },
  lastTransferDecisionByName: {
    type: String,
    default: undefined
  },
  lastTransferDecisionAt: {
    type: Date,
    default: undefined
  },
  transferPendingTo: {
    type: String,
    index: true
  },
  transferPendingToName: {
    type: String,
    trim: true
  },
  transferPendingAt: {
    type: Date
  },
  status: {
    type: String,
    enum: [
      'lead_added',
      'contacted_not_lifted',
      'contacted_not_interested',
      'contacted_interested',
      'documents_submitted',
      'under_verification',
      'approved',
      'rejected',
      'inactive'
      // ❌ REMOVED: 'account_created', 'activated' - these are account statuses, not lead statuses
    ],
    default: 'lead_added',
    required: true,
    index: true
  },
  // ✅ NEW: Account status field (separate from lead status)
  accountStatus: {
    type: String,
    enum: ['not_created', 'invited', 'activated', 'suspended'],
    default: 'not_created',
    required: true,
    index: true
  },
  statusHistory: [{
    status: {
      type: String,
      enum: [
        'lead_added',
        'contacted_not_lifted',
        'contacted_not_interested',
        'contacted_interested',
        'documents_submitted',
        'under_verification',
        'approved',
        'inactive'
        // ❌ REMOVED: 'rejected' - use inactive instead
      ]
    },
    changedBy: String,
    changedByName: String,
    changedAt: { type: Date, default: Date.now },
    notes: String,
    statusReasonCode: String,
    statusReasonText: String,
    callbackAt: Date,
    expectedOnboardingAt: Date
  }],
  primarySkill: {
    type: String,
    trim: true,
    index: true
  },
  primaryCategory: {
    type: String,
    trim: true,
    index: true
  },
  secondaryCategory: {
    type: String,
    trim: true
  },
  skills: [{
    name: { type: String, required: true },
    category: String,
    level: {
      type: String,
      enum: ['beginner','intermediate', 'experienced']
    },
    toolsAvailable: Boolean,
    assignedBy: String,
    assignedAt: Date
  }],
  documents: [{
    type: {
      type: String,
      enum: ['aadhaar', 'pan', 'address_proof', 'skill_certificate', 'photo', 'other']
    },
    url: String,
    uploadedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    rejectionReason: String,
    verifiedBy: String,
    verifiedAt: Date,
    // Manual entry fields (masked for compliance)
    aadhaarNumber: String, // Masked: XXXX XXXX 1234
    panNumber: String, // Masked: ABXXXX1234
    addressDetails: String, // Manual address entry
    // ✅ Exact details (unmasked) - entered by onboarder/admin during verification
    // These are used during account creation to store in verification service
    exactAadhaarNumber: String, // Full 12-digit Aadhaar: 1234 5678 9012 (stored securely)
    exactPANNumber: String, // Full PAN: ABCDE1234F (stored securely)
    exactAddressDetails: String // Full address details (unmasked, stored securely)
  }],
  verificationStatus: {
    aadhaar: {
      status: {
        type: String,
        enum: ['pending', 'verified', 'failed']
      },
      verifiedAt: Date,
      refId: String
    },
    pan: {
      status: {
        type: String,
        enum: ['pending', 'verified', 'failed']
      },
      verifiedAt: Date
    },
    bank: {
      status: {
        type: String,
        enum: ['pending', 'verified', 'failed']
      },
      verifiedAt: Date
    }
  },
  lastContactedAt: Date,
  lastContactedBy: String,
  nextCallbackAt: Date,
  expectedOnboardingAt: Date,
  statusReasonCode: String,
  statusReasonText: String,
  lastInterestedBy: {
    type: String,
    index: true
  },
  lastNotInterestedBy: {
    type: String,
    index: true
  },
  lastNotLiftedBy: {
    type: String,
    index: true
  },
  lastUpdatedBy: {
    type: String,
    index: true
  },
  lastUpdatedByName: {
    type: String,
    trim: true
  },
  lastFieldEditedAt: {
    type: Date,
    index: true
  },
  communicationLog: [{
    type: {
      type: String,
      enum: ['call', 'sms', 'whatsapp', 'email', 'note']
    },
    by: String,
    byName: String,
    at: { type: Date, default: Date.now },
    notes: String
  }],
  internalNotes: [{
    note: { type: String, required: true },
    addedBy: { type: String, required: true },
    addedByName: String,
    addedAt: { type: Date, default: Date.now },
    isPrivate: { type: Boolean, default: false }
  }],
  duplicateOf: String,
  isDuplicate: {
    type: Boolean,
    default: false,
    index: true
  },
  blacklisted: {
    type: Boolean,
    default: false,
    index: true
  },
  activationData: {
    activatedAt: Date,
    firebaseUid: { type: String, index: true, sparse: true },
    profileCreated: { type: Boolean, default: false }
  },
  conversionData: {
    platformUid: String,
    isAadhaarVerified: { type: Boolean, default: false },
    lastCheckedAt: Date
  },
  creationMethod: {
    type: String,
    enum: ['manual_onboarding', 'bulk_upload', 'direct_activation'],
    index: true
  }
}, {
  timestamps: true
});

// Legacy status values that were renamed; map to current enum so validation passes
const LEGACY_STATUS_MAP: Record<string, string> = {
  contacted: 'contacted_not_interested',
  interested: 'contacted_interested',
};

// Pre-save hook: normalize legacy status values in status and statusHistory (so saves don't fail validation)
LeadSchema.pre('save', function(next) {
  if (this.status && LEGACY_STATUS_MAP[this.status]) {
    this.status = LEGACY_STATUS_MAP[this.status] as LeadStatus;
  }
  if (this.statusHistory?.length) {
    this.statusHistory.forEach((entry) => {
      if (entry.status && LEGACY_STATUS_MAP[entry.status]) {
        entry.status = LEGACY_STATUS_MAP[entry.status] as LeadStatus;
      }
    });
  }
  next();
});

// Pre-save hook to ensure at least one contact number (phone or landline) exists
LeadSchema.pre('save', function(next) {
  if (!this.phone && !this.landline) {
    return next(new Error('At least one contact number (phone or landline) is required'));
  }
  next();
});

// Compound indexes for common queries
LeadSchema.index({ status: 1, createdAt: -1 });
LeadSchema.index({ addedBy: 1, status: 1 });
LeadSchema.index({ pickedBy: 1, status: 1 });
LeadSchema.index({ transferPendingTo: 1 });
LeadSchema.index({ city: 1, status: 1 });
LeadSchema.index({ source: 1, createdAt: -1 });
LeadSchema.index({ primarySkill: 1, status: 1 });
LeadSchema.index({ creationMethod: 1, status: 1 });
LeadSchema.index({ nextCallbackAt: 1, addedBy: 1, status: 1 });
LeadSchema.index({ status: 1, nextCallbackAt: 1 });

export default mongoose.model<ILead>('Lead', LeadSchema);

