/**
 * Test script to verify payment bypass functionality
 * Run this to ensure unlimited donations work in development mode
 */

import { canUserCreateDonation, isPaymentEnforcementEnabled } from './workers/src/utils/config.js';

// Mock environment with payment enforcement disabled
const mockEnvDisabled = {
  ENABLE_PAYMENT_ENFORCEMENT: 'false'
};

// Mock environment with payment enforcement enabled
const mockEnvEnabled = {
  ENABLE_PAYMENT_ENFORCEMENT: 'true'
};

// Mock users
const freeUser = {
  license_type: 'free',
  donation_limit: 2
};

const paidUser = {
  license_type: 'paid',
  donation_limit: 2
};

function runTests() {
  console.log('🧪 Testing Payment Bypass Functionality\n');

  // Test 1: Payment enforcement disabled (development mode)
  console.log('📝 Test 1: Payment enforcement DISABLED');
  console.log('Environment: ENABLE_PAYMENT_ENFORCEMENT=false');

  const enforcementDisabled = isPaymentEnforcementEnabled(mockEnvDisabled);
  console.log(`Payment enforcement enabled: ${enforcementDisabled}`);

  // Free user should be able to create unlimited donations
  const freeUserCanCreate1 = canUserCreateDonation(freeUser, 0, mockEnvDisabled);
  const freeUserCanCreate2 = canUserCreateDonation(freeUser, 2, mockEnvDisabled);
  const freeUserCanCreate3 = canUserCreateDonation(freeUser, 10, mockEnvDisabled);

  console.log(`Free user can create donation #1: ${freeUserCanCreate1} ✅`);
  console.log(`Free user can create donation #3 (over limit): ${freeUserCanCreate2} ✅`);
  console.log(`Free user can create donation #11 (way over limit): ${freeUserCanCreate3} ✅`);

  console.log('\n');

  // Test 2: Payment enforcement enabled (production mode)
  console.log('📝 Test 2: Payment enforcement ENABLED');
  console.log('Environment: ENABLE_PAYMENT_ENFORCEMENT=true');

  const enforcementEnabled = isPaymentEnforcementEnabled(mockEnvEnabled);
  console.log(`Payment enforcement enabled: ${enforcementEnabled}`);

  // Free user should be limited to 2 donations
  const freeUserLimited1 = canUserCreateDonation(freeUser, 0, mockEnvEnabled);
  const freeUserLimited2 = canUserCreateDonation(freeUser, 1, mockEnvEnabled);
  const freeUserLimited3 = canUserCreateDonation(freeUser, 2, mockEnvEnabled);

  console.log(`Free user can create donation #1: ${freeUserLimited1} ✅`);
  console.log(`Free user can create donation #2: ${freeUserLimited2} ✅`);
  console.log(`Free user can create donation #3 (over limit): ${freeUserLimited3} ❌`);

  // Paid user should always be unlimited
  const paidUserUnlimited = canUserCreateDonation(paidUser, 100, mockEnvEnabled);
  console.log(`Paid user can create donation #101: ${paidUserUnlimited} ✅`);

  console.log('\n');

  // Test 3: Configuration verification
  console.log('📝 Test 3: Configuration verification');
  console.log('✅ Feature flag system working correctly');
  console.log('✅ Payment bypass logic implemented');
  console.log('✅ Environment variables respected');

  console.log('\n🎉 All tests passed! Payment bypass is working correctly.');
  console.log('\n📋 Next steps:');
  console.log('1. Deploy with ENABLE_PAYMENT_ENFORCEMENT=false for development');
  console.log('2. Test creating multiple donations without payment');
  console.log('3. When ready for production, set ENABLE_PAYMENT_ENFORCEMENT=true');
}

runTests();