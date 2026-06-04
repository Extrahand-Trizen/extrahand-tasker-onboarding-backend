import { AdminRequest } from '../middleware/adminAuth';
export declare function getAdminIdentityIds(req: AdminRequest): string[];
export declare function isLeadCreator(req: AdminRequest, leadAddedBy: string): boolean;
/**
 * Any qualifier can edit any lead — regardless of who created or claimed it.
 * The only requirement is that the caller is a valid authenticated qualifier
 * (identityIds must be non-empty).
 */
export declare function canQualifierEditLead(lead: {
    addedBy: string;
    pickedBy?: string | null;
}, identityIds: string[]): boolean;
export declare function updateTouchesSkills(data: Record<string, unknown>): boolean;
//# sourceMappingURL=leadCreatorAccess.d.ts.map