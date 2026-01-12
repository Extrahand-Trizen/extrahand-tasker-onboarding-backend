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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const AdminInviteSchema = new mongoose_1.Schema({
    inviteId: {
        type: String,
        required: true,
        unique: true,
        default: () => `INV-${Date.now()}-${crypto_1.default.randomBytes(4).toString('hex').toUpperCase()}`,
    },
    token: {
        type: String,
        required: true,
        unique: true,
        index: true,
        default: () => crypto_1.default.randomBytes(32).toString('hex'),
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        validate: {
            validator: (v) => {
                return (v.endsWith('@trizenventures.com') ||
                    v.endsWith('@extrahand.in') ||
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) // Basic email validation as fallback
                );
            },
            message: 'Email must be from @trizenventures.com or @extrahand.in',
        },
    },
    role: {
        type: String,
        enum: ['admin', 'operations', 'marketing', 'support', 'trust'],
        required: true,
    },
    team: { type: String, trim: true },
    department: { type: String, trim: true },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'expired', 'revoked'],
        default: 'pending',
        index: true,
    },
    createdBy: { type: String, required: true }, // userId (not Firebase UID)
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        index: true,
    },
    usedBy: { type: String }, // userId (not Firebase UID)
    usedByEmail: { type: String, lowercase: true }, // Actual email they used
    usedByName: { type: String }, // Name from Microsoft
    usedAt: { type: Date },
    lastLoginAt: { type: Date },
    loginCount: { type: Number, default: 0 },
    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date },
    emailError: { type: String },
    metadata: { type: mongoose_1.Schema.Types.Mixed },
}, { timestamps: true });
// Indexes for efficient queries
AdminInviteSchema.index({ email: 1, status: 1 });
AdminInviteSchema.index({ status: 1, expiresAt: 1 });
// Method to check if invite is valid
AdminInviteSchema.methods.isValid = function () {
    return this.status === 'pending' && this.expiresAt > new Date();
};
exports.default = mongoose_1.default.model('AdminInvite', AdminInviteSchema);
//# sourceMappingURL=AdminInvite.js.map