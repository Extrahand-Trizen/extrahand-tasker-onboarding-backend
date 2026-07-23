#!/usr/bin/env node
/**
 * Export interested candidates to Excel (.xlsx)
 * Usage:
 * 1. cd extrahand-tasker-onboarding-backend
 * 2. npm install mongodb exceljs dotenv
 * 3. node scripts/export-interested-xlsx.js
 *
 * The script reads MONGODB_URI and optional MONGO_DB from environment or .env
 */
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
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

  const pipeline = [
    { $match: { $or: [ { status: 'contacted_interested' }, { 'statusHistory.status': 'contacted_interested' } ] } },
    { $project: { _id: 0, leadId: 1, name: 1, phone: { $ifNull: ['$phone', '$landline'] }, primaryCategory: { $ifNull: ['$primaryCategory', '$primarySkill'] }, secondaryCategory: { $ifNull: ['$secondaryCategory', '$secondarySkill'] }, addedBy: 1, addedByName: 1, statusHistory: 1 } },
    { $addFields: { _interestedEntries: { $filter: { input: '$statusHistory', as: 'h', cond: { $eq: ['$$h.status', 'contacted_interested'] } } } } },
    { $addFields: { interestedEntry: { $cond: [ { $gt: [{ $size: '$_interestedEntries' }, 0] }, { $arrayElemAt: ['$_interestedEntries', { $subtract: [{ $size: '$_interestedEntries' }, 1] }] }, null ] } } },
    { $project: { leadId: 1, name: 1, phone: 1, primaryCategory: 1, secondaryCategory: 1, addedBy: 1, addedByName: 1, interestedBy: { $ifNull: ['$interestedEntry.changedBy', ''] }, interestedByName: { $ifNull: ['$interestedEntry.changedByName', ''] }, interestedAt: '$interestedEntry.changedAt' } }
  ];

  const cursor = leads.aggregate(pipeline, { allowDiskUse: true });

  const outDir = path.resolve(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outFile = path.join(outDir, 'interested_candidates.xlsx');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Interested Candidates');

  sheet.columns = [
    { header: 'leadId', key: 'leadId', width: 20 },
    { header: 'name', key: 'name', width: 30 },
    { header: 'mobile', key: 'phone', width: 15 },
    { header: 'category', key: 'primaryCategory', width: 20 },
    { header: 'subcategory', key: 'secondaryCategory', width: 20 },
    { header: 'addedById', key: 'addedBy', width: 24 },
    { header: 'addedByName', key: 'addedByName', width: 24 },
    { header: 'interestedUpdatedById', key: 'interestedBy', width: 24 },
    { header: 'interestedUpdatedByName', key: 'interestedByName', width: 24 },
    { header: 'interestedAt', key: 'interestedAt', width: 24 }
  ];

  let rowCount = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    sheet.addRow({
      leadId: doc.leadId || '',
      name: doc.name || '',
      phone: doc.phone || '',
      primaryCategory: doc.primaryCategory || '',
      secondaryCategory: doc.secondaryCategory || '',
      addedBy: doc.addedBy || '',
      addedByName: doc.addedByName || '',
      interestedBy: doc.interestedBy || '',
      interestedByName: doc.interestedByName || '',
      interestedAt: doc.interestedAt ? new Date(doc.interestedAt) : ''
    });
    rowCount++;
  }

  if (rowCount === 0) {
    console.log('No interested leads found.');
  } else {
    await workbook.xlsx.writeFile(outFile);
    console.log(`Wrote ${rowCount} rows to ${outFile}`);
  }

  await client.close();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
