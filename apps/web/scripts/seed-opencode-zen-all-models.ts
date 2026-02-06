#!/usr/bin/env tsx
/**
 * Seed ALL OpenCode Zen models from the official API
 *
 * Models from GET https://opencode.ai/zen/v1/models
 *
 * API Styles:
 * - claude-* → 'messages' (POST /zen/v1/messages)
 * - gpt-* → 'responses' (POST /zen/v1/responses)
 * - gemini-* → 'gemini' (POST /zen/v1/models/<id>)
 * - Others (kimi, glm, minimax, qwen, big-pickle, trinity) → 'chat-completions'
 */

import { getDb } from '../server/db';
import { modelProviderMap, llmProviders } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

// All OpenCode Zen models from the official API response
// Grouped by API style
const OPENCODE_ZEN_MODELS = [
  // ============================================
  // Claude models (use /messages endpoint)
  // ============================================
  { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', apiStyle: 'messages' as const, isFree: false, contextLength: 200000 },
  { id: 'claude-opus-4-1', name: 'Claude Opus 4.1', apiStyle: 'messages' as const, isFree: false, contextLength: 200000 },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', apiStyle: 'messages' as const, isFree: false, contextLength: 200000 },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', apiStyle: 'messages' as const, isFree: false, contextLength: 200000 },
  { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku', apiStyle: 'messages' as const, isFree: false, contextLength: 200000 },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', apiStyle: 'messages' as const, isFree: false, contextLength: 200000 },

  // ============================================
  // Gemini models (use /models/<id> endpoint)
  // ============================================
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro', apiStyle: 'gemini' as const, isFree: false, contextLength: 1000000 },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', apiStyle: 'gemini' as const, isFree: false, contextLength: 1000000 },

  // ============================================
  // GPT models (use /responses endpoint)
  // ============================================
  { id: 'gpt-5.2', name: 'GPT 5.2', apiStyle: 'responses' as const, isFree: false, contextLength: 128000 },
  { id: 'gpt-5.2-codex', name: 'GPT 5.2 Codex', apiStyle: 'responses' as const, isFree: false, contextLength: 128000 },
  { id: 'gpt-5.1', name: 'GPT 5.1', apiStyle: 'responses' as const, isFree: false, contextLength: 128000 },
  { id: 'gpt-5.1-codex-max', name: 'GPT 5.1 Codex Max', apiStyle: 'responses' as const, isFree: false, contextLength: 128000 },
  { id: 'gpt-5.1-codex', name: 'GPT 5.1 Codex', apiStyle: 'responses' as const, isFree: false, contextLength: 128000 },
  { id: 'gpt-5.1-codex-mini', name: 'GPT 5.1 Codex Mini', apiStyle: 'responses' as const, isFree: false, contextLength: 128000 },
  { id: 'gpt-5', name: 'GPT 5', apiStyle: 'responses' as const, isFree: false, contextLength: 128000 },
  { id: 'gpt-5-codex', name: 'GPT 5 Codex', apiStyle: 'responses' as const, isFree: false, contextLength: 128000 },
  { id: 'gpt-5-nano', name: 'GPT 5 Nano', apiStyle: 'responses' as const, isFree: false, contextLength: 128000 },

  // ============================================
  // OpenAI-compatible models (use /chat/completions endpoint)
  // ============================================
  { id: 'qwen3-coder', name: 'Qwen3 Coder', apiStyle: 'chat-completions' as const, isFree: false, contextLength: 128000 },
  { id: 'glm-4.7', name: 'GLM 4.7', apiStyle: 'chat-completions' as const, isFree: false, contextLength: 131072 },
  { id: 'glm-4.6', name: 'GLM 4.6', apiStyle: 'chat-completions' as const, isFree: false, contextLength: 131072 },
  { id: 'minimax-m2.1', name: 'MiniMax M2.1', apiStyle: 'chat-completions' as const, isFree: false, contextLength: 245760 },
  { id: 'minimax-m2.1-free', name: 'MiniMax M2.1 Free', apiStyle: 'chat-completions' as const, isFree: true, contextLength: 245760 },
  { id: 'kimi-k2.5', name: 'Kimi K2.5', apiStyle: 'chat-completions' as const, isFree: false, contextLength: 131072 },
  { id: 'kimi-k2.5-free', name: 'Kimi K2.5 Free', apiStyle: 'chat-completions' as const, isFree: true, contextLength: 131072 },
  { id: 'kimi-k2', name: 'Kimi K2', apiStyle: 'chat-completions' as const, isFree: false, contextLength: 131072 },
  { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', apiStyle: 'chat-completions' as const, isFree: false, contextLength: 131072 },
  { id: 'trinity-large-preview-free', name: 'Trinity Large Preview Free', apiStyle: 'chat-completions' as const, isFree: true, contextLength: 128000 },
  { id: 'glm-4.7-free', name: 'GLM 4.7 Free', apiStyle: 'chat-completions' as const, isFree: true, contextLength: 131072 },
  { id: 'big-pickle', name: 'Big Pickle', apiStyle: 'chat-completions' as const, isFree: true, contextLength: 128000 },
];

