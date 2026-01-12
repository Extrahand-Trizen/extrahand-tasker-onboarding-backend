"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const bulkUpload_1 = __importDefault(require("./routes/bulkUpload"));
const leads_1 = __importDefault(require("./routes/leads"));
const bulkLeadImport_1 = __importDefault(require("./routes/bulkLeadImport"));
const approval_1 = __importDefault(require("./routes/approval"));
const activation_1 = __importDefault(require("./routes/activation"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const uploads_1 = __importDefault(require("./routes/uploads"));
const adminUsers_1 = __importDefault(require("./routes/adminUsers"));
const invites_1 = __importDefault(require("./routes/invites"));
const microsoftAuth_1 = __importDefault(require("./routes/microsoftAuth"));
const passwordAuth_1 = __importDefault(require("./routes/passwordAuth"));
const userManagement_1 = __importDefault(require("./routes/userManagement"));
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = __importDefault(require("./config/logger"));
const app = (0, express_1.default)();
// Security middleware
app.use((0, helmet_1.default)());
// CORS
app.use((0, cors_1.default)({
    origin: true,
    credentials: true
}));
// Body parsing
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Compression
app.use((0, compression_1.default)());
// Logging
app.use((0, morgan_1.default)('combined', {
    stream: {
        write: (message) => logger_1.default.info(message.trim())
    }
}));
// Health check
app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', service: 'tasker-onboarding-service' });
});
// Authentication routes (Microsoft OAuth + JWT + Password)
app.use('/api/v1/auth', microsoftAuth_1.default);
app.use('/api/v1/auth', passwordAuth_1.default);
app.use('/api/v1/admin/invites', invites_1.default);
app.use('/api/v1/admin/users', userManagement_1.default);
// Internal routes (service-to-service only)
app.use('/api/v1/internal/bulk-upload', bulkUpload_1.default);
// Onboarding routes (tasker onboarding platform)
app.use('/api/v1/onboarding/leads', leads_1.default);
app.use('/api/v1/onboarding/leads/bulk-import', bulkLeadImport_1.default);
app.use('/api/v1/onboarding/leads', approval_1.default);
app.use('/api/v1/onboarding/leads', activation_1.default);
app.use('/api/v1/onboarding/analytics', analytics_1.default);
app.use('/api/v1/onboarding/uploads', uploads_1.default);
app.use('/api/v1/onboarding/team', adminUsers_1.default);
// Error handler
app.use(errorHandler_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map