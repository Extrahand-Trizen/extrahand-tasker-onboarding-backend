require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGO_DB || 'extrahand';

const emailArg = process.argv.find((arg) => arg.startsWith('--email='));
const TARGET_EMAIL = emailArg
  ? emailArg.split('=').slice(1).join('=').trim().toLowerCase()
  : '';

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required.');
  process.exit(1);
}

if (!TARGET_EMAIL) {
  console.error('❌ Usage: node scripts/count-registrations-by-email.js --email=user@example.com');
  process.exit(1);
}

function buildIdentitySet(adminUser, email) {
  const ids = new Set();
  const add = (value) => {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) return;
    ids.add(v);
    ids.add(v.toLowerCase());
  };

  add(adminUser?.userId);
  add(adminUser?.uid);
  add(adminUser?.email);
  add(email);
  return Array.from(ids);
}

function buildPerformanceIdentitySet(adminUser) {
  return [adminUser?.userId, adminUser?.uid].filter(
    (v) => typeof v === 'string' && v.trim().length > 0,
  );
}

async function run() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
    const db = mongoose.connection.db;
    const adminUsersCol = db.collection('adminusers');
    const leadsCol = db.collection('leads');

    const adminUser = await adminUsersCol.findOne({
      email: { $regex: new RegExp(`^${TARGET_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (!adminUser) {
      console.error(`❌ No admin user found for email: ${TARGET_EMAIL}`);
      process.exit(1);
    }

    const identityIds = buildIdentitySet(adminUser, TARGET_EMAIL);
    const performanceIdentityIds = buildPerformanceIdentitySet(adminUser);

    const registeredPredicate = {
      $or: [
        { 'conversionData.platformUid': { $exists: true, $nin: [null, ''] } },
        { 'activationData.firebaseUid': { $exists: true, $nin: [null, ''] } },
        { accountStatus: { $in: ['invited', 'activated', 'suspended'] } },
      ],
    };
    const verifiedPredicate = {
      $or: [
        { 'conversionData.isAadhaarVerified': true },
        { 'verificationStatus.aadhaar.status': 'verified' },
      ],
    };
    const registeredOnlyPredicate = {
      ...registeredPredicate,
      $nor: [verifiedPredicate],
    };

    const [ownedRegistered, addedRegistered, performanceRegistered, performanceRegisteredIncludingVerified] =
      await Promise.all([
      leadsCol.countDocuments({
        ownerBy: { $in: identityIds },
        ...registeredPredicate,
      }),
      leadsCol.countDocuments({
        addedBy: { $in: identityIds },
        ...registeredPredicate,
      }),
      leadsCol.countDocuments({
        ownerBy: { $in: performanceIdentityIds },
        ...registeredOnlyPredicate,
      }),
      leadsCol.countDocuments({
        ownerBy: { $in: performanceIdentityIds },
        ...registeredPredicate,
      }),
    ]);

    console.log('\n--- Registration count by user email ---');
    console.log(`Email:            ${TARGET_EMAIL}`);
    console.log(`UserId:           ${adminUser.userId || 'N/A'}`);
    console.log(`Uid:              ${adminUser.uid || 'N/A'}`);
    console.log(`Role:             ${adminUser.role || 'N/A'}`);
    console.log(`Registered(ownerBy): ${ownedRegistered}`);
    console.log(`Registered(addedBy): ${addedRegistered}`);
    console.log(`Performance Registered (ownerBy, not verified): ${performanceRegistered}`);
    console.log(
      `Performance Registered+Verified (ownerBy): ${performanceRegisteredIncludingVerified}`,
    );
    console.log('\n✅ Done.\n');
  } catch (err) {
    console.error('❌ Failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
