/**
 * One-time migration: Move leads with status 'rejected' to 'inactive'
 * (Lead status "rejected" has been removed from the pipeline.)
 *
 * Updates both top-level status and statusHistory[].status.
 * Run from backend root with .env loaded.
 *
 * Usage:
 *   cd extrahand-tasker-onboarding-backend
 *   node scripts/migrate-rejected-to-inactive.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/extrahand';
const MONGO_DB = process.env.MONGO_DB || 'extrahand';

async function migrate() {
  try {
    console.log('🔄 Migrating lead status: rejected -> inactive\n');
    console.log('📊 Connecting to MongoDB:', MONGODB_URI.replace(/\/\/[^:]*:[^@]*@/, '//***@'));
    console.log('📊 Database:', MONGO_DB);

    await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const leads = db.collection('leads');

    const topLevelResult = await leads.updateMany(
      { status: 'rejected' },
      { $set: { status: 'inactive' } }
    );
    console.log(`   Top-level status 'rejected' -> 'inactive': ${topLevelResult.modifiedCount} documents`);

    const histResult = await leads.updateMany(
      { 'statusHistory.status': 'rejected' },
      { $set: { 'statusHistory.$[elem].status': 'inactive' } },
      { arrayFilters: [{ 'elem.status': 'rejected' }] }
    );
    console.log(`   statusHistory 'rejected' -> 'inactive': ${histResult.modifiedCount} documents`);

    console.log('\n✅ Migration completed.');
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
