import { AdminRequest } from '../middleware/adminAuth';

export function getAdminIdentityIds(req: AdminRequest): string[] {
  return Array.from(
    new Set(
      [req.admin?.userId, req.admin?.uid].filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0
      )
    )
  );
}

export function isLeadCreator(req: AdminRequest, leadAddedBy: string): boolean {
  const identityIds = getAdminIdentityIds(req);
  if (!identityIds.length) return false;
  return identityIds.includes(leadAddedBy);
}

/**
 * Any qualifier can edit any lead — regardless of who created or claimed it.
 * The only requirement is that the caller is a valid authenticated qualifier
 * (identityIds must be non-empty).
 */
export function canQualifierEditLead(
  lead: { addedBy: string; pickedBy?: string | null },
  identityIds: string[]
): boolean {
  return identityIds.length > 0;
}

const SKILL_UPDATE_KEYS = [
  'primaryCategory',
  'primarySkill',
  'secondaryCategory',
  'secondarySkill',
  'skills',
] as const;

export function updateTouchesSkills(data: Record<string, unknown>): boolean {
  return SKILL_UPDATE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(data, key));
}
