import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

export interface IRefreshToken {
  token: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt?: Date;
  deviceInfo?: string;
  ipAddress?: string;
}

export interface IAdminUser extends Document {
  // Identity (No Firebase!)
  userId: string; // "ADM-1705678901-ABC"
  microsoftId?: string; // Microsoft account ID (sub from OAuth)
  email: string; // Actual email they logged in with
  inviteEmail?: string; // Email where invite was sent (for tracking)

  // Profile
  name?: string;
  firstName?: string;
  lastName?: string;
  profilePhoto?: string;

  // Organization
  role: 'admin' | 'onboarder' | 'qualifier' | 'support' | 'trust' | 'lead_access_manager';
  team?: string;
  department?: string;

  // Security
  status: 'active' | 'suspended' | 'inactive';
  passwordHash?: string; // Optional: for backup login
  mfaEnabled: boolean;

  // Tracking
  inviteId?: string;
  joinedVia: 'invite' | 'manual' | 'legacy';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  loginCount: number;

  // Audit
  createdBy?: string;
  lastRoleChangeBy?: string;
  lastRoleChangeAt?: Date;

  // Session management
  refreshTokens: IRefreshToken[];

  // Legacy compatibility (for existing Firebase users)
  uid?: string; // Will be deprecated

  // Methods
  addRefreshToken(token: string, expiresAt: Date, deviceInfo?: string, ipAddress?: string): void;
  cleanupExpiredTokens(): void;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date },
    deviceInfo: { type: String },
    ipAddress: { type: String },
  },
  { _id: false }
);

const AdminUserSchema = new Schema<IAdminUser>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `ADM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
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
      enum: ['admin', 'onboarder', 'qualifier', 'support', 'trust', 'lead_access_manager'],
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
  },
  { timestamps: true }
);

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
AdminUserSchema.methods.addRefreshToken = function (
  token: string,
  expiresAt: Date,
  deviceInfo?: string,
  ipAddress?: string
): void {
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
AdminUserSchema.methods.cleanupExpiredTokens = function (): void {
  const now = new Date();
  this.refreshTokens = this.refreshTokens.filter((rt: IRefreshToken) => rt.expiresAt > now);
};

export default mongoose.model<IAdminUser>('AdminUser', AdminUserSchema);







