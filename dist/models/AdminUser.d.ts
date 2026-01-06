import mongoose, { Document } from 'mongoose';
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
declare const _default: mongoose.Model<IAdminUser, {}, {}, {}, mongoose.Document<unknown, {}, IAdminUser, {}, {}> & IAdminUser & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=AdminUser.d.ts.map