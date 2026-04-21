"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAuthJWT = exports.adminAuthMiddleware = void 0;
const firebase_1 = require("../config/firebase");
const AdminUser_1 = __importDefault(require("../models/AdminUser"));
const logger_1 = __importDefault(require("../config/logger"));
const jwt_1 = require("../utils/jwt");
const adminAuthMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger_1.default.warn('Admin auth failed: No token provided');
            res.status(401).json({
                success: false,
                error: 'Authentication required',
                message: 'Please provide a valid authentication token'
            });
            return;
        }
        const token = authHeader.split('Bearer ')[1];
        // Try JWT authentication first (new system)
        try {
            const decoded = (0, jwt_1.verifyAccessToken)(token);
            // Get user from database to verify they're still active
            const adminUser = await AdminUser_1.default.findOne({
                userId: decoded.userId,
                status: 'active',
            }).select('-refreshTokens -passwordHash');
            if (!adminUser) {
                throw new Error('User not found or inactive');
            }
            req.admin = {
                uid: adminUser.uid,
                userId: adminUser.userId,
                email: adminUser.email,
                name: adminUser.name,
                role: adminUser.role,
                team: adminUser.team,
                department: adminUser.department,
            };
            // Set user alias for backward compatibility
            req.user = req.admin;
            logger_1.default.debug('Admin authenticated via JWT', {
                userId: adminUser.userId,
                email: adminUser.email,
                role: adminUser.role
            });
            return next();
        }
        catch (jwtError) {
            // JWT authentication failed, try Firebase (legacy)
            logger_1.default.debug('JWT auth failed, trying Firebase', {
                error: jwtError.message
            });
        }
        // Fallback to Firebase authentication (legacy)
        try {
            const decodedToken = await firebase_1.auth.verifyIdToken(token);
            // ✅ Query AdminUser database to get correct role
            let adminRole = decodedToken.role; // Fallback to Firebase custom claims
            let adminName;
            try {
                const adminUser = await AdminUser_1.default.findOne({ uid: decodedToken.uid });
                if (adminUser) {
                    adminRole = adminUser.role; // ✅ Use database role as source of truth
                    adminName = adminUser.name;
                    logger_1.default.debug('Admin role from database', {
                        uid: decodedToken.uid,
                        email: decodedToken.email,
                        role: adminRole
                    });
                }
                else {
                    logger_1.default.warn('Admin user not found in database', {
                        uid: decodedToken.uid,
                        email: decodedToken.email
                    });
                }
            }
            catch (dbError) {
                logger_1.default.warn('Failed to query AdminUser database, using Firebase claims', {
                    uid: decodedToken.uid,
                    error: dbError.message
                });
                // Continue with Firebase custom claims as fallback
            }
            req.admin = {
                uid: decodedToken.uid,
                email: decodedToken.email,
                name: decodedToken.name || adminName,
                role: adminRole || 'qualifier' // ✅ Use database role, fallback to Firebase, then 'qualifier'
            };
            // Set user alias for backward compatibility
            req.user = req.admin;
            logger_1.default.debug('Admin authenticated via Firebase', {
                uid: decodedToken.uid,
                email: decodedToken.email,
                role: req.admin.role
            });
            return next();
        }
        catch (firebaseError) {
            logger_1.default.warn('Both JWT and Firebase auth failed', {
                jwtError: 'JWT verification failed',
                firebaseError: firebaseError.message
            });
            res.status(401).json({
                success: false,
                error: 'Invalid token',
                message: 'The provided token is invalid or expired'
            });
            return;
        }
    }
    catch (error) {
        logger_1.default.error('Admin auth error', {
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: 'Authentication error',
            message: 'An error occurred during authentication'
        });
        return;
    }
};
exports.adminAuthMiddleware = adminAuthMiddleware;
/**
 * JWT-based authentication middleware (for password auth)
 */
const adminAuthJWT = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger_1.default.warn('JWT auth failed: No token provided');
            res.status(401).json({
                success: false,
                error: 'Authentication required',
                message: 'Please provide a valid authentication token'
            });
            return;
        }
        const token = authHeader.split('Bearer ')[1];
        try {
            const decoded = (0, jwt_1.verifyAccessToken)(token);
            req.admin = {
                userId: decoded.userId,
                email: decoded.email,
                role: decoded.role,
                team: decoded.team,
                department: decoded.department,
            };
            // Set user alias for backward compatibility
            req.user = req.admin;
            logger_1.default.debug('Admin authenticated via JWT', {
                userId: decoded.userId,
                email: decoded.email,
                role: decoded.role
            });
            next();
        }
        catch (error) {
            logger_1.default.warn('JWT auth failed: Invalid token', {
                error: error.message
            });
            res.status(401).json({
                success: false,
                error: 'Invalid token',
                message: 'The provided token is invalid or expired'
            });
            return;
        }
    }
    catch (error) {
        logger_1.default.error('JWT auth error', {
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: 'Authentication error',
            message: 'An error occurred during authentication'
        });
        return;
    }
};
exports.adminAuthJWT = adminAuthJWT;
//# sourceMappingURL=adminAuth.js.map