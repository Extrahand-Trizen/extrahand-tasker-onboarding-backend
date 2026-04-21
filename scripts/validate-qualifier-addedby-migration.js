/**
 * Validation script (read-only):
 * Checks whether lead ownership (`leads.addedBy`) is aligned with AdminUser userId values.
 *
 * What it reports:
 * - Total leads
 * - Leads owned by known userId
 * - Leads still owned by legacy uid (for users that have both uid + userId)
 * - Leads owned by unknown IDs (no matching adminusers.userId/uid)
 * - Per-user mismatch breakdown
 *
 * Usage:
 *   node scripts/validate-qualifier-addedby-migration.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGO_DB || 'extrahand';

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required.');
  process.exit(1);
}

async function validate() {
  try {
    console.log('\n🔎 Validating qualifier addedBy migration (read-only)');
    console.log(`📊 Database: ${MONGO_DB}`);
    console.log(`📊 URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}\n`);

    await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
    const db = mongoose.connection.db;
    const adminUsers = db.collection('adminusers');
    const leads = db.collection('leads');

    const users = await adminUsers
      .find(
        {},
        { projection: { userId: 1, uid: 1, email: 1, role: 1, status: 1 } }
      )
      .toArray();

    const knownUserIds = new Set();
    const knownUids = new Set();
    const uidToUser = new Map();

    for (const user of users) {
      if (user.userId) knownUserIds.add(user.userId);
      if (user.uid) knownUids.add(user.uid);
      if (user.uid && user.userId) {
        uidToUser.set(user.uid, {
          userId: user.userId,
          email: user.email || 'unknown',
          role: user.role || 'unknown',
          status: user.status || 'unknown',
        });
      }
    }

    const totalLeads = await leads.countDocuments({});
    const leadsByKnownUserId = await leads.countDocuments({
      addedBy: { $in: Array.from(knownUserIds) },
    });
    const leadsByKnownUid = await leads.countDocuments({
      addedBy: { $in: Array.from(knownUids) },
    });

    // IDs present in leads.addedBy that are not known as either userId or uid
    const unknownAddedBy = await leads
      .aggregate([
        { $group: { _id: '$addedBy', count: { $sum: 1 } } },
        {
          $match: {
            _id: {
              $nin: [...Array.from(knownUserIds), ...Array.from(knownUids)],
            },
          },
        },
        { $sort: { count: -1 } },
      ])
      .toArray();

    let legacyUidLeads = 0;
    const mismatchRows = [];

    for (const [uid, info] of uidToUser.entries()) {
      if (uid === info.userId) continue;
      const count = await leads.countDocuments({ addedBy: uid });
      if (count > 0) {
        legacyUidLeads += count;
        mismatchRows.push({
          email: info.email,
          role: info.role,
          status: info.status,
          uid,
          userId: info.userId,
          leads: count,
        });
      }
    }

    console.log('Summary');
    console.log('-------');
    console.log(`Total leads: ${totalLeads}`);
    console.log(`Leads with known userId owner: ${leadsByKnownUserId}`);
    console.log(`Leads with known uid owner: ${leadsByKnownUid}`);
    console.log(`Leads still on legacy uid (needs migration): ${legacyUidLeads}`);
    console.log(`Leads with unknown owner IDs: ${unknownAddedBy.length > 0 ? unknownAddedBy.reduce((a, b) => a + b.count, 0) : 0}`);

    if (mismatchRows.length > 0) {
      console.log('\nPer-user legacy uid mismatches');
      console.log('-----------------------------');
      mismatchRows
        .sort((a, b) => b.leads - a.leads)
        .forEach((row) => {
          console.log(
            `- ${row.email} (${row.role}, ${row.status}) :: ${row.uid} -> ${row.userId} | leads=${row.leads}`
          );
        });
    }

    if (unknownAddedBy.length > 0) {
      console.log('\nUnknown addedBy IDs (no matching userId/uid)');
      console.log('-------------------------------------------');
      unknownAddedBy.slice(0, 25).forEach((row) => {
        console.log(`- ${row._id || '<empty>'}: ${row.count}`);
      });
      if (unknownAddedBy.length > 25) {
        console.log(`... and ${unknownAddedBy.length - 25} more`);
      }
    }

    console.log('\nResult');
    console.log('------');
    if (legacyUidLeads === 0 && unknownAddedBy.length === 0) {
      console.log('✅ PASS: No legacy uid ownership or unknown ownership IDs found.');
    } else if (legacyUidLeads > 0 && unknownAddedBy.length === 0) {
      console.log('⚠️ PARTIAL: Legacy uid ownership remains. Run migration with --apply.');
    } else {
      console.log('❌ ATTENTION: Unknown owner IDs detected. Investigate before/after migration.');
    }
  } catch (error) {
    console.error('\n❌ Validation failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

validate();

