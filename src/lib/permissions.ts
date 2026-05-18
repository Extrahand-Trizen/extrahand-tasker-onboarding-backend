export type UserRole = 'qualifier' | 'onboarder' | 'lead_access_manager' | 'support' | 'trust';

// ✅ LEAD STATUS - CRM/Onboarding concern (ends at approved)
export type LeadStatus = 
  | 'lead_added'
  | 'contacted_not_lifted'
  | 'contacted_not_interested'
  | 'contacted_interested'
  | 'documents_submitted'
  | 'under_verification'
  | 'approved'
  | 'inactive';

// ✅ ACCOUNT STATUS - Auth/Platform concern (starts after lead approval)
export type AccountStatus = 
  | 'not_created'  // No login exists yet
  | 'invited'      // Invite sent, waiting for user
  | 'activated'    // User accepted invite + can log in
  | 'suspended';   // Access blocked

export interface Permissions {
  canViewLeads: boolean;
  canCreateLead: boolean;
  canUpdateLead: boolean;
  canDeleteLead: boolean;
  canUpdateStatus: LeadStatus[] | 'all';
  canViewDocuments: boolean;
  canUploadDocuments: boolean;
  canVerifyDocuments: boolean;
  canViewSkills: boolean;
  canAssignSkills: boolean;
  canApprove: boolean;
  canReject: boolean;
  canActivate: boolean;
  canViewAnalytics: boolean;
  canViewSettings: boolean;
  canBulkImport: boolean;
  canBulkApprove: boolean;
  canBulkActivate: boolean;
  canAddNotes: boolean;
  canViewAllNotes: boolean;
  canCommunicate: boolean;
  canVerifyUserCertificates: boolean;
}

export const PERMISSIONS: Record<UserRole, Permissions> = {
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

export function getPermissions(role: UserRole): Permissions {
  return PERMISSIONS[role] || PERMISSIONS.qualifier;
}

export function hasPermission(role: UserRole, permission: keyof Permissions): boolean {
  const permissions = getPermissions(role);
  return permissions[permission] === true;
}

export function canUpdateStatus(role: UserRole, currentStatus: LeadStatus, newStatus: LeadStatus): boolean {
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
      const statusOrder: LeadStatus[] = ['lead_added', 'contacted_not_lifted', 'contacted_not_interested', 'contacted_interested'];
      const currentIndex = statusOrder.indexOf(currentStatus);
      const newIndex = statusOrder.indexOf(newStatus);
      return currentIndex >= 0 && newIndex >= 0 && newIndex <= statusOrder.length - 1;
    }
    
    return permissions.canUpdateStatus.includes(newStatus);
  }
  
  return false;
}






