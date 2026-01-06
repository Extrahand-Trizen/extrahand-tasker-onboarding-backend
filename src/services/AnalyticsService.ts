import Lead from '../models/Lead';

export class AnalyticsService {
  static async getOverview() {
    const statusCounts = await Lead.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { status: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ]);

    const sourceCounts = await Lead.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $project: { source: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ]);

    const cityCounts = await Lead.aggregate([
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $project: { city: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const skillCounts = await Lead.aggregate([
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







