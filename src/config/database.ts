import dns from 'node:dns';
import mongoose from 'mongoose';
import logger from './logger';
import { env } from './env';

// Temporary workaround for local machine DNS issue.
// Do NOT commit this to Git.
dns.setServers(['8.8.8.8', '8.8.4.4']);

export const connectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGO_DB,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    logger.info('✅ MongoDB connected');
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info('✅ MongoDB disconnected');
  } catch (error) {
    logger.error('❌ MongoDB disconnection failed:', error);
  }
};