/**
 * Count registered leads where pickedBy = this user only (claimed leads).
 * Does NOT include leads only added or only touched in timeline (unlike Performance owner scope).
 *
 * Usage:
 *   node scripts/count-picked-registered-by-email.js --email=santhoshu@cognitbotz.com
 *   node scripts/count-picked-registered-by-email.js --email=santhoshu@cognitbotz.com --list
 *   node scripts/count-picked-registered-by-email.js --email=santhoshu@cognitbotz.com --json
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGO_DB || 'extrahand';
const JSON_OUT = process.argv.includes('--json');
const LIST_SAMPLES = process.argv.includes('--list');

const emailArg = process.argv.find((arg) => arg.startsWith('--email='));
const TARGET_EMAIL = emailArg
  ? emailArg.split('=').slice(1).join('=').trim().toLowerCase()
  : '';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is required.');
  process.exit(1);
}

if (!TARGET_EMAIL) {
  console.error('❌ Usage: node scripts/count-picked-registered-by-email.js --email=user@example.com');
  process.exit(1);
}

function pickedBySelector(identityIds) {
  if (identityIds.length === 1) return { pickedBy: identityIds[0] };
  return { pickedBy: { $in: identityIds } };
}

function buildRegisteredPredicate() {
  return {
    $or: [
      { 'conversionData.platformUid': { $exists: true, $nin: [null, ''] } },
      { 'activationData.firebaseUid': { $exists: true, $nin: [null, ''] } },
      { accountStatus: { $in: ['invited', 'activated', 'suspended'] } },
    ],
  };
}

function buildVerifiedPredicate() {
  return {
    $or: [
      { 'conversionData.isAadhaarVerified': true },
      { 'verificationStatus.aadhaar.status': 'verified' },
    ],
  };
}

function buildRegisteredOnlyPredicate() {
  return {
    ...buildRegisteredPredicate(),
    $nor: [buildVerifiedPredicate()],
  };
}

async function run() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
    const db = mongoose.connection.db;
    const adminUsersCol = db.collection('adminusers');
    const leadsCol = db.collection('leads');

    const adminUser = await adminUsersCol.findOne({
      email: {
        $regex: new RegExp(
          `^${TARGET_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          'i',
        ),
      },
    });

    if (!adminUser) {
      console.error(`❌ No admin user found for email: ${TARGET_EMAIL}`);
      process.exit(1);
    }

    const identityIds = [adminUser.userId, adminUser.uid].filter(
      (v) => typeof v === 'string' && v.trim().length > 0,
    );
    const pickedFilter = pickedBySelector(identityIds);
    const registeredAll = buildRegisteredPredicate();
    const registeredOnly = buildRegisteredOnlyPredicate();
    const verified = buildVerifiedPredicate();

    const basePicked = { ...pickedFilter };

    const [
      totalPicked,
      pickedRegisteredNotVerified,
      pickedRegisteredVerified,
      pickedRegisteredAny,
      pickedNotRegistered,
    ] = await Promise.all([
      leadsCol.countDocuments(basePicked),
      leadsCol.countDocuments({ $and: [basePicked, registeredOnly] }),
      leadsCol.countDocuments({ $and: [basePicked, registeredAll, verified] }),
      leadsCol.countDocuments({ $and: [basePicked, registeredAll] }),
      leadsCol.countDocuments({
        $and: [basePicked, { $nor: [registeredAll] }],
      }),
    ]);

    let samples = [];
    if (LIST_SAMPLES) {
      samples = await leadsCol
        .find({ $and: [basePicked, registeredOnly] })
        .project({
          leadId: 1,
          name: 1,
          phone: 1,
          status: 1,
          pickedBy: 1,
          pickedByName: 1,
          pickedAt: 1,
          accountStatus: 1,
          'conversionData.platformUid': 1,
        })
        .sort({ pickedAt: -1 })
        .limit(30)
        .toArray();
    }

    const result = {
      email: adminUser.email,
      name: adminUser.name || TARGET_EMAIL,
      userId: adminUser.userId,
      uid: adminUser.uid || null,
      scope: 'pickedBy only (claimed leads)',
      counts: {
        totalClaimed: totalPicked,
        registeredNotVerified: pickedRegisteredNotVerified,
        registeredAndVerified: pickedRegisteredVerified,
        registeredAny: pickedRegisteredAny,
        notRegistered: pickedNotRegistered,
      },
      samples: samples.map((l) => ({
        leadId: l.leadId,
        name: l.name,
        phone: l.phone || l.landline,
        status: l.status,
        pickedByName: l.pickedByName,
        pickedAt: l.pickedAt,
      })),
    };

    if (JSON_OUT) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n=== Registered leads (pickedBy / claimed only) ===\n');
      console.log(`Email:    ${result.email}`);
      console.log(`Name:     ${result.name}`);
      console.log(`UserId:   ${result.userId}`);
      console.log(`Scope:    ${result.scope}\n`);
      console.log('--- Counts ---');
      console.log(`Total claimed (pickedBy):     ${result.counts.totalClaimed}`);
      console.log(`Registered (not verified):    ${result.counts.registeredNotVerified}`);
      console.log(`Registered & verified:        ${result.counts.registeredAndVerified}`);
      console.log(`Registered (any):             ${result.counts.registeredAny}`);
      console.log(`Not registered (claimed):     ${result.counts.notRegistered}`);
      console.log(
        '\nNote: Performance "Registered" uses owner scope (picked + added + timeline).',
      );
      console.log('This script counts only leads where pickedBy = this user.\n');

      if (LIST_SAMPLES && samples.length) {
        console.log(`--- Sample registered+claimed (up to 30) ---`);
        for (const row of result.samples) {
          console.log(
            `  ${row.leadId} | ${row.name || '—'} | ${row.phone || '—'} | ${row.status} | picked ${row.pickedAt ? new Date(row.pickedAt).toLocaleString() : '—'}`,
          );
        }
        if (result.counts.registeredNotVerified > samples.length) {
          console.log(`  ... and ${result.counts.registeredNotVerified - samples.length} more`);
        }
      } else if (LIST_SAMPLES) {
        console.log('No registered+claimed leads found.');
      }

      console.log('✅ Done.\n');
    }
  } catch (err) {
    console.error('❌ Failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
