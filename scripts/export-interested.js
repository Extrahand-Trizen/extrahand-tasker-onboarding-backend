#!/usr/bin/env node
/**
 * Export interested candidates to CSV
 * Usage:
 * 1. cd extrahand-tasker-onboarding-backend
 * 2. npm install mongodb csv-writer dotenv
 * 3. node scripts/export-interested.js
 *
 * The script reads MONGODB_URI and optional MONGO_DB from environment or .env
 */
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGO_DB || process.env.MONGODB_DB || 'extrahand';

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in environment. Create a .env file or set the variable.');
  process.exit(1);
}

async function run() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log('Connected to MongoDB');

  const db = client.db(MONGO_DB);
  const leads = db.collection('leads');

  // Match leads that are currently interested or have history entry for interested
  const pipeline = [
    {
      $match: {
        $or: [
          { status: 'contacted_interested' },
          { 'statusHistory.status': 'contacted_interested' }
        ]
      }
    },
    {
      $project: {
        _id: 0,
        leadId: 1,
        name: 1,
        phone: { $ifNull: ['$phone', '$landline'] },
        primaryCategory: { $ifNull: ['$primaryCategory', '$primarySkill'] },
        secondaryCategory: { $ifNull: ['$secondaryCategory', '$secondarySkill'] },
        addedBy: 1,
        addedByName: 1,
        statusHistory: 1
      }
    },
    {
      $addFields: {
        _interestedEntries: {
          $filter: {
            input: '$statusHistory',
            as: 'h',
            cond: { $eq: ['$$h.status', 'contacted_interested'] }
          }
        }
      }
    },
    {
      $addFields: {
        interestedEntry: {
          $cond: [
            { $gt: [{ $size: '$_interestedEntries' }, 0] },
            { $arrayElemAt: ['$_interestedEntries', { $subtract: [{ $size: '$_interestedEntries' }, 1] }] },
            null
          ]
        }
      }
    },
    {
      $project: {
        leadId: 1,
        name: 1,
        phone: 1,
        primaryCategory: 1,
        secondaryCategory: 1,
        addedBy: 1,
        addedByName: 1,
        interestedBy: { $ifNull: ['$interestedEntry.changedBy', ''] },
        interestedByName: { $ifNull: ['$interestedEntry.changedByName', ''] },
        interestedAt: '$interestedEntry.changedAt'
      }
    }
  ];

  const cursor = leads.aggregate(pipeline, { allowDiskUse: true });

  const outDir = path.resolve(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outFile = path.join(outDir, 'interested_candidates.csv');

  const csvWriter = createObjectCsvWriter({
    path: outFile,
    header: [
      { id: 'leadId', title: 'leadId' },
      { id: 'name', title: 'name' },
      { id: 'phone', title: 'mobile' },
      { id: 'primaryCategory', title: 'category' },
      { id: 'secondaryCategory', title: 'subcategory' },
      { id: 'addedBy', title: 'addedById' },
      { id: 'addedByName', title: 'addedByName' },
      { id: 'interestedBy', title: 'interestedUpdatedById' },
      { id: 'interestedByName', title: 'interestedUpdatedByName' },
      { id: 'interestedAt', title: 'interestedAt' }
    ]
  });

  const rows = [];
  let count = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    rows.push({
      leadId: doc.leadId || '',
      name: doc.name || '',
      phone: doc.phone || '',
      primaryCategory: doc.primaryCategory || '',
      secondaryCategory: doc.secondaryCategory || '',
      addedBy: doc.addedBy || '',
      addedByName: doc.addedByName || '',
      interestedBy: doc.interestedBy || '',
      interestedByName: doc.interestedByName || '',
      interestedAt: doc.interestedAt ? new Date(doc.interestedAt).toISOString() : ''
    });
    count++;
  }

  if (rows.length === 0) {
    console.log('No interested leads found.');
  } else {
    await csvWriter.writeRecords(rows);
    console.log(`Wrote ${rows.length} rows to ${outFile}`);
  }

  await client.close();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
