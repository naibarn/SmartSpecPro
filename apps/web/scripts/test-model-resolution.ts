#!/usr/bin/env tsx
/**
 * Test Model ID Resolution
 *
 * Verifies that modelId -> providerModelId resolution works correctly
 */

import { getDb } from '../server/db';
import { modelProviderMap, llmProviders } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';

async function testModelResolution() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  console.log('🧪 Testing Model ID Resolution\n');

  // Get OpenCode Zen provider ID
  const [zenProvider] = await db
    .select({ id: llmProviders.id, providerName: llmProviders.providerName })
    .from(llmProviders)
    .where(eq(llmProviders.providerName, 'opencode-zen'));

  if (!zenProvider) {
    console.error('❌ OpenCode Zen provider not found!');
    process.exit(1);
  }

  console.log(`✓ Found OpenCode Zen provider (ID: ${zenProvider.id})\n`);

  // Test cases
  const testCases = [
    { modelId: 'kimi-k2.5-free', expectedProviderModelId: 'moonshotai/kimi-k2.5' },
    { modelId: 'minimax-m2.1-free', expectedProviderModelId: 'minimax/minimax-m2.1' },
    { modelId: 'glm-4.7-free', expectedProviderModelId: 'zhipu/glm-4.7' },
  ];

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.modelId}`);

    const [result] = await db
      .select({
        providerModelId: modelProviderMap.providerModelId,
      })
      .from(modelProviderMap)
      .where(
        and(
          eq(modelProviderMap.modelId, testCase.modelId),
          eq(modelProviderMap.providerId, zenProvider.id),
          eq(modelProviderMap.isEnabled, true)
        )
      )
      .limit(1);

    if (!result) {
      console.log(`  ❌ Not found in database`);
      failCount++;
      continue;
    }

    if (result.providerModelId === testCase.expectedProviderModelId) {
      console.log(`  ✓ Correct: ${result.providerModelId}`);
      passCount++;
    } else {
      console.log(`  ❌ Wrong: ${result.providerModelId}`);
      console.log(`     Expected: ${testCase.expectedProviderModelId}`);
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Results:');
  console.log('='.repeat(60));
  console.log(`✓ Passed: ${passCount}/${testCases.length}`);
  console.log(`❌ Failed: ${failCount}/${testCases.length}`);

  if (failCount === 0) {
    console.log('\n✅ All tests passed! Model ID resolution is working correctly.');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Please check the model mappings.');
    process.exit(1);
  }
}

testModelResolution();
