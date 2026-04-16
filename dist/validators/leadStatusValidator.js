"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAndNormalizeLeadStatusUpdate = validateAndNormalizeLeadStatusUpdate;
const leadContactTracking_1 = require("../constants/leadContactTracking");
function normalizeDate(value) {
    if (!value)
        return undefined;
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? undefined : value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
function validateAndNormalizeLeadStatusUpdate(raw) {
    const notes = typeof raw.notes === 'string' ? raw.notes.trim() || undefined : undefined;
    const statusReasonText = typeof raw.statusReasonText === 'string' ? raw.statusReasonText.trim() || undefined : undefined;
    const callbackAt = normalizeDate(raw.callbackAt);
    const expectedOnboardingAt = normalizeDate(raw.expectedOnboardingAt);
    let statusReasonCode;
    if (typeof raw.statusReasonCode === 'string' && raw.statusReasonCode.trim()) {
        const candidate = raw.statusReasonCode.trim();
        if (!leadContactTracking_1.LEAD_STATUS_REASON_CODES.includes(candidate)) {
            throw new Error(`Invalid statusReasonCode '${candidate}'`);
        }
        statusReasonCode = candidate;
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
//# sourceMappingURL=leadStatusValidator.js.map