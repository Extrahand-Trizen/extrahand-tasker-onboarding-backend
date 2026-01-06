import { ILead, LeadStatus, LeadSource } from '../models/Lead';
import { UserRole } from '../lib/permissions';
export interface CreateLeadData {
    name: string;
    phone: string;
    email?: string;
    city: string;
    state?: string;
    address?: string;
    pincode?: string;
    primarySkill: string;
    source: LeadSource;
    sourceDetails?: string;
    addedBy: string;
    addedByName?: string;
    status?: LeadStatus;
}
export interface ILeadSkill {
    name: string;
    category?: string;
    level?: 'beginner' | 'experienced';
    toolsAvailable?: boolean;
    assignedBy?: string;
    assignedAt?: Date;
}
export interface UpdateLeadData {
    name?: string;
    email?: string;
    city?: string;
    state?: string;
    address?: string;
    primarySkill?: string;
    source?: LeadSource;
    sourceDetails?: string;
    skills?: ILeadSkill[];
}
export interface UpdateStatusData {
    status: LeadStatus;
    notes?: string;
    changedBy: string;
    changedByName?: string;
}
export interface SearchFilters {
    status?: LeadStatus;
    city?: string;
    primarySkill?: string;
    source?: LeadSource;
    addedBy?: string;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
}
export declare class LeadService {
    /**
     * Generate unique lead ID
     */
    static generateLeadId(): string;
    /**
     * Create a new lead
     */
    static createLead(data: CreateLeadData): Promise<ILead>;
    /**
     * Get lead by ID
     */
    static getLeadById(leadId: string): Promise<ILead | null>;
    /**
     * Search and filter leads
     */
    static searchLeads(filters: SearchFilters): Promise<{
        leads: ILead[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    /**
     * Update lead
     */
    static updateLead(leadId: string, data: UpdateLeadData & {
        skills?: ILeadSkill[];
    }): Promise<ILead | null>;
    /**
     * Update lead status
     */
    static updateStatus(leadId: string, data: UpdateStatusData, currentRole: UserRole): Promise<ILead | null>;
    /**
     * Add internal note
     */
    static addNote(leadId: string, note: string, addedBy: string, addedByName?: string, isPrivate?: boolean): Promise<ILead | null>;
    /**
     * Add document to lead
     */
    static addDocument(leadId: string, document: ILead['documents'][0]): Promise<ILead | null>;
    /**
     * Verify or reject a document
     */
    static verifyDocument(leadId: string, documentIndex: number, status: 'verified' | 'rejected', verifiedBy: string, verifiedByName?: string, rejectionReason?: string): Promise<ILead | null>;
    /**
     * Delete a document
     */
    static deleteDocument(leadId: string, documentIndex: number): Promise<ILead | null>;
    /**
     * Add skill to lead
     */
    static addSkill(leadId: string, skill: ILeadSkill): Promise<ILead | null>;
    /**
     * Update a skill
     */
    static updateSkill(leadId: string, skillIndex: number, updateData: Partial<ILeadSkill>): Promise<ILead | null>;
    /**
     * Remove a skill
     */
    static removeSkill(leadId: string, skillIndex: number): Promise<ILead | null>;
    /**
     * Log activity
     */
    static logActivity(leadId: string, type: string, action: string, performedBy: string, performedByName?: string, metadata?: Record<string, any>): Promise<void>;
}
//# sourceMappingURL=LeadService.d.ts.map