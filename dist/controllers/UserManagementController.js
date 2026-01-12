"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserManagementController = void 0;
const AdminUser_1 = __importDefault(require("../models/AdminUser"));
const logger_1 = __importDefault(require("../config/logger"));
class UserManagementController {
    /**
     * List all admin users
     * GET /api/v1/admin/users
     */
    static async list(req, res) {
        try {
            const { status, role, search } = req.query;
            const query = {};
            if (status)
                query.status = status;
            if (role)
                query.role = role;
            if (search) {
                query.$or = [
                    { email: { $regex: search, $options: 'i' } },
                    { name: { $regex: search, $options: 'i' } },
                ];
            }
            const users = await AdminUser_1.default.find(query)
                .select('-passwordHash -refreshTokens')
                .sort({ createdAt: -1 })
                .lean();
            return res.json({
                success: true,
                data: users,
            });
        }
        catch (error) {
            logger_1.default.error('List users error', { error: error.message });
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch users',
            });
        }
    }
    /**
     * Get user details
     * GET /api/v1/admin/users/:userId
     */
    static async getById(req, res) {
        try {
            const { userId } = req.params;
            const user = await AdminUser_1.default.findOne({ userId })
                .select('-passwordHash -refreshTokens')
                .lean();
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found',
                });
            }
            return res.json({
                success: true,
                data: user,
            });
        }
        catch (error) {
            logger_1.default.error('Get user error', { error: error.message });
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch user',
            });
        }
    }
    /**
     * Update user role
     * PUT /api/v1/admin/users/:userId/role
     */
    static async updateRole(req, res) {
        try {
            const { userId } = req.params;
            const { role } = req.body;
            const actorId = req.admin?.userId || 'system';
            if (!role || !['admin', 'operations', 'marketing', 'support', 'trust'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid role',
                });
            }
            const user = await AdminUser_1.default.findOne({ userId });
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found',
                });
            }
            // Prevent self-role change to non-admin
            if (user.userId === actorId && role !== 'admin') {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot change your own role from admin',
                });
            }
            user.role = role;
            user.lastRoleChangeBy = actorId;
            user.lastRoleChangeAt = new Date();
            await user.save();
            logger_1.default.info('User role updated', {
                userId: user.userId,
                email: user.email,
                newRole: role,
                changedBy: actorId,
            });
            return res.json({
                success: true,
                data: user,
            });
        }
        catch (error) {
            logger_1.default.error('Update role error', { error: error.message });
            return res.status(500).json({
                success: false,
                error: 'Failed to update role',
            });
        }
    }
    /**
     * Update user status (suspend/activate)
     * PUT /api/v1/admin/users/:userId/status
     */
    static async updateStatus(req, res) {
        try {
            const { userId } = req.params;
            const { status } = req.body;
            const actorId = req.admin?.userId || 'system';
            if (!status || !['active', 'suspended', 'inactive'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid status',
                });
            }
            const user = await AdminUser_1.default.findOne({ userId });
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found',
                });
            }
            // Prevent self-suspension
            if (user.userId === actorId && status === 'suspended') {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot suspend your own account',
                });
            }
            user.status = status;
            await user.save();
            logger_1.default.info('User status updated', {
                userId: user.userId,
                email: user.email,
                newStatus: status,
                changedBy: actorId,
            });
            return res.json({
                success: true,
                data: user,
            });
        }
        catch (error) {
            logger_1.default.error('Update status error', { error: error.message });
            return res.status(500).json({
                success: false,
                error: 'Failed to update status',
            });
        }
    }
    /**
     * Update user details (name, team, department)
     * PUT /api/v1/admin/users/:userId
     */
    static async update(req, res) {
        try {
            const { userId } = req.params;
            const { name, team, department } = req.body;
            const user = await AdminUser_1.default.findOne({ userId });
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found',
                });
            }
            if (name !== undefined)
                user.name = name;
            if (team !== undefined)
                user.team = team;
            if (department !== undefined)
                user.department = department;
            await user.save();
            logger_1.default.info('User updated', {
                userId: user.userId,
                email: user.email,
            });
            return res.json({
                success: true,
                data: user,
            });
        }
        catch (error) {
            logger_1.default.error('Update user error', { error: error.message });
            return res.status(500).json({
                success: false,
                error: 'Failed to update user',
            });
        }
    }
}
exports.UserManagementController = UserManagementController;
//# sourceMappingURL=UserManagementController.js.map