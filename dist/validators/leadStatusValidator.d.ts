import { LeadStatusReasonCode } from '../constants/leadContactTracking';
export interface RawLeadStatusUpdateInput {
    notes?: string;
    statusReasonCode?: string;
    statusReasonText?: string;
    callbackAt?: string | Date;
    expectedOnboardingAt?: string | Date;
}
export interface ValidatedLeadStatusUpdate {
    notes?: string;
    statusReasonCode?: LeadStatusReasonCode;
    statusReasonText?: string;
    callbackAt?: Date;
    expectedOnboardingAt?: Date;
}
export declare function validateAndNormalizeLeadStatusUpdate(raw: RawLeadStatusUpdateInput): ValidatedLeadStatusUpdate;
//# sourceMappingURL=leadStatusValidator.d.ts.map