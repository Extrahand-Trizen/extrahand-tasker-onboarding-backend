import mongoose, { Document } from 'mongoose';
export type ActivityType = 'status_change' | 'document_upload' | 'document_verification' | 'verification' | 'note' | 'communication' | 'skill_assigned' | 'approval' | 'activation';
export interface ILeadActivity extends Document {
    activityId: string;
    leadId: string;
    type: ActivityType;
    action: string;
    performedBy: string;
    performedByName?: string;
    metadata?: Record<string, any>;
    createdAt: Date;
}
declare const _default: mongoose.Model<ILeadActivity, {}, {}, {}, mongoose.Document<unknown, {}, ILeadActivity, {}, {}> & ILeadActivity & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=LeadActivity.d.ts.map