import mongoose, { Document, Schema } from 'mongoose';

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

const WebsiteLeadSchema = new Schema<IWebsiteLead>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 16,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    serviceCategory: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    serviceCategorySlug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    claimedBy: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    claimedByName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    claimedAt: {
      type: Date,
    },
  },
  { timestamps: true, collection: 'partnerleads' }
);

WebsiteLeadSchema.index({ createdAt: -1 });
WebsiteLeadSchema.index({ claimedAt: 1 });

export default mongoose.model<IWebsiteLead>('WebsiteLead', WebsiteLeadSchema);
