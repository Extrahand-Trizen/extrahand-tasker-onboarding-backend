/**
 * Backfill lead claims from the last Timeline (statusHistory) entry.
 *
 * For unclaimed leads only: set pickedBy from whoever last *changed* the stage.
 * Adding/creating a lead does NOT count — only a later status change in
 * statusHistory (status different from the previous row). Single-row timelines
 * (create-only) are never claimed.
 *
 * Usage:
 *   cd extrahand-tasker-onboarding-backend
 *
 *   # All users (default) — dry run
 *   node scripts/backfill-picked-by-last-timeline-user.js
 *   node scripts/backfill-picked-by-last-timeline-user.js --all-users
 *
 *   # Single user by email
 *   node scripts/backfill-picked-by-last-timeline-user.js --email=allamgowrisankar001@gmail.com
 *
 *   # Apply updates
 *   node scripts/backfill-picked-by-last-timeline-user.js --all-users --apply
 *
 *   # Only one lead (helper id)
 *   node scripts/backfill-picked-by-last-timeline-user.js --lead-id=LEAD-123 --all-users
 *   node scripts/backfill-picked-by-last-timeline-user.js --lead-id=LEAD-123 --all-users --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGO_DB || 'extrahand';
const APPLY = process.argv.includes('--apply');
const ALL_USERS =
  process.argv.includes('--all-users') ||
  !process.argv.some((arg) => arg.startsWith('--email='));

const leadIdArg = process.argv.find((arg) => arg.startsWith('--lead-id='));
const TARGET_LEAD_ID = leadIdArg ? leadIdArg.split('=').slice(1).join('=').trim() : null;

const emailArg = process.argv.find((arg) => arg.startsWith('--email='));
const TARGET_EMAIL = emailArg
  ? emailArg.split('=').slice(1).join('=').trim().toLowerCase()
  : null;

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required.');
  process.exit(1);
}

if (!ALL_USERS && !TARGET_EMAIL) {
  console.error('❌ Provide --all-users or --email=user@example.com');
  process.exit(1);
}

const UNCLAIMED_FILTER = {
  $or: [{ pickedBy: null }, { pickedBy: { $exists: false } }, { pickedBy: '' }],
};

const LEAD_ID_FILTER = TARGET_LEAD_ID ? { leadId: TARGET_LEAD_ID } : {};

// Claims are used for "My Claims" (onboarder) and "All Leads" manager workflows.
const CLAIMABLE_ROLES = new Set(['qualifier', 'onboarder', 'lead_access_manager']);

/**
 * Last timeline row that is a real stage change (not lead creation).
 * Creation always writes the first statusHistory row; we only claim when
 * a later row has a different status than the row before it.
 */
function getLastStageMoveEntry(lead) {
  const history = Array.isArray(lead.statusHistory) ? lead.statusHistory : [];
  if (history.length < 2) return null;

  const chronological = [...history].sort((a, b) => {
    const ta = a?.changedAt ? new Date(a.changedAt).getTime() : 0;
    const tb = b?.changedAt ? new Date(b.changedAt).getTime() : 0;
    return ta - tb;
  });

  for (let i = chronological.length - 1; i >= 1; i -= 1) {
    const entry = chronological[i];
    const previous = chronological[i - 1];
    if (!entry?.status || !entry.changedBy) continue;
    if (entry.status !== previous?.status) {
      return entry;
    }
  }

  return null;
}

function displayNameFor(adminUser, lastEntry) {
  const fromHistory =
    typeof lastEntry?.changedByName === 'string' ? lastEntry.changedByName.trim() : '';
  if (fromHistory) return fromHistory;

  return (
    adminUser.name ||
    [adminUser.firstName, adminUser.lastName].filter(Boolean).join(' ').trim() ||
    adminUser.email ||
    adminUser.userId
  );
}

function buildAdminLookup(adminUsersList) {
  const lookup = new Map();

  const register = (key, user) => {
    const k = typeof key === 'string' ? key.trim() : '';
    if (!k || lookup.has(k)) return;
    lookup.set(k, user);
    if (k.includes('@')) {
      lookup.set(k.toLowerCase(), user);
    }
  };

  for (const user of adminUsersList) {
    register(user.userId, user);
    register(user.uid, user);
    register(user.email, user);
  }

  return lookup;
}

function resolveAdminForChangedBy(changedBy, lookup) {
  const raw = typeof changedBy === 'string' ? changedBy.trim() : '';
  if (!raw) return null;
  return lookup.get(raw) || lookup.get(raw.toLowerCase()) || null;
}

