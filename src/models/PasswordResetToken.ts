import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

export interface IPasswordResetToken extends Document {
  token: string;
  userId: string;
  email: string;
  expiresAt: Date;
  used: boolean;
  usedAt?: Date;
  createdBy?: string; // Admin who initiated the reset
  createdAt: Date;
}

const PasswordResetTokenSchema = new Schema<IPasswordResetToken>({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => crypto.randomBytes(32).toString('hex'),
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    index: { expireAfterSeconds: 0 },
  },
  used: {
    type: Boolean,
    default: false,
    index: true,
  },
  usedAt: Date,
  createdBy: String,
}, { timestamps: true });

PasswordResetTokenSchema.index({ userId: 1, used: 1 });
PasswordResetTokenSchema.index({ token: 1, used: 1 });

export default mongoose.model<IPasswordResetToken>('PasswordResetToken', PasswordResetTokenSchema);
