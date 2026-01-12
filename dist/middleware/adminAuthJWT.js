"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAdminAuthJWTMiddleware = exports.adminAuthJWTMiddleware = void 0;
const AdminUser_1 = __importDefault(require("../models/AdminUser"));
const logger_1 = __importDefault(require("../config/logger"));
const jwt_1 = require("../utils/jwt");
/**
 * JWT-based admin authentication middleware
 * Replaces Firebase authentication
 */
const adminAuthJWTMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger_1.default.warn('Admin auth failed: No token provided');
            res.status(401).json({
                success: false,
                error: 'Authentication required',
                message: 'Please provide a valid authentication token',
            });
            return;
        }
        const token = authHeader.split('Bearer ')[1];
        try {
            // Verify JWT token
            const decoded = (0, jwt_1.verifyAccessToken)(token);
            // Get user from database to verify they're still active
            const adminUser = await AdminUser_1.default.findOne({
                userId: decoded.userId,
                status: 'active',
            }).select('-refreshTokens -passwordHash');
            if (!adminUser) {
                logger_1.default.warn('Admin user not found or inactive', {
                    userId: decoded.userId,
                });
                res.status(401).json({
                    success: false,
                    error: 'Invalid authentication',
                    message: 'User not found or account is inactive',
                });
                return;
            }
            // Attach admin info to request
            req.admin = {
                userId: adminUser.userId,
                email: adminUser.email,
                name: adminUser.name,
                role: adminUser.role,
                team: adminUser.team,
                department: adminUser.department,
            };
            // Set user alias for backward compatibility with existing code
            req.user = {
                uid: adminUser.uid || adminUser.userId, // Legacy support
                email: adminUser.email,
                name: adminUser.name,
                role: adminUser.role,
            };
            logger_1.default.debug('Admin authenticated via JWT', {
                userId: adminUser.userId,
                email: adminUser.email,
                role: adminUser.role,
            });
            next();
        }
        catch (error) {
            logger_1.default.warn('JWT verification failed', {
                error: error.message,
            });
            res.status(401).json({
                success: false,
                error: 'Invalid or expired token',
                message: 'Please login again',
            });
            return;
        }
    }
    catch (error) {
        logger_1.default.error('Admin auth middleware error', {
            error: error.message,
        });
        res.status(500).json({
            success: false,
            error: 'Authentication error',
        });
    }
};
exports.adminAuthJWTMiddleware = adminAuthJWTMiddleware;
/**
 * Optional admin auth - doesn't fail if no token provided
 * Useful for endpoints that work both for authenticated and unauthenticated users
 */
const optionalAdminAuthJWTMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No auth provided, continue without setting req.admin
        return next();
    }
    // Try to authenticate, but don't fail if it doesn't work
    try {
        await (0, exports.adminAuthJWTMiddleware)(req, res, () => { });
    }
    catch (error) {
        // Ignore errors, just continue
    }
    next();
};
exports.optionalAdminAuthJWTMiddleware = optionalAdminAuthJWTMiddleware;
//# sourceMappingURL=adminAuthJWT.js.map