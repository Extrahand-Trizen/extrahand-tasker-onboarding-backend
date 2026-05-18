const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/onboarding';

async function run() {
  try {
    await mongoose.connect(mongoUri);

    const LeadSchema = new mongoose.Schema({}, { strict: false });
    const Lead = mongoose.model('Lead', LeadSchema, 'leads');

    const isRegistered = {
      $or: [
        { $and: [ { $gt: ["$conversionData.platformUid", null] }, { $ne: ["$conversionData.platformUid", ""] } ] },
        { $and: [ { $gt: ["$activationData.firebaseUid", null] }, { $ne: ["$activationData.firebaseUid", ""] } ] },
        { $in: ["$accountStatus", ["invited", "activated", "suspended"]] }
      ]
    };

    const isVerified = {
      $or: [
        { $eq: ["$conversionData.isAadhaarVerified", true] },
        { $eq: ["$verificationStatus.aadhaar.status", "verified"] }
      ]
    };

    const registeredQuery = {
      $or: [
        { 'conversionData.platformUid': { $exists: true, $nin: [null, ''] } },
        { 'activationData.firebaseUid': { $exists: true, $nin: [null, ''] } },
        { accountStatus: { $in: ['invited', 'activated', 'suspended'] } }
      ]
    };

    const stats = await Lead.aggregate([
      {
        $facet: {
          qualifierStats: [
            {
              $group: {
                _id: '$addedBy',
                name: { $last: '$addedByName' },
                totalLeads: { $sum: 1 },
                registeredCount: {
                  $sum: { $cond: [isRegistered, 1, 0] }
                },
                verifiedCount: {
                  $sum: {
                    $cond: [
                      { $and: [isRegistered, isVerified] },
                      1,
                      0
                    ]
                  }
                }
              }
            },
            { $sort: { registeredCount: -1 } }
          ],
          leadDetails: [
            {
              $match: registeredQuery
            },
            {
              $project: {
                name: 1,
                phone: 1,
                landline: 1,
                addedBy: 1,
                addedByName: 1,
                isVerified: isVerified
              }
            }
          ]
        }
      }
    ]);

    const result = {
      qualifierStats: stats[0].qualifierStats.map(q => ({
        id: q._id,
        name: q.name || 'Unknown',
        total: q.totalLeads,
        registered: q.registeredCount,
        verified: q.verifiedCount
      })),
      leadDetails: stats[0].leadDetails.map(l => ({
        name: l.name,
        phone: l.phone || l.landline || 'N/A',
        addedBy: l.addedBy,
        addedByName: l.addedByName || 'Unknown',
        verified: l.isVerified
      }))
    };

    fs.writeFileSync(path.join(__dirname, '../qualifier_report.json'), JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
