import { Request, Response } from 'express';
import AdminUser from '../models/AdminUser';
import { auth } from '../config/firebase';
import logger from '../config/logger';

export class AdminUserController {
  static async list(req: Request, res: Response) {
    const admins = await AdminUser.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: admins });
  }

  static async create(req: Request, res: Response) {
    const { uid, email, role } = req.body as { uid?: string; email?: string; role?: string };
    const createdBy = (req as any).admin?.uid || 'system';

    if (!uid || !email || !role) {
      return res.status(400).json({ success: false, error: 'uid, email, and role are required' });
    }

    if (!['lead_access_manager', 'onboarder', 'qualifier', 'support', 'trust'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    const existing = await AdminUser.findOne({ uid });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Admin user already exists' });
    }

    const adminUser = await AdminUser.create({
      uid,
      email: email.toLowerCase(),
      role,
      status: 'active',
      createdBy,
      lastRoleChangeBy: createdBy,
      lastRoleChangeAt: new Date(),
    });

    // Set Firebase custom claim
    try {
      await auth.setCustomUserClaims(uid, { role });
    } catch (error: any) {
      logger.error('Failed to set Firebase custom claims', { uid, error: error.message });
      return res.status(500).json({ success: false, error: 'Failed to set Firebase claims; user created in DB' });
    }

    res.json({ success: true, data: adminUser });
  }

  static async updateRole(req: Request, res: Response) {
    const { uid } = req.params;
    const { role } = req.body as { role?: string };
    const actor = (req as any).admin?.uid || 'system';

    if (!role || !['lead_access_manager', 'onboarder', 'qualifier', 'support', 'trust'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    const adminUser = await AdminUser.findOne({ uid });
    if (!adminUser) {
      return res.status(404).json({ success: false, error: 'Admin user not found' });
    }

    adminUser.role = role as any;
    adminUser.lastRoleChangeBy = actor;
    adminUser.lastRoleChangeAt = new Date();
    await adminUser.save();

    try {
      await auth.setCustomUserClaims(uid, { role });
    } catch (error: any) {
      logger.error('Failed to set Firebase custom claims', { uid, error: error.message });
      return res.status(500).json({ success: false, error: 'Role updated in DB but failed to set Firebase claims' });
    }

    res.json({ success: true, data: adminUser });
  }

  static async resetPassword(req: Request, res: Response) {
    const { uid } = req.params;
    const adminUser = await AdminUser.findOne({ uid });
    if (!adminUser) {
      return res.status(404).json({ success: false, error: 'Admin user not found' });
    }

    try {
      const link = await auth.generatePasswordResetLink(adminUser.email);
      logger.info('Password reset link generated', { uid, email: adminUser.email });
      return res.json({ success: true, data: { resetLink: link } });
    } catch (error: any) {
      logger.error('Failed to generate password reset link', { 
        uid, 
        email: adminUser.email,
        error: error.message,
        code: error.code,
        stack: error.stack
      });
      
      // Provide more specific error messages
      let errorMessage = 'Failed to generate reset link';
      if (error.message?.includes('invalid_grant') || error.message?.includes('JWT Signature')) {
        errorMessage = 'Firebase authentication failed. Please check Firebase credentials configuration.';
      } else if (error.message?.includes('USER_NOT_FOUND')) {
        errorMessage = 'User not found in Firebase';
      }
      
      return res.status(500).json({ 
        success: false, 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}







