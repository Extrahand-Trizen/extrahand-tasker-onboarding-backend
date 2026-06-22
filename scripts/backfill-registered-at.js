/**
 * Backfill registeredAt and registeredVerifiedAt from lastCheckedAt
 * for existing leads that are registered/verified but missing these date fields.
 *
 * Run: node scripts/backfill-registered-at.js
 */
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI or MONGODB_URI env var required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const coll = db.collection('leads');

  // 1. Backfill registeredAt for leads that are registered (have platformUid)
  //    but don't have registeredAt set.
  const registeredResult = await coll.updateMany(
    {
      'conversionData.platformUid': { $exists: true, $nin: [null, ''] },
      'conversionData.registeredAt': { $exists: false },
      'conversionData.lastCheckedAt': { $exists: true },
    },
    [
      {
        $set: {
          'conversionData.registeredAt': '$conversionData.lastCheckedAt',
        },
      },
    ]
  );
  console.log(`Backfilled registeredAt for ${registeredResult.modifiedCount} leads`);

  // 2. Backfill registeredVerifiedAt for leads that are registered AND Aadhaar-verified
  //    but don't have registeredVerifiedAt set.
  const verifiedResult = await coll.updateMany(
    {
      'conversionData.platformUid': { $exists: true, $nin: [null, ''] },
      'conversionData.isAadhaarVerified': true,
      'conversionData.registeredVerifiedAt': { $exists: false },
      'conversionData.lastCheckedAt': { $exists: true },
    },
    [
      {
        $set: {
          'conversionData.registeredVerifiedAt': '$conversionData.lastCheckedAt',
        },
      },
    ]
  );
  console.log(`Backfilled registeredVerifiedAt for ${verifiedResult.modifiedCount} leads`);

  await mongoose.disconnect();
  console.log('Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