async function seedOpenCodeZenModels() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  console.log('🌱 Seeding ALL OpenCode Zen models...\n');

  // Get OpenCode Zen provider
  const [zenProvider] = await db
    .select({ id: llmProviders.id, providerName: llmProviders.providerName })
    .from(llmProviders)
    .where(eq(llmProviders.providerName, 'opencode-zen'));

  if (!zenProvider) {
    console.error('❌ OpenCode Zen provider not found!');
    console.log('   Please ensure the provider is created first.');
    process.exit(1);
  }

  const zenId = zenProvider.id;
  console.log(`✓ Found OpenCode Zen provider (ID: ${zenId})\n`);

  // Delete existing OpenCode Zen model mappings
  console.log('Step 1: Removing existing model mappings...');
  await db.delete(modelProviderMap).where(eq(modelProviderMap.providerId, zenId));
  console.log('✓ Old mappings removed\n');

  // Insert all models with correct apiStyle
  console.log('Step 2: Adding all models with correct API styles...\n');

  const byApiStyle: Record<string, typeof OPENCODE_ZEN_MODELS> = {};
  for (const model of OPENCODE_ZEN_MODELS) {
    if (!byApiStyle[model.apiStyle]) byApiStyle[model.apiStyle] = [];
    byApiStyle[model.apiStyle].push(model);
  }

  let addedCount = 0;

  for (const [apiStyle, models] of Object.entries(byApiStyle)) {
    console.log(`  ${apiStyle.toUpperCase()} (${models.length} models):`);

    for (const model of models) {
      await db
        .insert(modelProviderMap)
        .values({
          modelId: model.id,
          providerId: zenId,
          modelName: model.name,
          providerModelId: model.id,  // OpenCode Zen uses direct model IDs
          pricingInput: model.isFree ? '0' : '0.10',
          pricingOutput: model.isFree ? '0' : '0.30',
          isFree: model.isFree,
          contextLength: model.contextLength,
          isEnabled: true,
          priority: model.isFree ? 0 : 10,
          apiStyle: model.apiStyle,
        })
        .onConflictDoNothing();

      console.log(`    - ${model.name} (${model.id}) ${model.isFree ? '[FREE]' : ''}`);
      addedCount++;
    }
    console.log('');
  }

  // Update provider's availableModels JSON as well
  console.log('Step 3: Updating provider availableModels JSON...');
  const availableModels = OPENCODE_ZEN_MODELS.map(m => ({
    id: m.id,
    name: m.name,
    contextLength: m.contextLength,
    pricing: {
      input: m.isFree ? 0 : 0.10,
      output: m.isFree ? 0 : 0.30,
    },
    apiStyle: m.apiStyle,
  }));

  await db
    .update(llmProviders)
    .set({
      availableModels: availableModels,
      defaultModel: 'kimi-k2.5-free',  // Set a free model as default
    })
    .where(eq(llmProviders.id, zenId));
  console.log('✓ Updated availableModels JSON\n');

  // Summary
  const freeModels = OPENCODE_ZEN_MODELS.filter(m => m.isFree);
  const paidModels = OPENCODE_ZEN_MODELS.filter(m => !m.isFree);

  console.log('='.repeat(60));
  console.log('📊 Summary:');
  console.log('='.repeat(60));
  console.log(`✓ Total models: ${addedCount}`);
  console.log(`✓ Free models: ${freeModels.length}`);
  console.log(`✓ Paid models: ${paidModels.length}`);
  console.log('\nBy API Style:');
  for (const [style, models] of Object.entries(byApiStyle)) {
    const freeCount = models.filter(m => m.isFree).length;
    console.log(`  ${style}: ${models.length} models (${freeCount} free)`);
  }
  console.log('\n✅ OpenCode Zen models seeded successfully!');
}

seedOpenCodeZenModels()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
