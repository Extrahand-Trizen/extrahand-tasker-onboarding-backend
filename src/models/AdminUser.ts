import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminUser extends Document {
  uid: string;
  email: string;
  role: 'admin' | 'operations' | 'marketing' | 'support' | 'trust';
  status: 'active' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  lastRoleChangeBy?: string;
  lastRoleChangeAt?: Date;
}

const AdminUserSchema = new Schema<IAdminUser>(
  {
    uid: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, index: true },
    role: {
      type: String,
      enum: ['admin', 'operations', 'marketing', 'support', 'trust'],
      required: true,
      default: 'marketing',
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      index: true,
    },
    createdBy: { type: String },
    lastRoleChangeBy: { type: String },
    lastRoleChangeAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IAdminUser>('AdminUser', AdminUserSchema);







