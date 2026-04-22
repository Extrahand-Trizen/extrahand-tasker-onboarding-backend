"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSIONS = void 0;
exports.getPermissions = getPermissions;
exports.hasPermission = hasPermission;
exports.canUpdateStatus = canUpdateStatus;
exports.PERMISSIONS = {
    qualifier: {
        canViewLeads: true,
        canCreateLead: true,
        canUpdateLead: true,
        canDeleteLead: false,
        canUpdateStatus: ['lead_added', 'contacted_not_lifted', 'contacted_not_interested', 'contacted_interested'], // ✅ Qualifier can only move up to 'contacted_interested'
        canViewDocuments: true,
        canUploadDocuments: false,
        canVerifyDocuments: false,
        canViewSkills: true,
        canAssignSkills: false,
        canApprove: false,
        canReject: false,
        canActivate: false, // ❌ REMOVED - Qualifier cannot activate accounts (login access)
        canViewAnalytics: false,
        canViewSettings: false,
        canBulkImport: true,
        canBulkApprove: false,
        canBulkActivate: false, // ❌ REMOVED - Qualifier cannot bulk activate
        canAddNotes: true,
        canViewAllNotes: true,
        canCommunicate: true,
        canVerifyUserCertificates: true,
    },
    onboarder: {
        canViewLeads: true,
        canCreateLead: false,
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
        canBulkImport: false,
        canBulkApprove: true,
        canBulkActivate: true,
        canAddNotes: true,
        canViewAllNotes: true,
        canCommunicate: true,
        canVerifyUserCertificates: true,
    },
    lead_access_manager: {
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
        canCommunicate: true,
        canVerifyUserCertificates: true,
    },
    support: {
        canViewLeads: true,
        canCreateLead: false,
        canUpdateLead: false,
        canDeleteLead: false,
        canUpdateStatus: ['contacted_not_lifted', 'contacted_not_interested', 'contacted_interested'], // Limited status updates
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
        canCommunicate: true,
        canVerifyUserCertificates: true,
    },
    trust: {
        canViewLeads: true,
        canCreateLead: false,
        canUpdateLead: false,
        canDeleteLead: false,
        canUpdateStatus: [],
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
        canAddNotes: false,
        canViewAllNotes: true,
        canCommunicate: false,
        canVerifyUserCertificates: false,
    }
};
function getPermissions(role) {
    return exports.PERMISSIONS[role] || exports.PERMISSIONS.qualifier;
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
    // ❌ REMOVED: Special case for activation - activation is now separate from lead status
    // Activation is handled via canActivate permission and accountStatus field, not via status update
    if (Array.isArray(permissions.canUpdateStatus)) {
        // Qualifier can move within qualifier-owned pipeline statuses
        // (lead_added, contacted_not_lifted, contacted_not_interested, contacted_interested), including backward transitions.
        if (role === 'qualifier') {
            const statusOrder = ['lead_added', 'contacted_not_lifted', 'contacted_not_interested', 'contacted_interested'];
            const currentIndex = statusOrder.indexOf(currentStatus);
            const newIndex = statusOrder.indexOf(newStatus);
            return currentIndex >= 0 && newIndex >= 0 && newIndex <= statusOrder.length - 1;
        }
        return permissions.canUpdateStatus.includes(newStatus);
    }
    return false;
}
//# sourceMappingURL=permissions.js.map