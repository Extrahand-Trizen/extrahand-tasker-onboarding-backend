import mongoose, { Document } from 'mongoose';
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
declare const _default: mongoose.Model<IBulkImport, {}, {}, {}, mongoose.Document<unknown, {}, IBulkImport, {}, {}> & IBulkImport & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=BulkImport.d.ts.map