"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAuthMiddleware = void 0;
const firebase_1 = require("../config/firebase");
const logger_1 = __importDefault(require("../config/logger"));
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
        try {
            const decodedToken = await firebase_1.auth.verifyIdToken(token);
            req.admin = {
                uid: decodedToken.uid,
                email: decodedToken.email,
                name: decodedToken.name,
                role: decodedToken.role || 'marketing' // Default role, can be set in Firebase custom claims
            };
            logger_1.default.debug('Admin authenticated', {
                uid: decodedToken.uid,
                email: decodedToken.email,
                role: req.admin.role
            });
            next();
        }
        catch (error) {
            logger_1.default.warn('Admin auth failed: Invalid token', {
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
//# sourceMappingURL=adminAuth.js.map