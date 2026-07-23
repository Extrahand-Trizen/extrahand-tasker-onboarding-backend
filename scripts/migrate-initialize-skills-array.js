/**
 * Migration Script: Initialize skills array for all existing leads
 * 
 * Purpose:
 * - Ensure all leads have a `skills` array initialized (even if empty)
 * - For leads with `primarySkill` but no skills array, create the first skill from primarySkill
 * - This is required for the bulk import `$push` operation to work correctly
 * 
 * This migration fixes the issue where existing leads might not have the `skills` array
 * initialized, causing `$push` operations in bulk import to fail silently.
 * 
 * Run this BEFORE using the bulk import feature with different categories
 * 
 * Usage:
 *   cd extrahand-admin-service
 *   node scripts/migrate-initialize-skills-array.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Get MongoDB connection from environment
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/extrahand';
const MONGO_DB = process.env.MONGO_DB || 'extrahand';

// Map category to human-readable name (same as in BulkLeadImportService)
const primarySkillNameMap = {
  cleaning: "Cleaning",
  handyperson: "Handyperson",
  moving: "Moving & Delivery",
  gardening: "Gardening",
  business: "Business Services",
  marketing: "Marketing & Design",
  tech: "Tech Support",
  tutoring: "Tutoring",
  photography: "Photography",
  beauty: "Beauty & Wellness",
  "pet-care": "Pet Care",
  events: "Events & Entertainment",
  other: "Other",
};

function getSkillName(category) {
  if (!category) return "Other";
  const normalized = category.toLowerCase().trim();
  return primarySkillNameMap[normalized] || category;
}

async function migrate() {
  try {
    console.log('🔄 Starting migration: Initialize skills array for all leads\n');
    console.log('📊 Connecting to MongoDB:', MONGODB_URI.replace(/\/\/.*@/, '//***@'));
    console.log('📊 Database:', MONGO_DB);
    
    await mongoose.connect(MONGODB_URI, { dbName: MONGO_DB });
    console.log('✅ Connected to MongoDB\n');

    // Get collection
    const db = mongoose.connection.db;
    const leadsCollection = db.collection('leads');

    // ============================================================
    // Step 1: Find leads without skills array or with null/undefined
    // ============================================================
    console.log('📋 Step 1: Finding leads without skills array...\n');
    
    // Find leads where skills doesn't exist, is null, or is not an array
    const leadsWithoutSkills = await leadsCollection.find({
      $or: [
        { skills: { $exists: false } },
        { skills: null },
        { skills: { $not: { $type: "array" } } }
      ]
    }).toArray();
    
    console.log(`   Found ${leadsWithoutSkills.length} leads without proper skills array\n`);

    if (leadsWithoutSkills.length === 0) {
      console.log('   ✅ All leads already have skills array initialized\n');
      await mongoose.disconnect();
      console.log('📊 Disconnected from MongoDB\n');
      console.log('✅ Migration completed - no changes needed!\n');
      return;
    }

    // ============================================================
    // Step 2: Process leads and prepare updates
    // ============================================================
    console.log('📋 Step 2: Processing leads...\n');
    
    let leadsWithPrimarySkill = 0;
    let leadsWithoutPrimarySkill = 0;
    const bulkOps = [];

    for (const lead of leadsWithoutSkills) {
      const primaryCategory = lead.primaryCategory || lead.primarySkill;
      const experienceLevel = lead.experienceLevel || 'beginner';
      const addedBy = lead.addedBy || 'system';
      const addedByName = lead.addedByName || 'Migration Script';
      
      if (primaryCategory) {
        // Lead has primarySkill - create first skill from it
        const skillName = getSkillName(primaryCategory);
        const skillCategory = primaryCategory.toLowerCase().trim();
        
        bulkOps.push({
          updateOne: {
            filter: { _id: lead._id },
            update: {
              $set: {
                skills: [{
                  name: skillName,
                  category: skillCategory,
                  level: experienceLevel,
                  toolsAvailable: false,
                  assignedBy: addedBy,
                  assignedAt: lead.createdAt || new Date()
                }],
                updatedAt: new Date()
              }
            }
          }
        });
        
        leadsWithPrimarySkill++;
      } else {
        // Lead has no primarySkill - initialize empty array
        bulkOps.push({
          updateOne: {
            filter: { _id: lead._id },
            update: {
              $set: {
                skills: [],
                updatedAt: new Date()
              }
            }
          }
        });
        
        leadsWithoutPrimarySkill++;
      }
    }

    console.log(`   Leads with primarySkill: ${leadsWithPrimarySkill}`);
    console.log(`   Leads without primarySkill: ${leadsWithoutPrimarySkill}`);
    console.log(`   Total operations to perform: ${bulkOps.length}\n`);

    // ============================================================
    // Step 3: Execute bulk update
    // ============================================================
    console.log('📋 Step 3: Executing bulk update...\n');
    
    let updateResult = { modifiedCount: 0, matchedCount: 0 };
    
    if (bulkOps.length > 0) {
      // Process in batches of 1000 to avoid memory issues
      const batchSize = 1000;
      for (let i = 0; i < bulkOps.length; i += batchSize) {
        const batch = bulkOps.slice(i, i + batchSize);
        const batchResult = await leadsCollection.bulkWrite(batch, { ordered: false });
        updateResult.modifiedCount += batchResult.modifiedCount;
        updateResult.matchedCount += batchResult.matchedCount;
        console.log(`   Processed batch ${Math.floor(i / batchSize) + 1}: ${batchResult.modifiedCount} leads updated`);
      }
      console.log('');
    }

    console.log(`   ✅ Updated ${updateResult.modifiedCount} leads\n`);

    // ============================================================
    // Step 4: Verification
    // ============================================================
    console.log('📋 Step 4: Verifying migration...\n');
    
    const remainingLeads = await leadsCollection.countDocuments({
      $or: [
        { skills: { $exists: false } },
        { skills: null },
        { skills: { $not: { $type: "array" } } }
      ]
    });

    if (remainingLeads === 0) {
      console.log('   ✅ Verification passed! All leads now have skills array\n');
    } else {
      console.log(`   ⚠️  Warning: Found ${remainingLeads} leads still without proper skills array`);
      console.log('   This might indicate a connection issue or permission problem.\n');
    }

    // ============================================================
    // Summary
    // ============================================================
    console.log('📊 Migration Summary:');
    console.log('─────────────────────────────────────────────────');
    console.log(`   Leads found without skills array: ${leadsWithoutSkills.length}`);
    console.log(`   Leads with primarySkill:         ${leadsWithPrimarySkill}`);
    console.log(`   Leads without primarySkill:     ${leadsWithoutPrimarySkill}`);
    console.log(`   Leads updated:                   ${updateResult.modifiedCount}`);
    console.log(`   Remaining leads without skills:  ${remainingLeads}`);
    console.log('─────────────────────────────────────────────────\n');

    if (remainingLeads === 0) {
      console.log('✅ Migration completed successfully!\n');
      console.log('🎉 All leads now have skills array initialized\n');
      console.log('💡 You can now use bulk import with different categories\n');
    } else {
      console.log('⚠️  Migration completed with warnings.\n');
      console.log('   Please review the remaining leads manually.\n');
    }

    await mongoose.disconnect();
    console.log('📊 Disconnected from MongoDB\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrate().then(() => {
    console.log('🎉 All done!');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = migrate;
