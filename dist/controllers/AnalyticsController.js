"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const AnalyticsService_1 = require("../services/AnalyticsService");
class AnalyticsController {
    static async getOverview(_req, res, next) {
        try {
            const data = await AnalyticsService_1.AnalyticsService.getOverview();
            res.json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.AnalyticsController = AnalyticsController;
//# sourceMappingURL=AnalyticsController.js.map