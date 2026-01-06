import mongoose, { Schema, Document } from 'mongoose';

export type ActivityType = 
  | 'status_change'
  | 'document_upload'
  | 'document_verification'
  | 'verification'
  | 'note'
  | 'communication'
  | 'skill_assigned'
  | 'approval'
  | 'activation';

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

const LeadActivitySchema = new Schema<ILeadActivity>({
  activityId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  leadId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'status_change',
      'document_upload',
      'document_verification',
      'verification',
      'note',
      'communication',
      'skill_assigned',
      'approval',
      'activation'
    ],
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true
  },
  performedBy: {
    type: String,
    required: true,
    index: true
  },
  performedByName: {
    type: String,
    trim: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for common queries
LeadActivitySchema.index({ leadId: 1, createdAt: -1 });
LeadActivitySchema.index({ performedBy: 1, createdAt: -1 });
LeadActivitySchema.index({ type: 1, createdAt: -1 });

export default mongoose.model<ILeadActivity>('LeadActivity', LeadActivitySchema);

