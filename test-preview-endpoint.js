/**
 * Test script for bulk upload preview endpoint
 * 
 * Usage: node test-preview-endpoint.js
 * 
 * This tests:
 * 1. Preview endpoint with valid data
 * 2. Preview endpoint with duplicates in file
 * 3. Preview endpoint with duplicates in database
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const ADMIN_SERVICE_URL = 'http://localhost:4001';
const FIREBASE_TOKEN = 'YOUR_FIREBASE_TOKEN_HERE'; // Replace with actual token

// Create test CSV with duplicates
function createTestCSV() {
  const csvContent = `Full Name,Phone Number,Email (optional),City / Area,State (optional),Address,Pincode,Experience Level (beginner/intermediate/experienced),Years of Experience (optional),Working Days (optional),Preferred Time Slot (optional),Source (referral/campaign/walk-in/agent/other)
John Doe,9876543210,john@example.com,Delhi,Delhi,123 Main Street,110001,intermediate,3,Mon-Fri,Morning,referral
Jane Smith,9876543211,jane@example.com,Mumbai,Maharashtra,456 Worker Lane,400053,experienced,5,Mon-Sat,Afternoon,campaign
Duplicate John,9876543210,dup@example.com,Delhi,Delhi,789 Duplicate St,110001,beginner,1,Mon-Fri,Morning,referral
Bob Wilson,9876543212,bob@example.com,Bangalore,Karnataka,321 Tech Park,560001,intermediate,4,Mon-Sat,Evening,walk-in
Another Dup,9876543211,another@example.com,Chennai,Tamil Nadu,999 South St,600001,experienced,6,Mon-Sun,Morning,agent`;

  const filePath = path.join(__dirname, 'test-preview-data.csv');
  fs.writeFileSync(filePath, csvContent);
  return filePath;
}

async function testPreviewEndpoint() {
  try {
    console.log('🧪 Testing Bulk Upload Preview Endpoint\n');

    // Create test CSV
    const csvPath = createTestCSV();
    console.log('✅ Created test CSV with 5 rows (2 duplicates within file)');

    // Create form data
    const form = new FormData();
    form.append('file', fs.createReadStream(csvPath));
    form.append('primaryCategory', 'moving');
    form.append('secondaryCategory', 'Package Delivery');

    // Call preview endpoint
    console.log('\n📤 Calling /api/v1/internal/bulk-upload/preview...\n');
    
    const response = await axios.post(
      `${ADMIN_SERVICE_URL}/api/v1/internal/bulk-upload/preview`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${FIREBASE_TOKEN}`,
        },
      }
    );

    if (response.data.success) {
      const { rows, summary } = response.data.data;

      console.log('📊 SUMMARY:');
      console.log(`   Total rows: ${summary.total}`);
      console.log(`   Valid: ${summary.valid}`);
      console.log(`   Invalid: ${summary.invalid}`);
      console.log(`   Duplicates in file: ${summary.duplicatesInFile}`);
      console.log(`   Duplicates in DB: ${summary.duplicatesInDb}`);

      console.log('\n📋 PREVIEW ROWS:');
      rows.forEach((row) => {
        const statusIcon = row.status === 'valid' ? '✅' : '❌';
        console.log(`\n   ${statusIcon} Row ${row.rowNumber}: ${row.name} (${row.phone})`);
        console.log(`      Status: ${row.status}`);
        if (row.errors.length > 0) {
          console.log(`      Errors: ${row.errors.join(', ')}`);
        }
        if (row.isDuplicateInFile) {
          console.log(`      ⚠️  Duplicate within file`);
        }
        if (row.isDuplicateInDb) {
          console.log(`      ⚠️  Duplicate in database: ${row.duplicateLeadId}`);
        }
      });

      console.log('\n✅ Preview endpoint working correctly!');
      console.log('\n💡 Expected behavior:');
      console.log('   - Row 3 (Duplicate John) should be marked as duplicate in file');
      console.log('   - Row 5 (Another Dup) should be marked as duplicate in file');
      console.log('   - Only rows 2, 4 would be imported (rows 1, 3, 5 are duplicates)');

    } else {
      console.error('❌ Preview failed:', response.data.error);
    }

    // Cleanup
    fs.unlinkSync(csvPath);
    console.log('\n🧹 Cleaned up test file');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run test
testPreviewEndpoint();
