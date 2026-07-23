import app from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import logger from './config/logger';
import { env } from './config/env';
import { closeRedisConnection } from './config/redis';

// Start CSV worker (background job processor)
// Only start if Redis is configured
if (process.env.REDIS_HOST || process.env.REDIS_URL) {
  try {
    require('./workers/csvWorker');
    logger.info('✅ CSV worker started');
  } catch (error: any) {
    logger.warn('⚠️  CSV worker failed to start:', error.message);
    logger.warn('   CSV processing will not work. Check Redis configuration.');
  }
} else {
  logger.warn('⚠️  Redis not configured - CSV background processing disabled');
  logger.warn('   Set REDIS_HOST or REDIS_URL to enable background job processing');
}

const PORT = env.PORT;

// Connect to database
connectDatabase()
  .then(() => { 
    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Admin Service running on port ${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      server.close(async () => {
        await disconnectDatabase();
        await closeRedisConnection();
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })
  .catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });

