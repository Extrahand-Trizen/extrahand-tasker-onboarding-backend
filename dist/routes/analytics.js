"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AnalyticsController_1 = require("../controllers/AnalyticsController");
const adminAuth_1 = require("../middleware/adminAuth");
const roleAuth_1 = require("../middleware/roleAuth");
const router = (0, express_1.Router)();
router.use(adminAuth_1.adminAuthMiddleware);
router.get('/overview', (0, roleAuth_1.requirePermission)('canViewAnalytics'), AnalyticsController_1.AnalyticsController.getOverview);
exports.default = router;
//# sourceMappingURL=analytics.js.map