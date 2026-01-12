import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

export interface IAdminInvite extends Document {
  inviteId: string;
  token: string;
  email: string;
  role: 'admin' | 'operations' | 'marketing' | 'support' | 'trust';
  team?: string;
  department?: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  usedBy?: string;
  usedByEmail?: string; // Actual email they used to login
  usedByName?: string; // Name from Microsoft account
  usedAt?: Date;
  lastLoginAt?: Date;
  loginCount: number;
  emailSent: boolean;
  emailSentAt?: Date;
  emailError?: string;
  metadata?: any;
}

const AdminInviteSchema = new Schema<IAdminInvite>(
  {
    inviteId: {
      type: String,
      required: true,
      unique: true,
      default: () => `INV-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(32).toString('hex'),
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v: string) => {
          return (
            v.endsWith('@trizenventures.com') ||
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
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Indexes for efficient queries
AdminInviteSchema.index({ email: 1, status: 1 });
AdminInviteSchema.index({ status: 1, expiresAt: 1 });

// Method to check if invite is valid
AdminInviteSchema.methods.isValid = function (): boolean {
  return this.status === 'pending' && this.expiresAt > new Date();
};

export default mongoose.model<IAdminInvite>('AdminInvite', AdminInviteSchema);
