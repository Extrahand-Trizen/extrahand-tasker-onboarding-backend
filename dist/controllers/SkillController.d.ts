import { Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
export declare class SkillController {
    private static getUserId;
    private static canMutatePickedLead;
    /**
     * Add skill to a lead
     * POST /api/v1/admin/caos/leads/:leadId/skills
     */
    static addSkill(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Update a skill
     * PUT /api/v1/admin/caos/leads/:leadId/skills/:skillIndex
     */
    static updateSkill(req: AdminRequest, res: Response): Promise<void>;
    /**
     * Remove a skill
     * DELETE /api/v1/admin/caos/leads/:leadId/skills/:skillIndex
     */
    static removeSkill(req: AdminRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=SkillController.d.ts.map