"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminIdentityIds = getAdminIdentityIds;
exports.isLeadCreator = isLeadCreator;
exports.canQualifierEditLead = canQualifierEditLead;
exports.updateTouchesSkills = updateTouchesSkills;
function getAdminIdentityIds(req) {
    return Array.from(new Set([req.admin?.userId, req.admin?.uid].filter((id) => typeof id === 'string' && id.trim().length > 0)));
}
function isLeadCreator(req, leadAddedBy) {
    const identityIds = getAdminIdentityIds(req);
    if (!identityIds.length)
        return false;
    return identityIds.includes(leadAddedBy);
}
/**
 * Any qualifier can edit any lead — regardless of who created or claimed it.
 * The only requirement is that the caller is a valid authenticated qualifier
 * (identityIds must be non-empty).
 */
function canQualifierEditLead(lead, identityIds) {
    return identityIds.length > 0;
}
const SKILL_UPDATE_KEYS = [
    'primaryCategory',
    'primarySkill',
    'secondaryCategory',
    'secondarySkill',
    'skills',
];
function updateTouchesSkills(data) {
    return SKILL_UPDATE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(data, key));
}
//# sourceMappingURL=leadCreatorAccess.js.map