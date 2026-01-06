"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceAuthMiddleware = void 0;
const logger_1 = __importDefault(require("../config/logger"));
const env_1 = require("../config/env");
const serviceAuthMiddleware = (req, res, next) => {
    const serviceAuthToken = req.headers['x-service-auth'];
    const serviceName = req.headers['x-service-name'];
    const userId = req.headers['x-user-id'];
    if (!serviceAuthToken || serviceAuthToken !== env_1.env.SERVICE_AUTH_TOKEN) {
        logger_1.default.warn('Service auth failed', {
            provided: serviceAuthToken ? 'present' : 'missing'
        });
        return res.status(401).json({
            success: false,
            error: 'Service authentication required'
        });
    }
    req.service = {
        name: serviceName || 'unknown',
        userId
    };
    next();
};
exports.serviceAuthMiddleware = serviceAuthMiddleware;
//# sourceMappingURL=serviceAuth.js.map