/**
 * Script to create an admin user
 * Usage: node scripts/create-admin.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const readline = require('readline');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/extrahand';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify question
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Admin User Schema (simplified)
const adminUserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String },
  name: { type: String },
  role: { type: String, enum: ['admin', 'operations', 'marketing', 'support', 'trust'] },
  team: { type: String },
  department: { type: String },
  status: { type: String, enum: ['active', 'suspended', 'inactive'], default: 'active' },
  joinedVia: { type: String },
  loginCount: { type: Number, default: 0 },
  mfaEnabled: { type: Boolean, default: false },
  refreshTokens: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const AdminUser = mongoose.model('AdminUser', adminUserSchema, 'adminusers');

async function createAdmin() {
  try {
    console.log('🚀 Admin User Creation Script\n');

    // Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get user input
    const email = await question('Enter email: ');
    const password = await question('Enter password (min 8 chars): ');
    const name = await question('Enter name: ');
    const role = await question('Enter role (admin/operations/marketing/support/trust) [admin]: ') || 'admin';
    const team = await question('Enter team (optional): ');
    const department = await question('Enter department (optional): ');

    // Validate
    if (!email || !password || !name) {
      console.error('❌ Email, password, and name are required!');
      process.exit(1);
    }

    if (password.length < 8) {
      console.error('❌ Password must be at least 8 characters!');
      process.exit(1);
    }

    const validRoles = ['admin', 'operations', 'marketing', 'support', 'trust'];
    if (!validRoles.includes(role)) {
      console.error('❌ Invalid role! Must be one of:', validRoles.join(', '));
      process.exit(1);
    }

    // Check if user exists
    const existingUser = await AdminUser.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.error(`❌ User with email ${email} already exists!`);
      process.exit(1);
    }

    // Hash password
    console.log('\n🔐 Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate userId
    const userId = `ADM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Create user
    console.log('👤 Creating admin user...');
    const adminUser = await AdminUser.create({
      userId,
      email: email.toLowerCase(),
      passwordHash,
      name,
      role,
      team: team || undefined,
      department: department || undefined,
      status: 'active',
      joinedVia: 'manual',
      loginCount: 0,
      mfaEnabled: false,
      refreshTokens: [],
    });

    console.log('\n✅ Admin user created successfully!\n');
    console.log('📋 User Details:');
    console.log('─────────────────────────────────');
    console.log(`User ID:    ${adminUser.userId}`);
    console.log(`Email:      ${adminUser.email}`);
    console.log(`Name:       ${adminUser.name}`);
    console.log(`Role:       ${adminUser.role}`);
    if (adminUser.team) console.log(`Team:       ${adminUser.team}`);
    if (adminUser.department) console.log(`Department: ${adminUser.department}`);
    console.log('─────────────────────────────────\n');
    console.log('🎉 You can now login with these credentials!\n');

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.disconnect();
    process.exit(0);
  }
}

// Run
createAdmin();
