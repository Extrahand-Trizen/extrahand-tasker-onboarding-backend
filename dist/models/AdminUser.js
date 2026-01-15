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
const RefreshTokenSchema = new mongoose_1.Schema({
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date },
    deviceInfo: { type: String },
    ipAddress: { type: String },
}, { _id: false });
const AdminUserSchema = new mongoose_1.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        default: () => `ADM-${Date.now()}-${crypto_1.default.randomBytes(4).toString('hex').toUpperCase()}`,
    },
    microsoftId: { type: String, unique: true, sparse: true, index: true },
    email: { type: String, required: true, lowercase: true, unique: true, index: true },
    inviteEmail: { type: String, lowercase: true }, // Email where invite was sent
    // Profile
    name: { type: String, trim: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    profilePhoto: { type: String },
    // Organization
    role: {
        type: String,
        enum: ['lead_access_manager', 'onboarder', 'qualifier', 'support', 'trust'],
        required: true,
        default: 'qualifier',
    },
    team: { type: String, trim: true },
    department: { type: String, trim: true },
    // Security
    status: {
        type: String,
        enum: ['active', 'suspended', 'inactive'],
        default: 'active',
        index: true,
    },
    passwordHash: { type: String }, // Optional backup login
    mfaEnabled: { type: Boolean, default: false },
    // Tracking
    inviteId: { type: String },
    joinedVia: {
        type: String,
        enum: ['invite', 'manual', 'legacy'],
        default: 'manual',
    },
    lastLoginAt: { type: Date },
    loginCount: { type: Number, default: 0 },
    // Audit
    createdBy: { type: String },
    lastRoleChangeBy: { type: String },
    lastRoleChangeAt: { type: Date },
    // Session management
    refreshTokens: [RefreshTokenSchema],
    // Legacy compatibility
    uid: { type: String, unique: true, sparse: true, index: true },
}, { timestamps: true });
// Compound indexes
AdminUserSchema.index({ status: 1, role: 1 });
AdminUserSchema.index({ team: 1, department: 1 });
// Virtual for full name
AdminUserSchema.virtual('fullName').get(function () {
    if (this.firstName && this.lastName) {
        return `${this.firstName} ${this.lastName}`;
    }
    return this.name || this.email;
});
// Method to add refresh token
AdminUserSchema.methods.addRefreshToken = function (token, expiresAt, deviceInfo, ipAddress) {
    this.refreshTokens.push({
        token,
        expiresAt,
        createdAt: new Date(),
        deviceInfo,
        ipAddress,
    });
    // Keep only last 5 tokens per user
    if (this.refreshTokens.length > 5) {
        this.refreshTokens = this.refreshTokens.slice(-5);
    }
};
// Method to remove expired tokens
AdminUserSchema.methods.cleanupExpiredTokens = function () {
    const now = new Date();
    this.refreshTokens = this.refreshTokens.filter((rt) => rt.expiresAt > now);
};
exports.default = mongoose_1.default.model('AdminUser', AdminUserSchema);
//# sourceMappingURL=AdminUser.js.map