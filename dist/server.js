"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const database_1 = require("./config/database");
const logger_1 = __importDefault(require("./config/logger"));
const env_1 = require("./config/env");
const redis_1 = require("./config/redis");
// Start CSV worker (background job processor)
// Only start if Redis is configured
if (process.env.REDIS_HOST || process.env.REDIS_URL) {
    try {
        require('./workers/csvWorker');
        logger_1.default.info('✅ CSV worker started');
    }
    catch (error) {
        logger_1.default.warn('⚠️  CSV worker failed to start:', error.message);
        logger_1.default.warn('   CSV processing will not work. Check Redis configuration.');
    }
}
else {
    logger_1.default.warn('⚠️  Redis not configured - CSV background processing disabled');
    logger_1.default.warn('   Set REDIS_HOST or REDIS_URL to enable background job processing');
}
const PORT = env_1.env.PORT;
// Connect to database
(0, database_1.connectDatabase)()
    .then(() => {
    // Start server
    const server = app_1.default.listen(PORT, () => {
        logger_1.default.info(`🚀 Admin Service running on port ${PORT}`);
    });
    // Graceful shutdown
    const shutdown = async () => {
        logger_1.default.info('Shutting down gracefully...');
        server.close(async () => {
            await (0, database_1.disconnectDatabase)();
            await (0, redis_1.closeRedisConnection)();
            process.exit(0);
        });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
})
    .catch((error) => {
    logger_1.default.error('Failed to start server:', error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map