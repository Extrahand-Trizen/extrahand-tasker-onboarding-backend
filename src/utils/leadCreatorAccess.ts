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

export function canQualifierEditLead(
  lead: { addedBy: string; pickedBy?: string | null },
  identityIds: string[]
): boolean {
  if (!identityIds.length) return false;
  if (identityIds.includes(lead.addedBy)) return true;
  return !!lead.pickedBy && identityIds.includes(lead.pickedBy);
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
