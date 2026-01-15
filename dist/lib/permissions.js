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
        canUpdateStatus: ['lead_added', 'contacted', 'interested'], // ✅ Qualifier can only move up to 'interested' - Onboarder handles documents
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
        canCommunicate: true
    },
    onboarder: {
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
        canCommunicate: false
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
        // Qualifier can only move forward in pipeline (up to 'interested')
        if (role === 'qualifier') {
            const statusOrder = ['lead_added', 'contacted', 'interested'];
            const currentIndex = statusOrder.indexOf(currentStatus);
            const newIndex = statusOrder.indexOf(newStatus);
            // ✅ Allow moving forward in pipeline, or staying at same status
            return currentIndex >= 0 && newIndex >= 0 && newIndex >= currentIndex && newIndex <= statusOrder.length - 1;
        }
        return permissions.canUpdateStatus.includes(newStatus);
    }
    return false;
}
//# sourceMappingURL=permissions.js.map