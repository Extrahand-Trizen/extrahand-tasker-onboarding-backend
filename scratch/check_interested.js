
const mongoose = require('mongoose');
const Lead = require('./src/models/Lead').default;
const { env } = require('./src/config/env');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const from = new Date('2025-09-26T00:00:00.000Z');
  const to = new Date('2026-05-15T23:59:59.999Z');

  const pipeline = [
    { $unwind: '$statusHistory' },
    { $match: { 
      'statusHistory.changedAt': { $gte: from, $lte: to },
      'statusHistory.status': 'contacted_interested'
    } }
  ];

  const totalEntries = await Lead.aggregate([...pipeline, { $count: 'count' }]);
  const uniqueLeads = await Lead.aggregate([...pipeline, { $group: { _id: '$leadId' } }, { $count: 'count' }]);

  console.log('Total entries:', totalEntries[0]?.count);
  console.log('Unique leads:', uniqueLeads[0]?.count);

  process.exit(0);
}

check();
