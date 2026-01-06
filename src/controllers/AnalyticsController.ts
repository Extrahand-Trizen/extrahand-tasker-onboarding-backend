import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from '../services/AnalyticsService';

export class AnalyticsController {
  static async getOverview(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AnalyticsService.getOverview();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}







