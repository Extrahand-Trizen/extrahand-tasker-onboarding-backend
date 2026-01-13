/**
 * Migration Script: Rename 'operations' role to 'onboarder'
 * 
 * Purpose:
 * - Update all AdminUser records with role 'operations' to 'onboarder'
 * - Update all AdminInvite records with role 'operations' to 'onboarder'
 * 
 * This migration is required after renaming the 'operations' role to 'onboarder'
 * in the codebase to prevent MongoDB validation errors.
 * 
 * Run this AFTER updating the code but BEFORE deploying to production
 * 
 * Usage:
 *   cd extrahand-admin-service
 *   node scripts/migrate-operations-to-onboarder.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Get MongoDB connection from environment
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/extrahand';
const MONGO_DB = process.env.MONGO_DB || 'extrahand';

async function migrate() {
  try {
    console.log('🔄 Starting migration: Rename operations role to onboarder\n');
    console.log('📊 Connecting to MongoDB:', MONGODB_URI.replace(/\/\/.*@/, '//***@'));
    console.log('📊 Database:', MONGO_DB);
    
    await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
    console.log('✅ Connected to MongoDB\n');

    // Get collections
    const db = mongoose.connection.db;
    const adminUsersCollection = db.collection('adminusers');
    const adminInvitesCollection = db.collection('admininvites');

    // ============================================================
    // Step 1: Migrate AdminUser records
    // ============================================================
    console.log('📋 Step 1: Migrating AdminUser records...\n');
    
    const usersWithOperations = await adminUsersCollection.find({ role: 'operations' }).toArray();
    console.log(`   Found ${usersWithOperations.length} AdminUser records with 'operations' role\n`);

    let userUpdateResult = { modifiedCount: 0 };
    if (usersWithOperations.length > 0) {
      console.log('   Users to be updated:');
      usersWithOperations.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.email || user.userId || user._id} (${user.name || 'No name'})`);
      });
      console.log('');

      userUpdateResult = await adminUsersCollection.updateMany(
        { role: 'operations' },
        { $set: { role: 'onboarder', updatedAt: new Date() } }
      );

      console.log(`   ✅ Updated ${userUpdateResult.modifiedCount} AdminUser records\n`);
    } else {
      console.log('   ✅ No AdminUser records with "operations" role found\n');
    }

    // ============================================================
    // Step 2: Migrate AdminInvite records
    // ============================================================
    console.log('📋 Step 2: Migrating AdminInvite records...\n');
    
    const invitesWithOperations = await adminInvitesCollection.find({ role: 'operations' }).toArray();
    console.log(`   Found ${invitesWithOperations.length} AdminInvite records with 'operations' role\n`);

    let inviteUpdateResult = { modifiedCount: 0 };
    if (invitesWithOperations.length > 0) {
      console.log('   Invites to be updated:');
      invitesWithOperations.forEach((invite, index) => {
        console.log(`   ${index + 1}. ${invite.email} (Status: ${invite.status || 'unknown'})`);
      });
      console.log('');

      inviteUpdateResult = await adminInvitesCollection.updateMany(
        { role: 'operations' },
        { $set: { role: 'onboarder', updatedAt: new Date() } }
      );

      console.log(`   ✅ Updated ${inviteUpdateResult.modifiedCount} AdminInvite records\n`);
    } else {
      console.log('   ✅ No AdminInvite records with "operations" role found\n');
    }

    // ============================================================
    // Step 3: Verification
    // ============================================================
    console.log('📋 Step 3: Verifying migration...\n');
    
    const remainingUsers = await adminUsersCollection.countDocuments({ role: 'operations' });
    const remainingInvites = await adminInvitesCollection.countDocuments({ role: 'operations' });

    if (remainingUsers === 0 && remainingInvites === 0) {
      console.log('   ✅ Verification passed! No records with "operations" role remain\n');
    } else {
      console.log(`   ⚠️  Warning: Found ${remainingUsers} AdminUser and ${remainingInvites} AdminInvite records still with "operations" role`);
      console.log('   This might indicate a connection issue or permission problem.\n');
    }

    // ============================================================
    // Summary
    // ============================================================
    console.log('📊 Migration Summary:');
    console.log('─────────────────────────────────────────────────');
    console.log(`   AdminUser records updated:    ${userUpdateResult.modifiedCount || 0}`);
    console.log(`   AdminInvite records updated:  ${inviteUpdateResult.modifiedCount || 0}`);
    console.log(`   Remaining "operations" users: ${remainingUsers}`);
    console.log(`   Remaining "operations" invites: ${remainingInvites}`);
    console.log('─────────────────────────────────────────────────\n');

    if (remainingUsers === 0 && remainingInvites === 0) {
      console.log('✅ Migration completed successfully!\n');
      console.log('🎉 All "operations" roles have been renamed to "onboarder"\n');
    } else {
      console.log('⚠️  Migration completed with warnings.\n');
      console.log('   Please review the remaining records manually.\n');
    }

    await mongoose.disconnect();
    console.log('📊 Disconnected from MongoDB\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrate().then(() => {
    console.log('🎉 All done!');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = migrate;
