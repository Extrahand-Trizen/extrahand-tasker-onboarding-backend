export type UserRole = 'marketing' | 'operations' | 'admin' | 'support';
export type LeadStatus = 'lead_added' | 'contacted' | 'interested' | 'documents_submitted' | 'under_verification' | 'approved' | 'rejected' | 'account_created' | 'activated' | 'inactive';
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
}
export declare const PERMISSIONS: Record<UserRole, Permissions>;
export declare function getPermissions(role: UserRole): Permissions;
export declare function hasPermission(role: UserRole, permission: keyof Permissions): boolean;
export declare function canUpdateStatus(role: UserRole, currentStatus: LeadStatus, newStatus: LeadStatus): boolean;
//# sourceMappingURL=permissions.d.ts.map