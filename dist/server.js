"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const database_1 = require("./config/database");
const logger_1 = __importDefault(require("./config/logger"));
const env_1 = require("./config/env");
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