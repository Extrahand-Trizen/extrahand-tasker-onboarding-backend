/**
 * One-time migration:
 * Normalize lead ownership from legacy Firebase uid -> JWT userId.
 *
 * Why:
 * - Older leads may store `leads.addedBy = <firebase uid>`
 * - New auth uses `adminusers.userId`
 * - Qualifier-scoped views now support both, but this migration standardizes data.
 *
 * Usage:
 *   # Dry run (default)
 *   node scripts/migrate-qualifier-addedby-uid-to-userid.js
 *
 *   # Apply changes
 *   node scripts/migrate-qualifier-addedby-uid-to-userid.js --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGO_DB || 'extrahand';
const APPLY = process.argv.includes('--apply');

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required.');
  process.exit(1);
}

async function run() {
  try {
    console.log(`\n${APPLY ? '🚀 APPLY MODE' : '🧪 DRY RUN MODE'} - addedBy uid -> userId migration`);
    console.log(`📊 Database: ${MONGO_DB}`);
    console.log(`📊 URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}\n`);

    await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
    const db = mongoose.connection.db;
    const adminUsers = db.collection('adminusers');
    const leads = db.collection('leads');

    // Build uid -> userId map from active identifiers.
    const users = await adminUsers
      .find(
        {
          uid: { $exists: true, $ne: null, $ne: '' },
          userId: { $exists: true, $ne: null, $ne: '' },
        },
        { projection: { uid: 1, userId: 1, email: 1, role: 1 } }
      )
      .toArray();

    const uidToUserId = new Map();
    for (const user of users) {
      uidToUserId.set(user.uid, { userId: user.userId, email: user.email, role: user.role });
    }

    console.log(`Found ${uidToUserId.size} admin users with both uid + userId.`);

    let totalMatchedLeads = 0;
    let totalUpdatedLeads = 0;
    const perUser = [];

    for (const [uid, info] of uidToUserId.entries()) {
      if (uid === info.userId) continue;

      const matchFilter = { addedBy: uid };
      const matchCount = await leads.countDocuments(matchFilter);
      if (matchCount === 0) continue;

      totalMatchedLeads += matchCount;
      perUser.push({
        uid,
        userId: info.userId,
        email: info.email || 'unknown',
        role: info.role || 'unknown',
        matchedLeads: matchCount,
      });

      if (APPLY) {
        const result = await leads.updateMany(matchFilter, {
          $set: { addedBy: info.userId },
        });
        totalUpdatedLeads += result.modifiedCount || 0;
      }
    }

    if (perUser.length === 0) {
      console.log('✅ No leads found with legacy uid ownership. Nothing to migrate.');
    } else {
      console.log('\nImpacted mappings:');
      perUser
        .sort((a, b) => b.matchedLeads - a.matchedLeads)
        .forEach((row) => {
          console.log(
            `- ${row.email} (${row.role}) :: ${row.uid} -> ${row.userId} | leads: ${row.matchedLeads}`
          );
        });
      console.log(`\nTotal matched leads: ${totalMatchedLeads}`);
      if (APPLY) {
        console.log(`Total updated leads: ${totalUpdatedLeads}`);
      } else {
        console.log('Dry run only. Re-run with --apply to perform updates.');
      }
    }

    console.log('\n✅ Migration finished.');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

run();

