/**
 * Fix statusHistory entries that still have legacy values 'contacted' or 'interested'.
 * Use this when you get: "`interested` is not a valid enum value for path `status`".
 *
 * Updates only statusHistory[].status (not top-level status).
 * Safe to run multiple times. Run on production with production .env.
 *
 * Usage:
 *   cd extrahand-tasker-onboarding-backend
 *   node scripts/migrate-status-history-legacy-values.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/extrahand';
const MONGO_DB = process.env.MONGO_DB || 'extrahand';

async function migrate() {
  try {
    console.log('🔄 Fixing statusHistory legacy values: contacted -> contacted_not_interested, interested -> contacted_interested\n');
    console.log('📊 Connecting to MongoDB:', MONGODB_URI.replace(/\/\/[^:]*:[^@]*@/, '//***@'));
    console.log('📊 Database:', MONGO_DB);

    await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const leads = db.collection('leads');

    const histContacted = await leads.updateMany(
      { 'statusHistory.status': 'contacted' },
      { $set: { 'statusHistory.$[elem].status': 'contacted_not_interested' } },
      { arrayFilters: [{ 'elem.status': 'contacted' }] }
    );
    console.log(`   statusHistory 'contacted' -> 'contacted_not_interested': ${histContacted.modifiedCount} documents`);

    const histInterested = await leads.updateMany(
      { 'statusHistory.status': 'interested' },
      { $set: { 'statusHistory.$[elem].status': 'contacted_interested' } },
      { arrayFilters: [{ 'elem.status': 'interested' }] }
    );
    console.log(`   statusHistory 'interested' -> 'contacted_interested': ${histInterested.modifiedCount} documents`);

    console.log('\n✅ Migration completed. Status updates should no longer fail validation.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  }
}

migrate();
