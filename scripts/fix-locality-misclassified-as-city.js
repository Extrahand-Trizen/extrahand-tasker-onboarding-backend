/**
 * Fix leads where a Hyderabad locality was incorrectly saved as city.
 * Sets city -> Hyderabad, locality -> <locality name> (address / local area unchanged).
 *
 * Usage (from extrahand-tasker-onboarding-backend):
 *   node scripts/fix-locality-misclassified-as-city.js --locality=Badangpet
 *   node scripts/fix-locality-misclassified-as-city.js --locality=Badangpet --apply
 *   node scripts/fix-locality-misclassified-as-city.js --locality=Adibatla --apply
 *   node scripts/fix-locality-misclassified-as-city.js --locality=Badangpet --verify-only
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

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERIFY_ONLY = args.includes('--verify-only');
const DRY_RUN = !APPLY && !VERIFY_ONLY;

function getArg(name) {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : '';
}

const wrongCityRaw = getArg('locality') || getArg('wrong-city');
if (!wrongCityRaw && !VERIFY_ONLY) {
  console.error('Missing required flag: --locality=Badangpet (or --wrong-city=Badangpet)');
  process.exit(1);
}

/** Title-case locality for stored value, e.g. badangpet -> Badangpet */
function toDisplayLocality(value) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

const wrongCityPattern = wrongCityRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TARGET_LOCALITY = toDisplayLocality(wrongCityRaw);

const MATCH_FILTER = wrongCityRaw
  ? { city: { $regex: new RegExp(`^${wrongCityPattern}$`, 'i') } }
  : null;

function maskUri(uri) {
  return uri.replace(/\/\/[^:]*:[^@]*@/, '//***@');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function slug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
  const filePath = path.join(
    backupDir,
    `${slug(wrongCityRaw)}-city-fix-${timestamp()}.json`,
  );
  const payload = {
    createdAt: new Date().toISOString(),
    wrongCity: wrongCityRaw,
    targetCity: TARGET_CITY,
    targetLocality: TARGET_LOCALITY,
    matchFilter: MATCH_FILTER,
    count: docs.length,
    documents: docs,
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

async function verify(leads) {
  const remaining = await leads.countDocuments(MATCH_FILTER);
  const localityPattern = TARGET_LOCALITY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const updated = await leads
    .find(
      {
        city: { $regex: /^hyderabad$/i },
        locality: { $regex: new RegExp(`^${localityPattern}$`, 'i') },
      },
      {
        projection: { leadId: 1, name: 1, city: 1, locality: 1, state: 1, address: 1 },
      },
    )
    .limit(20)
    .toArray();

  console.log('\n--- Verification ---');
  console.log(`Remaining leads with city=${wrongCityRaw}: ${remaining}`);
  console.log(
    `Sample corrected (city=${TARGET_CITY}, locality=${TARGET_LOCALITY}): ${updated.length} shown`,
  );
  updated.forEach((doc) => {
    console.log(
      `  ${doc.leadId} | city=${doc.city} | locality=${doc.locality || '—'} | address=${doc.address || '—'}`,
    );
  });

  if (remaining > 0) {
    const bad = await leads
      .find(MATCH_FILTER, { projection: { leadId: 1, city: 1 } })
      .limit(10)
      .toArray();
    console.log('\nStill incorrect:');
    bad.forEach((d) => console.log(`  ${d.leadId} city="${d.city}"`));
    return false;
  }

  return true;
}

async function main() {
  console.log(
    `Fix city "${wrongCityRaw}" -> city ${TARGET_CITY}, locality ${TARGET_LOCALITY}\n`,
  );
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
    console.log(`\nFound ${affected.length} lead(s) with city matching "${wrongCityRaw}".\n`);

    if (affected.length === 0) {
      console.log('Nothing to update.');
      await verify(leads);
      return;
    }

    affected.forEach((doc) => {
      console.log(
        `  ${doc.leadId} | name=${doc.name} | city="${doc.city}" | locality="${doc.locality || ''}" | address="${doc.address || ''}"`,
      );
    });

    const backupPath = await writeBackup(affected);
    console.log(`\nBackup saved: ${backupPath}`);

    if (DRY_RUN) {
      console.log('\nDry-run only. Re-run with --apply to update city and locality.');
      console.log('address (Local Area) will NOT be modified.');
      return;
    }

    const result = await leads.updateMany(MATCH_FILTER, {
      $set: {
        city: TARGET_CITY,
        locality: TARGET_LOCALITY,
      },
    });

    console.log(`\nUpdate result: matched=${result.matchedCount} modified=${result.modifiedCount}`);
    console.log('Fields updated: city, locality only (address unchanged).');

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
