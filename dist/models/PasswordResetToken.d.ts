import mongoose, { Document } from 'mongoose';
export interface IPasswordResetToken extends Document {
    token: string;
    userId: string;
    email: string;
    expiresAt: Date;
    used: boolean;
    usedAt?: Date;
    createdBy?: string;
    createdAt: Date;
}
declare const _default: mongoose.Model<IPasswordResetToken, {}, {}, {}, mongoose.Document<unknown, {}, IPasswordResetToken, {}, {}> & IPasswordResetToken & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=PasswordResetToken.d.ts.map