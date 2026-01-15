"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = requirePermission;
exports.requireRole = requireRole;
const permissions_1 = require("../lib/permissions");
const logger_1 = __importDefault(require("../config/logger"));
function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.admin) {
            res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
            return;
        }
        const role = (req.admin.role || 'qualifier');
        if (!(0, permissions_1.hasPermission)(role, permission)) {
            logger_1.default.warn('Permission denied', {
                uid: req.admin.uid,
                role,
                permission
            });
            res.status(403).json({
                success: false,
                error: 'Permission denied',
                message: `You don't have permission to ${permission}`
            });
            return;
        }
        next();
    };
}
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.admin) {
            res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
            return;
        }
        const role = (req.admin.role || 'qualifier');
        if (!allowedRoles.includes(role)) {
            logger_1.default.warn('Role access denied', {
                uid: req.admin.uid,
                role,
                allowedRoles
            });
            res.status(403).json({
                success: false,
                error: 'Access denied',
                message: `This action requires one of these roles: ${allowedRoles.join(', ')}`
            });
            return;
        }
        next();
    };
}
//# sourceMappingURL=roleAuth.js.map