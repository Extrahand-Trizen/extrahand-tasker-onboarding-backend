import mongoose, { Schema, Document } from 'mongoose';

export interface IBulkImport extends Omit<Document, 'errors'> {
  importId: string;
  // Legacy field (kept for backward compatibility)
  adminUid?: string;
  // New creator tracking fields
  createdBy: string;        // userId (works for any role)
  createdByName?: string;   // Name of uploader
  createdByEmail?: string;  // Email of uploader
  createdByRole?: 'qualifier' | 'onboarder' | 'lead_access_manager'; // Role of uploader
  // Idempotency
  fileHash?: string;        // SHA-256 hash of file content for idempotency
  fileName: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  operationType?: 'create' | 'update' | 'delete' | 'mixed';
  errors: Array<{
    row: number;
    uid?: string;
    phone?: string;
    error: string;
  }>;
  importedUserIds: string[];
  updatedUserIds?: string[];
  deletedUserIds?: string[];
  createdAt: Date;
  completedAt?: Date;
}

const BulkImportSchema = new Schema<IBulkImport>({
  importId: { type: String, required: true, unique: true, index: true },
  // Legacy field (kept for backward compatibility)
  adminUid: { type: String, index: true },
  // New creator tracking fields
  createdBy: { type: String, required: true, index: true }, // userId
  createdByName: { type: String, index: true },
  createdByEmail: { type: String, index: true },
  createdByRole: {
    type: String,
    enum: ['qualifier', 'onboarder', 'lead_access_manager'],
    index: true
  },
  // Idempotency - file hash to prevent duplicate uploads
  // ✅ Changed from unique to allow re-uploads (compound unique index with createdBy instead)
  fileHash: { type: String, index: true },
  fileName: { type: String, required: true },
  totalRows: { type: Number, required: true },
  successCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  operationType: {
    type: String,
    enum: ['create', 'update', 'delete', 'mixed'],
    index: true
  },
  errors: [{
    row: Number,
    uid: String,
    phone: String,
    error: String
  }],
  importedUserIds: [String],
  updatedUserIds: [String],
  deletedUserIds: [String],
  completedAt: Date
}, { timestamps: true });

// Compound indexes for efficient queries
// ✅ Compound unique index: same file can be uploaded by different users, but not twice by same user (unless leads are deleted)
BulkImportSchema.index({ fileHash: 1, createdBy: 1 }, { unique: true, sparse: true }); // Idempotency check per user
BulkImportSchema.index({ createdBy: 1, createdAt: -1 }); // User's imports
BulkImportSchema.index({ createdByRole: 1, createdAt: -1 }); // Role filter
BulkImportSchema.index({ createdByEmail: 1, createdAt: -1 }); // Email filter
BulkImportSchema.index({ status: 1, createdAt: -1 }); // Status filter
BulkImportSchema.index({ createdByRole: 1, status: 1, createdAt: -1 }); // Combined filter

export default mongoose.model<IBulkImport>('BulkImport', BulkImportSchema);

