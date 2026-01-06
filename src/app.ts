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
import emailTemplatesRoutes from './routes/emailTemplates';
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
  res.json({ status: 'ok', service: 'admin-service' });
});

// Routes
app.use('/api/v1/admin/bulk-upload', bulkUploadRoutes);
app.use('/api/v1/admin/caos/leads', leadsRoutes);
app.use('/api/v1/admin/caos/leads/bulk-import', bulkLeadImportRoutes);
app.use('/api/v1/admin/caos/leads', approvalRoutes);
app.use('/api/v1/admin/caos/leads', activationRoutes);
app.use('/api/v1/admin/caos/analytics', analyticsRoutes);
app.use('/api/v1/admin/uploads', uploadsRoutes);
app.use('/api/v1/admin/admin-users', adminUsersRoutes);
app.use('/api/v1/admin/email-templates', emailTemplatesRoutes);

// Error handler
app.use(errorHandler);

export default app;

