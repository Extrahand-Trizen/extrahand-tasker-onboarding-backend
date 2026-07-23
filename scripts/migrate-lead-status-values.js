/**
 * One-time migration: Rename lead status values
 *   'contacted' -> 'contacted_not_interested'
 *   'interested' -> 'contacted_interested'
 *
 * Updates both top-level status and statusHistory[].status.
 * Run from backend root with .env loaded.
 *
 * Usage:
 *   cd extrahand-tasker-onboarding-backend
 *   node scripts/migrate-lead-status-values.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/extrahand';
const MONGO_DB = process.env.MONGO_DB || 'extrahand';

async function migrate() {
  try {
    console.log('🔄 Migrating lead status values: contacted -> contacted_not_interested, interested -> contacted_interested\n');
    console.log('📊 Connecting to MongoDB:', MONGODB_URI.replace(/\/\/[^:]*:[^@]*@/, '//***@'));
    console.log('📊 Database:', MONGO_DB);

    await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const leads = db.collection('leads');

    // 1) Top-level status
    const contactedResult = await leads.updateMany(
      { status: 'contacted' },
      { $set: { status: 'contacted_not_interested' } }
    );
    console.log(`   Top-level status 'contacted' -> 'contacted_not_interested': ${contactedResult.modifiedCount} documents`);

    const interestedResult = await leads.updateMany(
      { status: 'interested' },
      { $set: { status: 'contacted_interested' } }
    );
    console.log(`   Top-level status 'interested' -> 'contacted_interested': ${interestedResult.modifiedCount} documents`);

    // 2) statusHistory[].status using arrayFilters
    const histContactedResult = await leads.updateMany(
      { 'statusHistory.status': 'contacted' },
      { $set: { 'statusHistory.$[elem].status': 'contacted_not_interested' } },
      { arrayFilters: [{ 'elem.status': 'contacted' }] }
    );
    console.log(`   statusHistory 'contacted' -> 'contacted_not_interested': ${histContactedResult.modifiedCount} documents`);

    const histInterestedResult = await leads.updateMany(
      { 'statusHistory.status': 'interested' },
      { $set: { 'statusHistory.$[elem].status': 'contacted_interested' } },
      { arrayFilters: [{ 'elem.status': 'interested' }] }
    );
    console.log(`   statusHistory 'interested' -> 'contacted_interested': ${histInterestedResult.modifiedCount} documents`);

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
