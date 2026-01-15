/**
 * Combined script to:
 * 1. Migrate 'admin' role to 'lead_access_manager' in database
 * 2. Create leadsmanager@extrahand.in user with lead_access_manager role
 * 
 * Usage: node scripts/migrate-and-create-lead-manager.js
 * 
 * Make sure MONGODB_URI is set in your .env file or environment variables
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// MongoDB connection - must be set in environment
const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGO_DB || 'extrahand';

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required!');
  console.error('   Please set MONGODB_URI in your .env file or environment variables.');
  console.error('   Example: MONGODB_URI=mongodb://localhost:27017/extrahand');
  process.exit(1);
}

// Admin User Schema (simplified) - matches the actual model
const adminUserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String },
  name: { type: String },
  role: { 
    type: String, 
    required: true,
    enum: ['lead_access_manager', 'onboarder', 'qualifier', 'support', 'trust']
  },
  team: { type: String },
  department: { type: String },
  status: { 
    type: String, 
    enum: ['active', 'suspended', 'inactive'], 
    default: 'active' 
  },
  joinedVia: { 
    type: String, 
    enum: ['invite', 'manual', 'legacy'],
    default: 'manual'
  },
  loginCount: { type: Number, default: 0 },
  mfaEnabled: { type: Boolean, default: false },
  refreshTokens: { type: Array, default: [] },
  uid: { type: String, unique: true, sparse: true }, // Sparse unique index
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { 
  collection: 'adminusers',
  timestamps: true 
});

// Admin Invite Schema (simplified)
const adminInviteSchema = new mongoose.Schema({
  inviteId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  role: { type: String, required: true },
  // ... other fields not needed for migration
}, { collection: 'admininvites' });

const AdminUser = mongoose.model('AdminUser', adminUserSchema);
const AdminInvite = mongoose.model('AdminInvite', adminInviteSchema);

async function migrateAndCreate() {
  try {
    console.log('🚀 Starting Migration and User Creation\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    console.log(`   URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
    console.log(`   Database: ${MONGO_DB}\n`);
    await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
    console.log('✅ Connected to MongoDB\n');

    // ============================================
    // STEP 1: MIGRATE ADMIN TO LEAD_ACCESS_MANAGER
    // ============================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log('STEP 1: Migrating admin role to lead_access_manager');
    console.log('═══════════════════════════════════════════════════════════\n');

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

    // Show migration summary
    const leadAccessManagerUsers = await AdminUser.countDocuments({ role: 'lead_access_manager' });
    const leadAccessManagerInvites = await AdminInvite.countDocuments({ role: 'lead_access_manager' });
    
    console.log('📊 Migration Summary:');
    console.log('─────────────────────────────────');
    console.log(`AdminUser records with 'lead_access_manager': ${leadAccessManagerUsers}`);
    console.log(`AdminInvite records with 'lead_access_manager': ${leadAccessManagerInvites}`);
    console.log('─────────────────────────────────\n');

    // ============================================
    // STEP 2: CREATE LEAD ACCESS MANAGER USER
    // ============================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log('STEP 2: Creating lead_access_manager user');
    console.log('═══════════════════════════════════════════════════════════\n');

    const email = 'leadsmanager@extrahand.in';
    const password = 'leadsmanager@123';
    const name = 'Lead Access Manager';
    const role = 'lead_access_manager';

    // Check if user already exists
    const existingUser = await AdminUser.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log(`⚠️  User with email ${email} already exists!`);
      console.log('📋 Existing User Details:');
      console.log('─────────────────────────────────');
      console.log(`User ID:    ${existingUser.userId}`);
      console.log(`Email:      ${existingUser.email}`);
      console.log(`Name:       ${existingUser.name || 'N/A'}`);
      console.log(`Role:       ${existingUser.role}`);
      console.log(`Status:     ${existingUser.status}`);
      console.log('─────────────────────────────────\n');
      
      let updated = false;
      
      // Check if role needs to be updated
      if (existingUser.role !== 'lead_access_manager') {
        console.log(`🔄 Updating role from '${existingUser.role}' to 'lead_access_manager'...`);
        existingUser.role = 'lead_access_manager';
        updated = true;
      }
      
      // Update password
      console.log('🔐 Updating password...');
      existingUser.passwordHash = await bcrypt.hash(password, 10);
      updated = true;
      
      if (updated) {
        await existingUser.save();
        console.log('✅ User updated successfully!\n');
      } else {
        console.log('✅ User already exists with correct configuration.\n');
      }
      
      // Show final user details
      console.log('📋 Final User Details:');
      console.log('─────────────────────────────────');
      console.log(`User ID:    ${existingUser.userId}`);
      console.log(`Email:      ${existingUser.email}`);
      console.log(`Name:       ${existingUser.name}`);
      console.log(`Role:       ${existingUser.role}`);
      console.log(`Status:     ${existingUser.status}`);
      console.log('─────────────────────────────────\n');
    } else {
      // Hash password
      console.log('🔐 Hashing password...');
      const passwordHash = await bcrypt.hash(password, 10);

      // Generate userId
      const userId = `ADM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      // Create user - don't set uid field at all (let it be undefined)
      // The sparse unique index on uid only indexes documents that have the field
      // By not setting uid, it won't be indexed and won't cause conflicts
      console.log('👤 Creating lead access manager user...');
      
      // Build user object without uid field
      const userData = {
        userId,
        email: email.toLowerCase(),
        passwordHash,
        name,
        role,
        status: 'active',
        joinedVia: 'manual',
        loginCount: 0,
        mfaEnabled: false,
        refreshTokens: [],
      };
      
      // Use insertOne directly to have more control
      const adminUser = await AdminUser.create(userData);

      console.log('\n✅ Lead Access Manager user created successfully!\n');
      console.log('📋 User Details:');
      console.log('─────────────────────────────────');
      console.log(`User ID:    ${adminUser.userId}`);
      console.log(`Email:      ${adminUser.email}`);
      console.log(`Name:       ${adminUser.name}`);
      console.log(`Role:       ${adminUser.role}`);
      console.log(`Status:     ${adminUser.status}`);
      console.log('─────────────────────────────────\n');
    }

    // Final summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ ALL OPERATIONS COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('🎉 You can now login with:');
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}\n`);

  } catch (error) {
    console.error('\n❌ Operation failed:', error.message);
    if (error.code === 11000) {
      console.error('   Duplicate key error - user may already exist');
    }
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run migration and user creation
migrateAndCreate();
