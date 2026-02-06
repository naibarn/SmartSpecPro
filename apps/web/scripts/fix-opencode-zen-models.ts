#!/usr/bin/env tsx
/**
 * Fix OpenCode Zen Model IDs
 *
 * According to OpenCode Zen API guide:
 * - Model IDs should be used DIRECTLY (e.g., "kimi-k2.5-free")
 * - NOT with vendor prefix (e.g., "moonshotai/kimi-k2.5")
 * - Endpoint: POST /zen/v1/chat/completions
 *
 * Supported models for /chat/completions:
 * - qwen3-coder, glm-4.7, glm-4.6, minimax-m2.1, minimax-m2.1-free,
 * - kimi-k2.5, kimi-k2.5-free, kimi-k2, kimi-k2-thinking,
 * - trinity-large-preview-free, glm-4.7-free, big-pickle
 */

import { getDb } from '../server/db';
import { modelProviderMap, llmProviders } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';

// All OpenCode Zen models from the guide (for /chat/completions endpoint)
const OPENCODE_ZEN_MODELS = [
  // Free models
  { modelId: 'kimi-k2.5-free', modelName: 'Kimi K2.5 Free', providerModelId: 'kimi-k2.5-free', isFree: true, contextLength: 131072 },
  { modelId: 'minimax-m2.1-free', modelName: 'MiniMax M2.1 Free', providerModelId: 'minimax-m2.1-free', isFree: true, contextLength: 245760 },
  { modelId: 'glm-4.7-free', modelName: 'GLM 4.7 Free', providerModelId: 'glm-4.7-free', isFree: true, contextLength: 131072 },
  { modelId: 'trinity-large-preview-free', modelName: 'Trinity Large Preview Free', providerModelId: 'trinity-large-preview-free', isFree: true, contextLength: 128000 },
  { modelId: 'big-pickle', modelName: 'Big Pickle', providerModelId: 'big-pickle', isFree: true, contextLength: 128000 },

  // Paid models
  { modelId: 'kimi-k2.5', modelName: 'Kimi K2.5', providerModelId: 'kimi-k2.5', isFree: false, contextLength: 131072 },
  { modelId: 'kimi-k2', modelName: 'Kimi K2', providerModelId: 'kimi-k2', isFree: false, contextLength: 131072 },
  { modelId: 'kimi-k2-thinking', modelName: 'Kimi K2 Thinking', providerModelId: 'kimi-k2-thinking', isFree: false, contextLength: 131072 },
  { modelId: 'minimax-m2.1', modelName: 'MiniMax M2.1', providerModelId: 'minimax-m2.1', isFree: false, contextLength: 245760 },
  { modelId: 'glm-4.7', modelName: 'GLM 4.7', providerModelId: 'glm-4.7', isFree: false, contextLength: 131072 },
  { modelId: 'glm-4.6', modelName: 'GLM 4.6', providerModelId: 'glm-4.6', isFree: false, contextLength: 131072 },
  { modelId: 'qwen3-coder', modelName: 'Qwen3 Coder', providerModelId: 'qwen3-coder', isFree: false, contextLength: 128000 },
];

async function fixOpenCodeZenModels() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  console.log('🔧 Fixing OpenCode Zen Models...\n');

  // Get OpenCode Zen provider
  const [zenProvider] = await db
    .select({ id: llmProviders.id, providerName: llmProviders.providerName })
    .from(llmProviders)
    .where(eq(llmProviders.providerName, 'opencode-zen'));

  if (!zenProvider) {
    console.error('❌ OpenCode Zen provider not found!');
    process.exit(1);
  }

  const zenId = zenProvider.id;
  console.log(`✓ Found OpenCode Zen provider (ID: ${zenId})\n`);

  // 1. Delete existing OpenCode Zen model mappings
  console.log('Step 1: Removing old model mappings...');
  const deleteResult = await db
    .delete(modelProviderMap)
    .where(eq(modelProviderMap.providerId, zenId));
  console.log('✓ Old mappings removed\n');

  // 2. Insert correct model mappings
  console.log('Step 2: Adding correct model mappings...');
  let addedCount = 0;

  for (const model of OPENCODE_ZEN_MODELS) {
    await db
      .insert(modelProviderMap)
      .values({
        modelId: model.modelId,
        providerId: zenId,
        modelName: model.modelName,
        providerModelId: model.providerModelId,  // Direct ID without vendor prefix
        pricingInput: model.isFree ? '0' : '0.10',
        pricingOutput: model.isFree ? '0' : '0.30',
        isFree: model.isFree,
        contextLength: model.contextLength,
        isEnabled: true,
        priority: model.isFree ? 0 : 10,  // Free models have higher priority
      })
      .onConflictDoNothing();

    console.log(`  ✓ ${model.modelName} (${model.providerModelId}) ${model.isFree ? '[FREE]' : ''}`);
    addedCount++;
  }

  console.log(`\n✓ Added ${addedCount} models\n`);

  // 3. Verify the changes
  console.log('Step 3: Verifying changes...\n');

  const updatedModels = await db
    .select({
      modelId: modelProviderMap.modelId,
      modelName: modelProviderMap.modelName,
      providerModelId: modelProviderMap.providerModelId,
      isFree: modelProviderMap.isFree,
    })
    .from(modelProviderMap)
    .where(eq(modelProviderMap.providerId, zenId));

  console.log('OpenCode Zen Models in database:');
  const freeModels = updatedModels.filter(m => m.isFree);
  const paidModels = updatedModels.filter(m => !m.isFree);

  console.log(`\n  Free Models (${freeModels.length}):`);
  freeModels.forEach(m => {
    console.log(`    - ${m.modelName}: modelId="${m.modelId}", providerModelId="${m.providerModelId}"`);
  });

  console.log(`\n  Paid Models (${paidModels.length}):`);
  paidModels.forEach(m => {
    console.log(`    - ${m.modelName}: modelId="${m.modelId}", providerModelId="${m.providerModelId}"`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log('='.repeat(60));
  console.log(`✓ Total models: ${updatedModels.length}`);
  console.log(`✓ Free models: ${freeModels.length}`);
  console.log(`✓ Paid models: ${paidModels.length}`);
  console.log(`✓ Endpoint: POST /zen/v1/chat/completions`);
  console.log(`✓ Model ID format: Direct (e.g., "kimi-k2.5-free")`);
  console.log('\n✅ OpenCode Zen models fixed successfully!');
}

fixOpenCodeZenModels()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
