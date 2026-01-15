/**
 * Migration script to fix BulkImport fileHash index
 * 
 * This script:
 * 1. Drops the old unique index on fileHash alone
 * 2. Creates a new compound unique index on (fileHash, createdBy)
 * 
 * This allows:
 * - Different users to upload the same file
 * - Same user to re-upload after deleting previous leads
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGO_DB || 'extrahand';

async function fixIndex() {
  try {
    console.log('🔧 Starting BulkImport Index Fix\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    if (!MONGODB_URI) {
      console.error('❌ Error: MONGODB_URI environment variable is required!');
      console.error('   Please set MONGODB_URI in your .env file or environment variables.');
      process.exit(1);
    }
    console.log(`   URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
    console.log(`   Database: ${MONGO_DB}`);
    await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db.collection('bulkimports');

    // STEP 1: List existing indexes
    console.log('═══════════════════════════════════════════════════════════');
    console.log('STEP 1: Checking existing indexes');
    console.log('═══════════════════════════════════════════════════════════\n');

    const existingIndexes = await collection.indexes();
    console.log('📋 Existing indexes:');
    existingIndexes.forEach((index, i) => {
      console.log(`   ${i + 1}. ${index.name}: ${JSON.stringify(index.key)}`);
      if (index.unique) {
        console.log(`      └─ Unique: true`);
      }
      if (index.sparse) {
        console.log(`      └─ Sparse: true`);
      }
    });
    console.log('');

    // STEP 2: Drop old fileHash_1 unique index if it exists
    console.log('═══════════════════════════════════════════════════════════');
    console.log('STEP 2: Dropping old fileHash_1 unique index');
    console.log('═══════════════════════════════════════════════════════════\n');

    const fileHashIndex = existingIndexes.find(idx => idx.name === 'fileHash_1');
    if (fileHashIndex) {
      console.log('🗑️  Dropping fileHash_1 index...');
      await collection.dropIndex('fileHash_1');
      console.log('✅ Successfully dropped fileHash_1 index\n');
    } else {
      console.log('ℹ️  fileHash_1 index not found (may have been dropped already)\n');
    }

    // STEP 3: Create new compound unique index
    console.log('═══════════════════════════════════════════════════════════');
    console.log('STEP 3: Creating compound unique index (fileHash, createdBy)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Check if compound index already exists
    const compoundIndex = existingIndexes.find(
      idx => idx.name === 'fileHash_1_createdBy_1' || 
             (idx.key && idx.key.fileHash === 1 && idx.key.createdBy === 1)
    );

    if (compoundIndex && compoundIndex.unique) {
      console.log('ℹ️  Compound unique index (fileHash, createdBy) already exists\n');
    } else {
      // Drop non-unique compound index if it exists
      if (compoundIndex && !compoundIndex.unique) {
        console.log('🗑️  Dropping non-unique compound index...');
        try {
          await collection.dropIndex('fileHash_1_createdBy_1');
        } catch (e) {
          // Index might have different name, try to find and drop it
          const indexToDrop = existingIndexes.find(
            idx => idx.key && idx.key.fileHash === 1 && idx.key.createdBy === 1 && !idx.unique
          );
          if (indexToDrop) {
            await collection.dropIndex(indexToDrop.name);
          }
        }
      }

      console.log('➕ Creating compound unique index (fileHash, createdBy)...');
      await collection.createIndex(
        { fileHash: 1, createdBy: 1 },
        { 
          unique: true, 
          sparse: true,
          name: 'fileHash_1_createdBy_1'
        }
      );
      console.log('✅ Successfully created compound unique index\n');
    }

    // STEP 4: Verify final indexes
    console.log('═══════════════════════════════════════════════════════════');
    console.log('STEP 4: Verifying final indexes');
    console.log('═══════════════════════════════════════════════════════════\n');

    const finalIndexes = await collection.indexes();
    console.log('📋 Final indexes:');
    finalIndexes.forEach((index, i) => {
      console.log(`   ${i + 1}. ${index.name}: ${JSON.stringify(index.key)}`);
      if (index.unique) {
        console.log(`      └─ Unique: true`);
      }
      if (index.sparse) {
        console.log(`      └─ Sparse: true`);
      }
    });
    console.log('');

    // Verify the compound index exists and is unique
    const finalCompoundIndex = finalIndexes.find(
      idx => idx.key && idx.key.fileHash === 1 && idx.key.createdBy === 1
    );

    if (finalCompoundIndex && finalCompoundIndex.unique) {
      console.log('✅ Migration completed successfully!');
      console.log('   The compound unique index (fileHash, createdBy) is now in place.');
      console.log('   Users can now re-upload files after deleting previous leads.\n');
    } else {
      console.error('❌ Warning: Compound unique index not found or not unique!');
      console.error('   Please check the indexes manually.\n');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.code === 11000) {
      console.error('   Duplicate key error - this might indicate existing duplicate data.');
      console.error('   You may need to clean up duplicate import records first.');
    }
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

fixIndex();
