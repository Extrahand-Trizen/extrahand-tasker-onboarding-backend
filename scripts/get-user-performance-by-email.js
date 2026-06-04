/**
 * Print Performance-page metrics for one admin user (by email).
 *
 * Matches LeadService.getPerformanceOverview() for onboarders:
 *   - Current / Total Leads (pickedBy / addedBy)
 *   - Follow-ups (callback + onboarding, owner-filtered)
 *   - Registered (owner scope, registered but not verified)
 *   - Overdue follow-ups
 *
 * Usage:
 *   node scripts/get-user-performance-by-email.js --email=santhoshumareddy@gmail.com
 *   node scripts/get-user-performance-by-email.js --email=santhoshu@cognitbotz.com --json
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGO_DB || 'extrahand';
const JSON_OUT = process.argv.includes('--json');

const emailArg = process.argv.find((arg) => arg.startsWith('--email='));
const TARGET_EMAIL = emailArg
  ? emailArg.split('=').slice(1).join('=').trim().toLowerCase()
  : '';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is required.');
  process.exit(1);
}
if (!TARGET_EMAIL) {
  console.error('❌ Usage: node scripts/get-user-performance-by-email.js --email=user@example.com');
  process.exit(1);
}

function buildIdSelector(field, ids) {
  if (!ids.length) return {};
  if (ids.length === 1) return { [field]: ids[0] };
  return { [field]: { $in: ids } };
}

function buildOwnerScopeClause(ownerIds) {
  return {
    $or: [
      buildIdSelector('pickedBy', ownerIds),
      buildIdSelector('addedBy', ownerIds),
      buildIdSelector('statusHistory.changedBy', ownerIds),
    ],
  };
}

function getPerformanceIdentityIds(adminUser) {
  return [adminUser.userId, adminUser.uid].filter(
    (v) => typeof v === 'string' && v.trim().length > 0,
  );
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

function latestFollowUpHistoryEntry(lead) {
  const history = Array.isArray(lead.statusHistory) ? lead.statusHistory : [];
  return [...history].sort(
    (a, b) => new Date(b?.changedAt || 0).getTime() - new Date(a?.changedAt || 0).getTime(),
  )[0];
}

function computeFollowUpStats(leads, identityIds) {
  const now = new Date();
  const ownerSet = new Set(identityIds);

  const items = [];
  for (const lead of leads) {
    const ownerEntry = latestFollowUpHistoryEntry(lead);
    if (!ownerEntry?.changedBy || !ownerSet.has(ownerEntry.changedBy)) continue;

    if (lead.nextCallbackAt) {
      items.push({ dueType: 'callback', dueAt: new Date(lead.nextCallbackAt) });
    }
    if (lead.expectedOnboardingAt) {
      items.push({ dueType: 'onboarding', dueAt: new Date(lead.expectedOnboardingAt) });
    }
  }

  const callbackItems = items.filter((i) => i.dueType === 'callback');
  const onboardingItems = items.filter((i) => i.dueType === 'onboarding');

  return {
    totalFollowUps: items.length,
    callbackTotal: callbackItems.length,
    onboardingTotal: onboardingItems.length,
    callbackOverdue: callbackItems.filter((i) => i.dueAt < now).length,
    onboardingOverdue: onboardingItems.filter((i) => i.dueAt < now).length,
    overdue: 0,
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

    const identityIds = getPerformanceIdentityIds(adminUser);
    const name =
      adminUser.name ||
      [adminUser.firstName, adminUser.lastName].filter(Boolean).join(' ').trim() ||
      'Unknown';

    const registeredOnlyQuery = buildRegisteredOnlyPredicate();
    const registeredAllQuery = buildRegisteredPredicate();
    const verifiedQuery = buildVerifiedPredicate();
    const ownerScope = buildOwnerScopeClause(identityIds);

    const [
      totalLeads,
      currentClaims,
      registered,
      registeredAndVerified,
      notRegisteredInScope,
      followUpLeads,
    ] = await Promise.all([
      leadsCol.countDocuments(buildIdSelector('addedBy', identityIds)),
      leadsCol.countDocuments(buildIdSelector('pickedBy', identityIds)),
      leadsCol.countDocuments({ $and: [ownerScope, registeredOnlyQuery] }),
      leadsCol.countDocuments({ $and: [ownerScope, registeredAllQuery, verifiedQuery] }),
      leadsCol.countDocuments({
        $and: [ownerScope, { $nor: [registeredAllQuery] }],
      }),
      leadsCol
        .find({
          $or: [
            { nextCallbackAt: { $exists: true, $ne: null } },
            { expectedOnboardingAt: { $exists: true, $ne: null } },
          ],
        })
        .project({
          statusHistory: 1,
          nextCallbackAt: 1,
          expectedOnboardingAt: 1,
        })
        .toArray(),
    ]);

    const followUpStats = computeFollowUpStats(followUpLeads, identityIds);
    followUpStats.overdue = followUpStats.callbackOverdue + followUpStats.onboardingOverdue;

    const result = {
      email: adminUser.email,
      name,
      userId: adminUser.userId,
      uid: adminUser.uid || null,
      role: adminUser.role,
      team: adminUser.team || adminUser.department || null,
      performancePage: {
        currentClaims,
        totalLeads,
        currentSlashTotal: `${currentClaims} / ${totalLeads}`,
        followUps: followUpStats.totalFollowUps,
        registered,
        overdueFollowUps: followUpStats.overdue,
      },
      breakdown: {
        followUps: {
          total: followUpStats.totalFollowUps,
          callback: followUpStats.callbackTotal,
          onboarding: followUpStats.onboardingTotal,
          callbackOverdue: followUpStats.callbackOverdue,
          onboardingOverdue: followUpStats.onboardingOverdue,
        },
        registration: {
          registeredNotVerified: registered,
          registeredAndVerified,
          notRegisteredInOwnerScope: notRegisteredInScope,
        },
        leads: {
          addedByUser: totalLeads,
          currentlyClaimed: currentClaims,
        },
      },
      notes: {
        registered:
          'Same as Performance page: owner scope (pickedBy OR addedBy OR statusHistory.changedBy), registered on platform, not yet Aadhaar-verified.',
        currentSlashTotal:
          'Performance page shows currentClaims / totalLeads where totalLeads = leads added by user (addedBy).',
        followUps:
          'Leads with callback/onboarding dates where latest statusHistory.changedBy matches this user.',
      },
    };

    if (JSON_OUT) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n=== User performance (matches Performance page) ===\n');
      console.log(`Name:     ${result.name}`);
      console.log(`Email:    ${result.email}`);
      console.log(`UserId:   ${result.userId}`);
      console.log(`Role:     ${result.role}`);
      console.log(`Team:     ${result.team || '—'}`);
      console.log('\n--- Performance page columns ---');
      console.log(`Current / Total Leads:  ${result.performancePage.currentSlashTotal}`);
      console.log(`Follow-ups:             ${result.performancePage.followUps}`);
      console.log(`Registered:             ${result.performancePage.registered}`);
      console.log(`Overdue follow-ups:     ${result.performancePage.overdueFollowUps}`);
      console.log('\n--- Registration breakdown ---');
      console.log(`Registered (not verified): ${result.breakdown.registration.registeredNotVerified}`);
      console.log(`Registered & verified:     ${result.breakdown.registration.registeredAndVerified}`);
      console.log(`Not registered (in scope): ${result.breakdown.registration.notRegisteredInOwnerScope}`);
      console.log('\n--- Follow-up breakdown ---');
      console.log(`Callback follow-ups:     ${result.breakdown.followUps.callback}`);
      console.log(`Onboarding follow-ups:   ${result.breakdown.followUps.onboarding}`);
      console.log(`Callback overdue:        ${result.breakdown.followUps.callbackOverdue}`);
      console.log(`Onboarding overdue:      ${result.breakdown.followUps.onboardingOverdue}`);
      console.log('\n✅ Done.\n');
    }
  } catch (err) {
    console.error('❌ Failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
