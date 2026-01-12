/**
 * Fix the uid index to be properly sparse
 * This fixes the duplicate key error when creating users without uid
 * 
 * Usage: node scripts/fix-uid-index.js
 */

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://user:user@cluster0.tfvlujk.mongodb.net/extrahand?retryWrites=true&w=majority&appName=Cluster0';

(async () => {
  try {
    console.log('🔧 Fixing uid index in adminusers collection...\n');
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const collection = db.collection('adminusers');
    
    // Drop the existing uid index
    try {
      await collection.dropIndex('uid_1');
      console.log('✅ Dropped existing uid_1 index');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️  uid_1 index does not exist (this is fine)');
      } else {
        throw error;
      }
    }
    
    // Create new sparse unique index
    await collection.createIndex(
      { uid: 1 },
      { 
        unique: true, 
        sparse: true,
        name: 'uid_1'
      }
    );
    console.log('✅ Created new sparse unique index on uid\n');
    
    console.log('🎉 Index fix complete!');
    console.log('You can now create users via invite without uid field.\n');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
})();
