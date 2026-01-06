import mongoose, { Schema, Document } from 'mongoose';

export interface IBulkImport extends Omit<Document, 'errors'> {
  importId: string;
  adminUid: string;
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
  adminUid: { type: String, required: true, index: true },
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

export default mongoose.model<IBulkImport>('BulkImport', BulkImportSchema);

