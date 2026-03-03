import mongoose, { Schema, Document } from 'mongoose';

// ✅ LEAD STATUS - CRM/Onboarding concern (ends at approved)
export type LeadStatus = 
  | 'lead_added'
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
  phone?: string;
  landline?: string;
  email?: string;
  city: string;
  state?: string;
  address?: string; // Local Area
  pincode?: string;
  
  // Lead source & tracking
  source: LeadSource;
  sourceDetails?: string;
  agentCampaignId?: string; // Agent / Campaign ID
  
  // Additional lead information
  secondarySkill?: string;
  experienceLevel?: 'beginner' | 'intermediate' | 'experienced';
  workingDays?: string; // e.g., "Mon-Fri" or "Monday, Tuesday, Wednesday"
  preferredTimeSlot?: string; // e.g., "Morning", "Afternoon", "Evening" or specific times
  addedBy: string;
  addedByName?: string;
  
  // Status pipeline
  status: LeadStatus;  // ✅ Lead status only (ends at approved)
  accountStatus: AccountStatus;  // ✅ NEW: Separate account status (starts after approval)
  statusHistory: IStatusHistory[];
  
  // Skills & services
  primarySkill: string;  // Legacy field (for backward compatibility)
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
    required: true,
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
  source: {
    type: String,
    enum: ['referral', 'campaign', 'walk-in', 'agent', 'other'],
    required: true,
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
  status: {
    type: String,
    enum: [
      'lead_added',
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
    notes: String
  }],
  primarySkill: {
    type: String,
    required: true,
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
LeadSchema.index({ city: 1, status: 1 });
LeadSchema.index({ source: 1, createdAt: -1 });
LeadSchema.index({ primarySkill: 1, status: 1 });
LeadSchema.index({ creationMethod: 1, status: 1 });

export default mongoose.model<ILead>('Lead', LeadSchema);

