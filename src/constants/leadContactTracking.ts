export const LEAD_STATUS_REASON_CODES = [
  'callback_requested',
  'interested_onboarding_later',
  'not_interested',
  'wrong_number',
  'other',
] as const;

export type LeadStatusReasonCode = (typeof LEAD_STATUS_REASON_CODES)[number];