function buildIdentitySetForSingleUser(adminUser, targetEmail) {
  const ids = new Set();
  const add = (value) => {
    const v = typeof value === 'string' ? value.trim() : '';
    if (v) ids.add(v);
  };
  add(adminUser.userId);
  add(adminUser.uid);
  add(adminUser.email);
  add(targetEmail);
  return ids;
}

function matchesSingleUser(changedBy, identitySet, targetEmail) {
  const raw = typeof changedBy === 'string' ? changedBy.trim() : '';
  if (!raw) return false;
  if (identitySet.has(raw)) return true;
  if (targetEmail && raw.toLowerCase() === targetEmail) return true;
  return false;
}

async function run() {
  try {
    console.log(`\n${APPLY ? '🚀 APPLY MODE' : '🧪 DRY RUN MODE'} — backfill pickedBy from last Timeline entry`);
    console.log(
      ALL_USERS
        ? '👥 Scope: ALL admin users (last timeline mover claims the lead)'
        : `📧 Scope: single user — ${TARGET_EMAIL}`,
    );
    if (TARGET_LEAD_ID) {
      console.log(`🎯 Lead filter: ${TARGET_LEAD_ID}`);
    }
    console.log(`📊 Database: ${MONGO_DB}`);
    console.log(`📊 URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}\n`);

    await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
    const db = mongoose.connection.db;
    const adminUsersCol = db.collection('adminusers');
    const leadActivities = db.collection('leadactivities');
    const leadsCol = db.collection('leads');

    let adminLookup;
    let singleUser = null;
    let singleIdentitySet = null;

    if (ALL_USERS) {
      const allAdmins = await adminUsersCol
        .find(
          { role: { $in: ['qualifier', 'onboarder', 'lead_access_manager'] } },
          { projection: { userId: 1, uid: 1, email: 1, name: 1, firstName: 1, lastName: 1, role: 1 } },
        )
        .toArray();
      adminLookup = buildAdminLookup(allAdmins);
      console.log(`✅ Loaded ${allAdmins.length} qualifier/onboarder/lead_access_manager accounts for lookup.\n`);
    } else {
      singleUser = await adminUsersCol.findOne({
        email: {
          $regex: new RegExp(
            `^${TARGET_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
          ),
        },
      });
      if (!singleUser) {
        console.error(`❌ No admin user found with email: ${TARGET_EMAIL}`);
        process.exit(1);
      }
      singleIdentitySet = buildIdentitySetForSingleUser(singleUser, TARGET_EMAIL);
      console.log('✅ Resolved admin user:');
      console.log(`   userId: ${singleUser.userId}`);
      console.log(`   email:  ${singleUser.email}`);
      console.log(`   role:   ${singleUser.role || '(unknown)'}\n`);
    }

    const cursor = leadsCol.find({ ...UNCLAIMED_FILTER, ...LEAD_ID_FILTER });
    let scanned = 0;
    let eligible = 0;
    let updated = 0;
    let skippedNoHistory = 0;
    let skippedNoStageMove = 0;
    let skippedUnresolved = 0;
    let skippedWrongRole = 0;
    const perUserCounts = new Map();
    const samples = [];
    let leadFilterDebug = null;

    while (await cursor.hasNext()) {
      const lead = await cursor.next();
      scanned += 1;

      const lastEntry = getLastStageMoveEntry(lead);
      if (!lastEntry) {
        skippedNoStageMove += 1;
        continue;
      }
      if (!lastEntry.changedBy) {
        skippedNoHistory += 1;
        continue;
      }

      let claimUser = null;

      if (ALL_USERS) {
        claimUser = resolveAdminForChangedBy(lastEntry.changedBy, adminLookup);
        if (!claimUser) {
          skippedUnresolved += 1;
          if (TARGET_LEAD_ID && !leadFilterDebug) {
            leadFilterDebug = {
              leadId: lead.leadId,
              name: lead.name,
              currentStatus: lead.status,
              lastStageMove: {
                status: lastEntry.status,
                changedBy: lastEntry.changedBy,
                changedByName: lastEntry.changedByName,
                changedAt: lastEntry.changedAt,
              },
              note:
                "Could not map statusHistory.changedBy to an admin user (qualifier/onboarder). " +
                "This usually means changedBy is a display label like 'Lead Access Manager' or a userId/email not present in adminusers.",
            };
          }
          continue;
        }
        if (!CLAIMABLE_ROLES.has(claimUser.role)) {
          skippedWrongRole += 1;
          continue;
        }
      } else {
        if (!matchesSingleUser(lastEntry.changedBy, singleIdentitySet, TARGET_EMAIL)) {
          skippedUnresolved += 1;
          continue;
        }
        claimUser = singleUser;
      }

      eligible += 1;
      const canonicalUserId = claimUser.userId;
      const pickedByName = displayNameFor(claimUser, lastEntry);
      const pickedAt = lastEntry.changedAt ? new Date(lastEntry.changedAt) : new Date();

      const userKey = claimUser.email || canonicalUserId;
      perUserCounts.set(userKey, (perUserCounts.get(userKey) || 0) + 1);

      if (samples.length < 30) {
        samples.push({
          leadId: lead.leadId,
          name: lead.name,
          status: lead.status,
          lastStatus: lastEntry.status,
          claimEmail: claimUser.email,
          pickedByName,
          pickedAt: pickedAt.toISOString(),
        });
      }

      if (APPLY) {
        const result = await leadsCol.updateOne(
          { leadId: lead.leadId, ...UNCLAIMED_FILTER },
          {
            $set: {
              pickedBy: canonicalUserId,
              pickedByName,
              pickedAt,
            },
          },
        );

        if (result.modifiedCount === 1) {
          updated += 1;
          try {
            await leadActivities.insertOne({
              activityId: `ACT-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
              leadId: lead.leadId,
              type: 'note',
              action: 'Auto-claimed from last timeline entry (backfill script)',
              performedBy: canonicalUserId,
              performedByName: pickedByName,
              metadata: {
                source: 'backfill-picked-by-last-timeline-user',
                mode: ALL_USERS ? 'all-users' : 'single-email',
                lastStatus: lastEntry.status,
                lastChangedAt: pickedAt,
              },
              createdAt: new Date(),
            });
          } catch (activityErr) {
            // non-fatal
          }
        }
      }
    }

    console.log('--- Summary ---');
    console.log(`Unclaimed leads scanned:        ${scanned}`);
    console.log(`Eligible (will claim):        ${eligible}`);
    console.log(`Skipped (no stage move):      ${skippedNoStageMove}`);
    console.log(`Skipped (no changedBy):       ${skippedNoHistory}`);
    console.log(`Skipped (unknown changedBy):  ${skippedUnresolved}`);
    if (ALL_USERS) {
      console.log(`Skipped (non qualifier/onboarder): ${skippedWrongRole}`);
    }
    if (APPLY) {
      console.log(`Updated (claimed):            ${updated}`);
    } else {
      console.log(`Would update:                 ${eligible}`);
      console.log('\nRe-run with --apply to write changes.');
    }

    if (perUserCounts.size > 0) {
      console.log('\n--- Claims by user (eligible) ---');
      const sorted = [...perUserCounts.entries()].sort((a, b) => b[1] - a[1]);
      for (const [email, count] of sorted.slice(0, 40)) {
        console.log(`  ${count.toString().padStart(5)}  ${email}`);
      }
      if (sorted.length > 40) {
        console.log(`  ... and ${sorted.length - 40} more users`);
      }
    }

    if (samples.length) {
      console.log('\n--- Sample leads ---');
      for (const row of samples) {
        console.log(
          `  ${row.leadId} | ${row.name || '—'} | ${row.status} | last=${row.lastStatus} | → ${row.claimEmail || row.pickedByName}`,
        );
      }
      if (eligible > samples.length) {
        console.log(`  ... and ${eligible - samples.length} more`);
      }
    }
    
    if (TARGET_LEAD_ID && leadFilterDebug) {
      console.log('\n--- Lead filter debug ---');
      console.log(`Lead: ${leadFilterDebug.leadId} | ${leadFilterDebug.name || '—'} | status=${leadFilterDebug.currentStatus}`);
      console.log(
        `Last stage move: ${leadFilterDebug.lastStageMove.status} | by=${leadFilterDebug.lastStageMove.changedByName || '—'} | id=${leadFilterDebug.lastStageMove.changedBy} | at=${new Date(
          leadFilterDebug.lastStageMove.changedAt,
        ).toLocaleString()}`,
      );
      console.log(`Reason: ${leadFilterDebug.note}`);
    }

    console.log(APPLY ? '\n✅ Backfill completed.' : '\n✅ Dry run completed.');
  } catch (err) {
    console.error('❌ Backfill failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB\n');
    process.exit(0);
  }
}

run();
