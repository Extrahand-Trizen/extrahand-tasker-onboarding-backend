/**
 * Test script to verify connection to user-verification service
 * Tests the /api/v1/verification/bulk-store endpoint
 */

const axios = require('axios');

const VERIFICATION_URL = 'https://extrahand-user-verification-service.apps.extrahand.in';
const SERVICE_TOKEN = 'ExtraHand_Secure_Token_2024_MinLength32Chars_ChangeInProduction';

console.log('🧪 Testing connection to verification service...\n');
console.log('URL:', VERIFICATION_URL);
console.log('Endpoint:', '/api/v1/verification/bulk-store');
console.log('Token:', SERVICE_TOKEN.substring(0, 20) + '...\n');

async function testVerificationService() {
  try {
    console.log('📤 Sending test request...');
    
    const testData = {
      userId: 'test_user_' + Date.now(),
      type: 'aadhaar',
      maskedValue: 'XXXX XXXX 1234',
      status: 'verified',
      verifiedAt: new Date().toISOString(),
      provider: 'admin_manual',
      verificationSource: 'admin_manual',
      verifiedBy: {
        userId: 'test_admin_123',
        userName: 'Test Admin',
        role: 'operations'
      },
      consent: {
        given: true,
        givenAt: new Date().toISOString(),
        consentVersion: 'v1.0',
        consentText: 'Test verification - connection check with admin tracking'
      }
    };
    
    console.log('Request body:', JSON.stringify(testData, null, 2));
    console.log('\n⏳ Waiting for response...\n');
    
    const response = await axios.post(
      `${VERIFICATION_URL}/api/v1/verification/bulk-store`,
      testData,
      {
        headers: {
          'X-Service-Auth': SERVICE_TOKEN,
          'X-Service-Name': 'admin-service',
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    console.log('✅ SUCCESS! Connection working!\n');
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    console.log('\n✨ Verification service is reachable and accepting requests!');
    
    return true;
  } catch (error) {
    console.log('❌ ERROR! Connection failed!\n');
    
    if (error.response) {
      // Server responded with error
      console.log('Response status:', error.response.status);
      console.log('Response data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 401 || error.response.status === 403) {
        console.log('\n⚠️  Authentication failed - check SERVICE_AUTH_TOKEN');
      } else if (error.response.status === 400) {
        console.log('\n⚠️  Bad request - check request format');
      } else if (error.response.status === 500) {
        console.log('\n⚠️  Server error - check verification service logs');
      }
    } else if (error.request) {
      // Request sent but no response
      console.log('Error:', error.message);
      console.log('\n⚠️  No response received - check:');
      console.log('   - Is verification service running?');
      console.log('   - Is the URL correct?');
      console.log('   - Is there a network/firewall issue?');
    } else {
      // Error setting up request
      console.log('Error:', error.message);
    }
    
    return false;
  }
}

// Run the test
testVerificationService()
  .then((success) => {
    if (success) {
      console.log('\n✅ Test completed successfully!');
      console.log('📝 Next steps:');
      console.log('   1. Add VERIFICATION_SERVICE_URL to your .env file');
      console.log('   2. Restart extrahand-admin-service');
      console.log('   3. Verify a document for an existing account');
      process.exit(0);
    } else {
      console.log('\n❌ Test failed - fix the issues above and try again');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('\n💥 Unexpected error:', err);
    process.exit(1);
  });
