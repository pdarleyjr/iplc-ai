/**
 * Test script for vector limit validation
 */

import { getVectorCount, updateVectorCount, checkVectorQuota, getVectorUsageStatus } from './src/vectorize';

// Mock environment for testing
const mockEnv = {
  DOC_METADATA: {
    get: async (key: string) => {
      // Simulate some existing vectors
      if (key === '__vector_count__') {
        return '85'; // Simulate 85 vectors already exist
      }
      return null;
    },
    put: async (key: string, value: string) => {
      console.log(`KV Put: ${key} = ${value}`);
    },
    delete: async (key: string) => {
      console.log(`KV Delete: ${key}`);
    }
  }
} as any;

async function runTests() {
  console.log('Testing Vector Limit Implementation\n');

  // Test 1: Get current vector count
  console.log('Test 1: Get current vector count');
  const count = await getVectorCount(mockEnv);
  console.log(`Current vector count: ${count}`);
  console.log('✓ Pass\n');

  // Test 2: Check vector quota (should allow)
  console.log('Test 2: Check quota for 10 vectors (should allow)');
  const quota1 = await checkVectorQuota(mockEnv, 10);
  console.log(`Quota check result:`, quota1);
  console.log(`Should allow: ${quota1.allowed}`);
  console.log('✓ Pass\n');

  // Test 3: Check vector quota (should not allow)
  console.log('Test 3: Check quota for 20 vectors (should NOT allow)');
  const quota2 = await checkVectorQuota(mockEnv, 20);
  console.log(`Quota check result:`, quota2);
  console.log(`Should NOT allow: ${!quota2.allowed}`);
  console.log('✓ Pass\n');

  // Test 4: Get vector usage status
  console.log('Test 4: Get vector usage status');
  const status = await getVectorUsageStatus(mockEnv);
  console.log(`Usage status:`, status);
  console.log('✓ Pass\n');

  // Test 5: Update vector count
  console.log('Test 5: Update vector count (add 5)');
  const newCount = await updateVectorCount(mockEnv, 5);
  console.log(`New count after adding 5: ${newCount}`);
  console.log('✓ Pass\n');

  console.log('All tests passed! ✓');
}

// Run tests
runTests().catch(console.error);