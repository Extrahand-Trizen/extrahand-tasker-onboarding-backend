/**
 * Fix leads where a full address was saved in the city field.
 * Moves city -> address (Local Area), sets city -> Hyderabad, locality -> <name>.
 *
 * Usage (from extrahand-tasker-onboarding-backend):
 *   node scripts/fix-full-address-in-city-field.js --locality=Bairamalguda
 *   node scripts/fix-full-address-in-city-field.js --locality=Bairamalguda --apply
 *   node scripts/fix-full-address-in-city-field.js --locality=Bairamalguda --verify-only
 *
 * Optional: only match when city is a long string (full address), not a single word:
 *   --min-city-length=20
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

const localityRaw = getArg('locality');
const minCityLength = parseInt(getArg('min-city-length') || '0', 10) || 0;

if (!localityRaw) {
  console.error('Missing required flag: --locality=Bairamalguda');
  process.exit(1);
}

function toDisplayLocality(value) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

const TARGET_LOCALITY = toDisplayLocality(localityRaw);
const localityPattern = localityRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** City field mentions this locality and is not already corrected. */
function buildMatchFilter() {
  const filter = {
    city: { $regex: new RegExp(localityPattern, 'i') },
    $nor: [
      {
        city: { $regex: /^hyderabad$/i },
        locality: { $regex: new RegExp(`^${localityPattern}$`, 'i') },
      },
    ],
  };

  if (minCityLength > 0) {
    filter.$expr = {
      $gte: [{ $strLenCP: { $trim: { input: { $ifNull: ['$city', ''] } } } }, minCityLength],
    };
  }

  return filter;
}

function maskUri(uri) {
  return uri.replace(/\/\/[^:]*:[^@]*@/, '//***@');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function slug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

async function findAffected(leads, matchFilter) {
  return leads
    .find(matchFilter, {
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

async function writeBackup(docs, matchFilter) {
  const backupDir = path.join(__dirname, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const filePath = path.join(
    backupDir,
    `${slug(localityRaw)}-full-address-in-city-${timestamp()}.json`,
  );
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        locality: localityRaw,
        targetCity: TARGET_CITY,
        targetLocality: TARGET_LOCALITY,
        minCityLength,
        matchFilter,
        count: docs.length,
        documents: docs,
      },
      null,
      2,
    ),
    'utf8',
  );
  return filePath;
}

async function verify(leads) {
  const wrongInCity = {
    city: { $regex: new RegExp(localityPattern, 'i') },
    $nor: [
      {
        city: { $regex: /^hyderabad$/i },
        locality: { $regex: new RegExp(`^${localityPattern}$`, 'i') },
      },
    ],
  };

  const remaining = await leads.countDocuments(wrongInCity);
  const corrected = await leads
    .find(
      {
        city: { $regex: /^hyderabad$/i },
        locality: { $regex: new RegExp(`^${localityPattern}$`, 'i') },
        address: { $regex: new RegExp(localityPattern, 'i') },
      },
      {
        projection: { leadId: 1, name: 1, city: 1, locality: 1, address: 1 },
      },
    )
    .limit(20)
    .toArray();

  console.log('\n--- Verification ---');
  console.log(`Leads still with "${localityRaw}" in city (not yet corrected): ${remaining}`);
  console.log(`Sample corrected records: ${corrected.length} shown`);
  corrected.forEach((doc) => {
    console.log(
      `  ${doc.leadId} | city=${doc.city} | locality=${doc.locality} | address=${(doc.address || '').slice(0, 80)}${(doc.address || '').length > 80 ? '…' : ''}`,
    );
  });

  if (remaining > 0) {
    const bad = await leads
      .find(wrongInCity, { projection: { leadId: 1, city: 1, address: 1 } })
      .limit(10)
      .toArray();
    console.log('\nStill need fix:');
    bad.forEach((d) =>
      console.log(`  ${d.leadId} city="${(d.city || '').slice(0, 100)}" address="${(d.address || '').slice(0, 60)}"`),
    );
    return false;
  }

  return true;
}

async function main() {
  const matchFilter = buildMatchFilter();

  console.log(`Move full address from city -> address; city=${TARGET_CITY}; locality=${TARGET_LOCALITY}\n`);
  console.log('MongoDB:', maskUri(MONGODB_URI));
  console.log('Database:', MONGO_DB);
  if (minCityLength > 0) {
    console.log(`Only city values with length >= ${minCityLength}`);
  }
  console.log('Mode:', VERIFY_ONLY ? 'verify-only' : APPLY ? 'APPLY' : 'DRY-RUN\n');

  await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
  const leads = mongoose.connection.db.collection('leads');

  try {
    if (VERIFY_ONLY) {
      const ok = await verify(leads);
      process.exit(ok ? 0 : 1);
    }

    const affected = await findAffected(leads, matchFilter);
    console.log(`\nFound ${affected.length} lead(s) to update.\n`);

    if (affected.length === 0) {
      console.log('Nothing to update.');
      await verify(leads);
      return;
    }

    affected.forEach((doc) => {
      const cityPreview = (doc.city || '').length > 100 ? `${doc.city.slice(0, 100)}…` : doc.city;
      console.log(
        `  ${doc.leadId} | name=${doc.name}\n` +
          `    city (will -> address): "${cityPreview}"\n` +
          `    current address: "${doc.address || ''}"\n` +
          `    -> city: ${TARGET_CITY}, locality: ${TARGET_LOCALITY}`,
      );
    });

    const backupPath = await writeBackup(affected, matchFilter);
    console.log(`\nBackup saved: ${backupPath}`);

    if (DRY_RUN) {
      console.log('\nDry-run only. Re-run with --apply to apply changes.');
      return;
    }

    const result = await leads.updateMany(matchFilter, [
      {
        $set: {
          address: '$city',
          city: TARGET_CITY,
          locality: TARGET_LOCALITY,
        },
      },
    ]);

    console.log(`\nUpdate result: matched=${result.matchedCount} modified=${result.modifiedCount}`);
    console.log('address <- previous city; city <- Hyderabad; locality <-', TARGET_LOCALITY);

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
