"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const LeadSchema = new mongoose_1.Schema({
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
        required: true,
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
            'contacted',
            'interested',
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
                    'contacted',
                    'interested',
                    'documents_submitted',
                    'under_verification',
                    'approved',
                    'rejected',
                    'inactive'
                    // ❌ REMOVED: 'account_created', 'activated' - these are account statuses, not lead statuses
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
    skills: [{
            name: { type: String, required: true },
            category: String,
            level: {
                type: String,
                enum: ['beginner', 'experienced']
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
    creationMethod: {
        type: String,
        enum: ['manual_onboarding', 'bulk_upload', 'direct_activation'],
        index: true
    }
}, {
    timestamps: true
});
// Compound indexes for common queries
LeadSchema.index({ status: 1, createdAt: -1 });
LeadSchema.index({ addedBy: 1, status: 1 });
LeadSchema.index({ city: 1, status: 1 });
LeadSchema.index({ source: 1, createdAt: -1 });
LeadSchema.index({ primarySkill: 1, status: 1 });
LeadSchema.index({ creationMethod: 1, status: 1 });
exports.default = mongoose_1.default.model('Lead', LeadSchema);
//# sourceMappingURL=Lead.js.map