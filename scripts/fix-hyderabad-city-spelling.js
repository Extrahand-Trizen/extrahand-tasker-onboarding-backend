/**
 * Normalize misspelled / wrong-cased Hyderabad values in the city field only.
 *
 * Usage (from extrahand-tasker-onboarding-backend):
 *   node scripts/fix-hyderabad-city-spelling.js
 *   node scripts/fix-hyderabad-city-spelling.js --apply
 *   node scripts/fix-hyderabad-city-spelling.js --verify-only
 *
 * Requires MONGODB_URI and MONGO_DB in .env
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/extrahand';
const MONGO_DB = process.env.MONGO_DB || 'extrahand';

const TARGET_CITY = 'Hyderabad';

/** Known wrong spellings / casing (exact match on city, case-insensitive). */
const WRONG_CITY_VALUES = [
  'HYD',
  'HYDERABAD',
  'HYDERBAD',
  'HYDRABAD',
  'HYDRABADA',
  'HYDREABAD',
  'HYEDRABAD',
];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERIFY_ONLY = args.includes('--verify-only');
const DRY_RUN = !APPLY && !VERIFY_ONLY;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const wrongCityRegex = new RegExp(
  `^(${WRONG_CITY_VALUES.map(escapeRegex).join('|')})$`,
  'i',
);

const MATCH_FILTER = {
  $and: [{ city: { $regex: wrongCityRegex } }, { city: { $ne: TARGET_CITY } }],
};

function maskUri(uri) {
  return uri.replace(/\/\/[^:]*:[^@]*@/, '//***@');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function findAffected(leads) {
  return leads
    .find(MATCH_FILTER, {
      projection: {
        leadId: 1,
        name: 1,
        city: 1,
        locality: 1,
        state: 1,
        address: 1,
      },
    })
    .toArray();
}

async function writeBackup(docs) {
  const backupDir = path.join(__dirname, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const filePath = path.join(backupDir, `hyderabad-city-spelling-${timestamp()}.json`);
  const payload = {
    createdAt: new Date().toISOString(),
    targetCity: TARGET_CITY,
    wrongCityValues: WRONG_CITY_VALUES,
    matchFilter: MATCH_FILTER,
    count: docs.length,
    documents: docs,
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

async function verify(leads) {
  const remaining = await leads.countDocuments(MATCH_FILTER);
  const sampleWrong = await leads
    .find(MATCH_FILTER, { projection: { leadId: 1, city: 1 } })
    .limit(20)
    .toArray();

  console.log('\n--- Verification ---');
  console.log(`Remaining leads with misspelled / wrong-cased city: ${remaining}`);

  if (remaining > 0) {
    console.log('\nStill incorrect (sample):');
    sampleWrong.forEach((d) => console.log(`  ${d.leadId} city="${d.city}"`));
    return false;
  }

  const correctedCount = await leads.countDocuments({ city: TARGET_CITY });
  console.log(`Leads with city="${TARGET_CITY}": ${correctedCount}`);
  return true;
}

async function main() {
  console.log(`Fix Hyderabad city spelling -> "${TARGET_CITY}" (city field only)\n`);
  console.log('Matches:', WRONG_CITY_VALUES.join(', '));
  console.log('MongoDB:', maskUri(MONGODB_URI));
  console.log('Database:', MONGO_DB);
  console.log('Mode:', VERIFY_ONLY ? 'verify-only' : APPLY ? 'APPLY' : 'DRY-RUN\n');

  await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
  const leads = mongoose.connection.db.collection('leads');

  try {
    if (VERIFY_ONLY) {
      const ok = await verify(leads);
      process.exit(ok ? 0 : 1);
    }

    const affected = await findAffected(leads);
    console.log(`\nFound ${affected.length} lead(s) to update.\n`);

    if (affected.length === 0) {
      console.log('Nothing to update.');
      await verify(leads);
      return;
    }

    const byCity = {};
    affected.forEach((doc) => {
      const key = doc.city || '(empty)';
      byCity[key] = (byCity[key] || 0) + 1;
    });
    console.log('Breakdown by current city value:');
    Object.entries(byCity)
      .sort((a, b) => b[1] - a[1])
      .forEach(([city, count]) => console.log(`  ${count}x  "${city}"`));

    console.log('\nSample leads:');
    affected.slice(0, 15).forEach((doc) => {
      console.log(
        `  ${doc.leadId} | city="${doc.city}" | locality="${doc.locality || ''}"`,
      );
    });
    if (affected.length > 15) {
      console.log(`  ... and ${affected.length - 15} more`);
    }

    const backupPath = await writeBackup(affected);
    console.log(`\nBackup saved: ${backupPath}`);

    if (DRY_RUN) {
      console.log('\nDry-run only. Re-run with --apply to set city to Hyderabad.');
      console.log('Only the city field will be updated (locality, address, state unchanged).');
      return;
    }

    const result = await leads.updateMany(MATCH_FILTER, {
      $set: { city: TARGET_CITY },
    });

    console.log(`\nUpdate result: matched=${result.matchedCount} modified=${result.modifiedCount}`);

    const ok = await verify(leads);
    if (!ok) {
      process.exit(1);
    }
    console.log('\nDone.');
  } catch (err) {
    console.error('Failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
