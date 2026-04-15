import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import bulkUploadRoutes from './routes/bulkUpload';
import leadsRoutes from './routes/leads';
import bulkLeadImportRoutes from './routes/bulkLeadImport';
import approvalRoutes from './routes/approval';
import activationRoutes from './routes/activation';
import analyticsRoutes from './routes/analytics';
import uploadsRoutes from './routes/uploads';
import adminUsersRoutes from './routes/adminUsers';
import invitesRoutes from './routes/invites';
import microsoftAuthRoutes from './routes/microsoftAuth';
import passwordAuthRoutes from './routes/passwordAuth';
import userManagementRoutes from './routes/userManagement';
import certificateReviewRoutes from './routes/certificateReview';
import { errorHandler } from './middleware/errorHandler';
import logger from './config/logger';

const app = express();

// Security middleware
app.use(helmet());

// CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Compression
app.use(compression());

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', service: 'tasker-onboarding-service' });
});

// Authentication routes (Microsoft OAuth + JWT + Password)
app.use('/api/v1/auth', microsoftAuthRoutes);
app.use('/api/v1/auth', passwordAuthRoutes);
app.use('/api/v1/admin/invites', invitesRoutes);
app.use('/api/v1/admin/users', userManagementRoutes);

// Internal routes (service-to-service only)
app.use('/api/v1/internal/bulk-upload', bulkUploadRoutes);

// Onboarding routes (tasker onboarding platform)
// IMPORTANT: Mount bulk-import routes BEFORE generic leads routes
// so that paths like /api/v1/onboarding/leads/bulk-import/history
// don't get intercepted by the generic /leads routes (which can
// return "Lead not found" 404s).
app.use('/api/v1/onboarding/leads/bulk-import', bulkLeadImportRoutes);
app.use('/api/v1/onboarding/leads', leadsRoutes);
app.use('/api/v1/onboarding/leads', approvalRoutes);
app.use('/api/v1/onboarding/leads', activationRoutes);
app.use('/api/v1/onboarding/analytics', analyticsRoutes);
app.use('/api/v1/onboarding/uploads', uploadsRoutes);
app.use('/api/v1/onboarding/team', adminUsersRoutes);
app.use('/api/v1/onboarding/certificates', certificateReviewRoutes);

// Error handler
app.use(errorHandler);

export default app;

