import mongoose, { Document } from 'mongoose';
export interface IAdminInvite extends Document {
    inviteId: string;
    token: string;
    email: string;
    role: 'lead_access_manager' | 'onboarder' | 'qualifier' | 'support' | 'trust';
    team?: string;
    department?: string;
    status: 'pending' | 'accepted' | 'expired' | 'revoked';
    createdBy: string;
    createdAt: Date;
    expiresAt: Date;
    usedBy?: string;
    usedByEmail?: string;
    usedByName?: string;
    usedAt?: Date;
    lastLoginAt?: Date;
    loginCount: number;
    emailSent: boolean;
    emailSentAt?: Date;
    emailError?: string;
    metadata?: any;
}
declare const _default: mongoose.Model<IAdminInvite, {}, {}, {}, mongoose.Document<unknown, {}, IAdminInvite, {}, {}> & IAdminInvite & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=AdminInvite.d.ts.map