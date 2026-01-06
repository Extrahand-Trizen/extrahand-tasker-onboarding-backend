"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSIONS = void 0;
exports.getPermissions = getPermissions;
exports.hasPermission = hasPermission;
exports.canUpdateStatus = canUpdateStatus;
exports.PERMISSIONS = {
    marketing: {
        canViewLeads: true,
        canCreateLead: true,
        canUpdateLead: true,
        canDeleteLead: false,
        canUpdateStatus: ['lead_added', 'contacted', 'interested'],
        canViewDocuments: true,
        canUploadDocuments: false,
        canVerifyDocuments: false,
        canViewSkills: true,
        canAssignSkills: false,
        canApprove: false,
        canReject: false,
        canActivate: true, // Marketing team handles account creation
        canViewAnalytics: false,
        canViewSettings: false,
        canBulkImport: true,
        canBulkApprove: false,
        canBulkActivate: true, // Allow bulk activation for marketing
        canAddNotes: true,
        canViewAllNotes: true,
        canCommunicate: true
    },
    operations: {
        canViewLeads: true,
        canCreateLead: true,
        canUpdateLead: true,
        canDeleteLead: false,
        canUpdateStatus: 'all',
        canViewDocuments: true,
        canUploadDocuments: true,
        canVerifyDocuments: true,
        canViewSkills: true,
        canAssignSkills: true,
        canApprove: true,
        canReject: true,
        canActivate: true,
        canViewAnalytics: true,
        canViewSettings: false,
        canBulkImport: true,
        canBulkApprove: true,
        canBulkActivate: true,
        canAddNotes: true,
        canViewAllNotes: true,
        canCommunicate: true
    },
    admin: {
        canViewLeads: true,
        canCreateLead: true,
        canUpdateLead: true,
        canDeleteLead: true,
        canUpdateStatus: 'all',
        canViewDocuments: true,
        canUploadDocuments: true,
        canVerifyDocuments: true,
        canViewSkills: true,
        canAssignSkills: true,
        canApprove: true,
        canReject: true,
        canActivate: true,
        canViewAnalytics: true,
        canViewSettings: true,
        canBulkImport: true,
        canBulkApprove: true,
        canBulkActivate: true,
        canAddNotes: true,
        canViewAllNotes: true,
        canCommunicate: true
    },
    support: {
        canViewLeads: true,
        canCreateLead: false,
        canUpdateLead: false,
        canDeleteLead: false,
        canUpdateStatus: ['contacted', 'interested'], // Limited status updates
        canViewDocuments: true,
        canUploadDocuments: false,
        canVerifyDocuments: false,
        canViewSkills: true,
        canAssignSkills: false,
        canApprove: false,
        canReject: false,
        canActivate: false,
        canViewAnalytics: false,
        canViewSettings: false,
        canBulkImport: false,
        canBulkApprove: false,
        canBulkActivate: false,
        canAddNotes: true,
        canViewAllNotes: true,
        canCommunicate: true
    }
};
function getPermissions(role) {
    return exports.PERMISSIONS[role] || exports.PERMISSIONS.marketing;
}
function hasPermission(role, permission) {
    const permissions = getPermissions(role);
    return permissions[permission] === true;
}
function canUpdateStatus(role, currentStatus, newStatus) {
    const permissions = getPermissions(role);
    if (permissions.canUpdateStatus === 'all') {
        return true;
    }
    // Special case: Allow activation if user has canActivate permission
    if (newStatus === 'activated' && permissions.canActivate) {
        return currentStatus === 'approved'; // Can only activate from approved status
    }
    if (Array.isArray(permissions.canUpdateStatus)) {
        // Marketing can only move forward in pipeline
        if (role === 'marketing') {
            const statusOrder = ['lead_added', 'contacted', 'interested'];
            const currentIndex = statusOrder.indexOf(currentStatus);
            const newIndex = statusOrder.indexOf(newStatus);
            return currentIndex >= 0 && newIndex >= 0 && newIndex > currentIndex;
        }
        return permissions.canUpdateStatus.includes(newStatus);
    }
    return false;
}
//# sourceMappingURL=permissions.js.map