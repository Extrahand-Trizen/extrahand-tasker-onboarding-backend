export type UserRole = 'qualifier' | 'onboarder' | 'lead_access_manager' | 'support' | 'trust';
export type LeadStatus = 'lead_added' | 'contacted_not_lifted' | 'contacted_not_interested' | 'contacted_interested' | 'documents_submitted' | 'under_verification' | 'approved' | 'inactive';
export type AccountStatus = 'not_created' | 'invited' | 'activated' | 'suspended';
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
export declare const PERMISSIONS: Record<UserRole, Permissions>;
export declare function getPermissions(role: UserRole): Permissions;
export declare function hasPermission(role: UserRole, permission: keyof Permissions): boolean;
export declare function canUpdateStatus(role: UserRole, currentStatus: LeadStatus, newStatus: LeadStatus): boolean;
//# sourceMappingURL=permissions.d.ts.map