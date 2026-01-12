import mongoose, { Document } from 'mongoose';
export interface IRefreshToken {
    token: string;
    expiresAt: Date;
    createdAt: Date;
    lastUsedAt?: Date;
    deviceInfo?: string;
    ipAddress?: string;
}
export interface IAdminUser extends Document {
    userId: string;
    microsoftId?: string;
    email: string;
    inviteEmail?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    profilePhoto?: string;
    role: 'admin' | 'operations' | 'marketing' | 'support' | 'trust';
    team?: string;
    department?: string;
    status: 'active' | 'suspended' | 'inactive';
    passwordHash?: string;
    mfaEnabled: boolean;
    inviteId?: string;
    joinedVia: 'invite' | 'manual' | 'legacy';
    createdAt: Date;
    updatedAt: Date;
    lastLoginAt?: Date;
    loginCount: number;
    createdBy?: string;
    lastRoleChangeBy?: string;
    lastRoleChangeAt?: Date;
    refreshTokens: IRefreshToken[];
    uid?: string;
    addRefreshToken(token: string, expiresAt: Date, deviceInfo?: string, ipAddress?: string): void;
    cleanupExpiredTokens(): void;
}
declare const _default: mongoose.Model<IAdminUser, {}, {}, {}, mongoose.Document<unknown, {}, IAdminUser, {}, {}> & IAdminUser & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=AdminUser.d.ts.map