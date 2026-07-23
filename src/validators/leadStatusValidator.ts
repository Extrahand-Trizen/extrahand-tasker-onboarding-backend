import { LEAD_STATUS_REASON_CODES, LeadStatusReasonCode } from '../constants/leadContactTracking';

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

function normalizeDate(value?: string | Date): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function validateAndNormalizeLeadStatusUpdate(
  raw: RawLeadStatusUpdateInput
): ValidatedLeadStatusUpdate {
  const notes = typeof raw.notes === 'string' ? raw.notes.trim() || undefined : undefined;
  const statusReasonText =
    typeof raw.statusReasonText === 'string' ? raw.statusReasonText.trim() || undefined : undefined;
  const callbackAt = normalizeDate(raw.callbackAt);
  const expectedOnboardingAt = normalizeDate(raw.expectedOnboardingAt);

  let statusReasonCode: LeadStatusReasonCode | undefined;
  if (typeof raw.statusReasonCode === 'string' && raw.statusReasonCode.trim()) {
    const candidate = raw.statusReasonCode.trim();
    if (!LEAD_STATUS_REASON_CODES.includes(candidate as LeadStatusReasonCode)) {
      throw new Error(`Invalid statusReasonCode '${candidate}'`);
    }
    statusReasonCode = candidate as LeadStatusReasonCode;
  }

  if (raw.callbackAt && !callbackAt) {
    throw new Error('Invalid callbackAt date');
  }
  if (raw.expectedOnboardingAt && !expectedOnboardingAt) {
    throw new Error('Invalid expectedOnboardingAt date');
  }

  if (statusReasonCode === 'callback_requested' && !callbackAt) {
    throw new Error('callbackAt is required when statusReasonCode is callback_requested');
  }

  return {
    notes,
    statusReasonCode,
    statusReasonText,
    callbackAt,
    expectedOnboardingAt,
  };
}

