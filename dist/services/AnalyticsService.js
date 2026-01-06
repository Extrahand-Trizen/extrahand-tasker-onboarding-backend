"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const Lead_1 = __importDefault(require("../models/Lead"));
class AnalyticsService {
    static async getOverview() {
        const statusCounts = await Lead_1.default.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $project: { status: '$_id', count: 1, _id: 0 } },
            { $sort: { count: -1 } }
        ]);
        const sourceCounts = await Lead_1.default.aggregate([
            { $group: { _id: '$source', count: { $sum: 1 } } },
            { $project: { source: '$_id', count: 1, _id: 0 } },
            { $sort: { count: -1 } }
        ]);
        const cityCounts = await Lead_1.default.aggregate([
            { $group: { _id: '$city', count: { $sum: 1 } } },
            { $project: { city: '$_id', count: 1, _id: 0 } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        const skillCounts = await Lead_1.default.aggregate([
            { $group: { _id: '$primarySkill', count: { $sum: 1 } } },
            { $project: { primarySkill: '$_id', count: 1, _id: 0 } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        return {
            statusCounts,
            sourceCounts,
            cityCounts,
            skillCounts
        };
    }
}
exports.AnalyticsService = AnalyticsService;
//# sourceMappingURL=AnalyticsService.js.map