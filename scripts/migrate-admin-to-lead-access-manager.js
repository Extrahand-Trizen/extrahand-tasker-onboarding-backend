/**
 * Migration script to rename 'admin' role to 'lead_access_manager'
 * Usage: node scripts/migrate-admin-to-lead-access-manager.js
 */

const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/extrahand';

// Admin User Schema (simplified)
const adminUserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, required: true },
  // ... other fields not needed for migration
}, { collection: 'adminusers' });

// Admin Invite Schema (simplified)
const adminInviteSchema = new mongoose.Schema({
  inviteId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  role: { type: String, required: true },
  // ... other fields not needed for migration
}, { collection: 'admininvites' });

const AdminUser = mongoose.model('AdminUser', adminUserSchema);
const AdminInvite = mongoose.model('AdminInvite', adminInviteSchema);

async function migrate() {
  try {
    console.log('🚀 Starting migration: admin -> lead_access_manager\n');

    // Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Migrate AdminUser collection
    console.log('👤 Migrating AdminUser records...');
    const userUpdateResult = await AdminUser.updateMany(
      { role: 'admin' },
      { $set: { role: 'lead_access_manager' } }
    );
    console.log(`   ✅ Updated ${userUpdateResult.modifiedCount} AdminUser record(s)\n`);

    // Migrate AdminInvite collection
    console.log('📧 Migrating AdminInvite records...');
    const inviteUpdateResult = await AdminInvite.updateMany(
      { role: 'admin' },
      { $set: { role: 'lead_access_manager' } }
    );
    console.log(`   ✅ Updated ${inviteUpdateResult.modifiedCount} AdminInvite record(s)\n`);

    // Verify migration
    console.log('🔍 Verifying migration...');
    const remainingAdminUsers = await AdminUser.countDocuments({ role: 'admin' });
    const remainingAdminInvites = await AdminInvite.countDocuments({ role: 'admin' });
    
    if (remainingAdminUsers === 0 && remainingAdminInvites === 0) {
      console.log('✅ Migration completed successfully! No remaining "admin" roles found.\n');
    } else {
      console.warn(`⚠️  Warning: Found ${remainingAdminUsers} AdminUser(s) and ${remainingAdminInvites} AdminInvite(s) with "admin" role still remaining.\n`);
    }

    // Show summary
    const leadAccessManagerUsers = await AdminUser.countDocuments({ role: 'lead_access_manager' });
    const leadAccessManagerInvites = await AdminInvite.countDocuments({ role: 'lead_access_manager' });
    
    console.log('📊 Migration Summary:');
    console.log('─────────────────────────────────');
    console.log(`AdminUser records with 'lead_access_manager': ${leadAccessManagerUsers}`);
    console.log(`AdminInvite records with 'lead_access_manager': ${leadAccessManagerInvites}`);
    console.log('─────────────────────────────────\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run migration
migrate();
