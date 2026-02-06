#!/usr/bin/env tsx
/**
 * Fix OpenCode Zen Model IDs
 *
 * The providerModelId should have the vendor prefix:
 * - moonshotai/kimi-k2.5 (not kimi-k2.5)
 * - minimax/minimax-m2.1 (not minimax-m2.1)
 * - zhipu/glm-4.7 (not glm-4.7)
 */

import { getDb } from '../server/db';
import { modelProviderMap, llmProviders } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';

interface ModelFix {
  modelId: string;
  incorrectProviderModelId: string;
  correctProviderModelId: string;
}

const fixes: ModelFix[] = [
  {
    modelId: 'kimi-k2.5-free',
    incorrectProviderModelId: 'kimi-k2.5',
    correctProviderModelId: 'moonshotai/kimi-k2.5',
  },
  {
    modelId: 'minimax-m2.1-free',
    incorrectProviderModelId: 'minimax-m2.1',
    correctProviderModelId: 'minimax/minimax-m2.1',
  },
  {
    modelId: 'glm-4.7-free',
    incorrectProviderModelId: 'glm-4.7',
    correctProviderModelId: 'zhipu/glm-4.7',
  },
];

async function fixModelIds() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  console.log('🔧 Fixing OpenCode Zen Model IDs...\n');

  // Get OpenCode Zen provider ID
  const [provider] = await db
    .select({ id: llmProviders.id })
    .from(llmProviders)
    .where(eq(llmProviders.providerName, 'opencode-zen'));

  if (!provider) {
    console.error('❌ OpenCode Zen provider not found!');
    process.exit(1);
  }

  const zenId = provider.id;
  console.log(`✓ Found OpenCode Zen provider (ID: ${zenId})\n`);

  // Fix each model
  let fixedCount = 0;

  for (const fix of fixes) {
    console.log(`Checking ${fix.modelId}...`);

    // Check current value
    const [current] = await db
      .select({ providerModelId: modelProviderMap.providerModelId })
      .from(modelProviderMap)
      .where(
        and(
          eq(modelProviderMap.modelId, fix.modelId),
          eq(modelProviderMap.providerId, zenId)
        )
      );

    if (!current) {
      console.log(`  ⚠️  Not found in database, skipping`);
      continue;
    }

    if (current.providerModelId === fix.correctProviderModelId) {
      console.log(`  ✓ Already correct: ${current.providerModelId}`);
      continue;
    }

    console.log(`  ⚠️  Current: ${current.providerModelId}`);
    console.log(`  → Updating to: ${fix.correctProviderModelId}`);

    // Update the model ID
    await db
      .update(modelProviderMap)
      .set({ providerModelId: fix.correctProviderModelId })
      .where(
        and(
          eq(modelProviderMap.modelId, fix.modelId),
          eq(modelProviderMap.providerId, zenId)
        )
      );

    console.log(`  ✓ Fixed!`);
    fixedCount++;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Fixed: ${fixedCount} model(s)`);
  console.log(`   Total: ${fixes.length} model(s)`);

  if (fixedCount > 0) {
    console.log('\n✅ Model IDs have been corrected!');
  } else {
    console.log('\n✓ All model IDs were already correct!');
  }
}

fixModelIds()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
