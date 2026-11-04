import mongoose, { Document } from 'mongoose';
export interface IWebsiteLead extends Document {
    fullName: string;
    mobileNumber: string;
    city: string;
    serviceCategory: string;
    serviceCategorySlug: string;
    claimedBy?: string;
    claimedByName?: string;
    claimedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
declare const _default: mongoose.Model<IWebsiteLead, {}, {}, {}, mongoose.Document<unknown, {}, IWebsiteLead, {}, {}> & IWebsiteLead & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=WebsiteLead.d.ts.map