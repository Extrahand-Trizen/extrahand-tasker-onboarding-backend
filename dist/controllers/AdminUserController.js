"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminUserController = void 0;
const AdminUser_1 = __importDefault(require("../models/AdminUser"));
const firebase_1 = require("../config/firebase");
const logger_1 = __importDefault(require("../config/logger"));
class AdminUserController {
    static async list(req, res) {
        const admins = await AdminUser_1.default.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, data: admins });
    }
    static async create(req, res) {
        const { uid, email, role } = req.body;
        const createdBy = req.admin?.uid || 'system';
        if (!uid || !email || !role) {
            return res.status(400).json({ success: false, error: 'uid, email, and role are required' });
        }
        if (!['admin', 'operations', 'marketing', 'support', 'trust'].includes(role)) {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }
        const existing = await AdminUser_1.default.findOne({ uid });
        if (existing) {
            return res.status(400).json({ success: false, error: 'Admin user already exists' });
        }
        const adminUser = await AdminUser_1.default.create({
            uid,
            email: email.toLowerCase(),
            role,
            status: 'active',
            createdBy,
            lastRoleChangeBy: createdBy,
            lastRoleChangeAt: new Date(),
        });
        // Set Firebase custom claim
        try {
            await firebase_1.auth.setCustomUserClaims(uid, { role });
        }
        catch (error) {
            logger_1.default.error('Failed to set Firebase custom claims', { uid, error: error.message });
            return res.status(500).json({ success: false, error: 'Failed to set Firebase claims; user created in DB' });
        }
        res.json({ success: true, data: adminUser });
    }
    static async updateRole(req, res) {
        const { uid } = req.params;
        const { role } = req.body;
        const actor = req.admin?.uid || 'system';
        if (!role || !['admin', 'operations', 'marketing', 'support', 'trust'].includes(role)) {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }
        const adminUser = await AdminUser_1.default.findOne({ uid });
        if (!adminUser) {
            return res.status(404).json({ success: false, error: 'Admin user not found' });
        }
        adminUser.role = role;
        adminUser.lastRoleChangeBy = actor;
        adminUser.lastRoleChangeAt = new Date();
        await adminUser.save();
        try {
            await firebase_1.auth.setCustomUserClaims(uid, { role });
        }
        catch (error) {
            logger_1.default.error('Failed to set Firebase custom claims', { uid, error: error.message });
            return res.status(500).json({ success: false, error: 'Role updated in DB but failed to set Firebase claims' });
        }
        res.json({ success: true, data: adminUser });
    }
    static async resetPassword(req, res) {
        const { uid } = req.params;
        const adminUser = await AdminUser_1.default.findOne({ uid });
        if (!adminUser) {
            return res.status(404).json({ success: false, error: 'Admin user not found' });
        }
        try {
            const link = await firebase_1.auth.generatePasswordResetLink(adminUser.email);
            return res.json({ success: true, data: { resetLink: link } });
        }
        catch (error) {
            logger_1.default.error('Failed to generate password reset link', { uid, error: error.message });
            return res.status(500).json({ success: false, error: 'Failed to generate reset link' });
        }
    }
}
exports.AdminUserController = AdminUserController;
//# sourceMappingURL=AdminUserController.js.map