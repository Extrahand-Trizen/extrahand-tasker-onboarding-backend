/**
 * Quick admin creation - no prompts
 * Usage: node scripts/quick-create-admin.js EMAIL PASSWORD NAME [ROLE]
 * Example: node scripts/quick-create-admin.js admin@trizenventures.com MyPass123 "Admin User" admin
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const [,, email, password, name, role = 'admin'] = process.argv;

if (!email || !password || !name) {
  console.error('Usage: node scripts/quick-create-admin.js EMAIL PASSWORD NAME [ROLE]');
  console.error('Example: node scripts/quick-create-admin.js admin@trizenventures.com MyPass123 "Admin User" admin');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;

const adminUserSchema = new mongoose.Schema({
  userId: String,
  email: String,
  passwordHash: String,
  name: String,
  role: String,
  team: String,
  department: String,
  status: String,
  joinedVia: String,
  loginCount: Number,
  mfaEnabled: Boolean,
  refreshTokens: Array,
}, { timestamps: true });

const AdminUser = mongoose.model('AdminUser', adminUserSchema, 'adminusers');

(async () => {
  try {
    console.log('🚀 Quick Admin Creation\n');
    console.log('📦 Connecting to MongoDB...');
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Check if user exists
    const existingUser = await AdminUser.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.error(`❌ User with email ${email} already exists!`);
      await mongoose.disconnect();
      process.exit(1);
    }
    
    console.log('🔐 Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);
    
    const userId = `ADM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    console.log('👤 Creating admin user...');
    const adminUser =     await AdminUser.create({
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
    });
    
    console.log('\n✅ Admin user created successfully!\n');
    console.log('📋 User Details:');
    console.log('─────────────────────────────────');
    console.log(`User ID:  ${adminUser.userId}`);
    console.log(`Email:    ${adminUser.email}`);
    console.log(`Name:     ${adminUser.name}`);
    console.log(`Role:     ${adminUser.role}`);
    console.log('─────────────────────────────────\n');
    console.log('🎉 You can now login at: http://localhost:3000/login\n');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
})();
