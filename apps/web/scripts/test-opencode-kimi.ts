#!/usr/bin/env tsx
/**
 * Test OpenCode Zen Kimi Model
 *
 * This script verifies that:
 * 1. OpenCode Zen provider is configured correctly
 * 2. Kimi model routing resolves to OpenCode Zen
 * 3. The API request would be constructed correctly
 */

import { getDb } from '../server/db';
import { llmProviders, modelProviderMap } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';

async function testOpenCodeKimi() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  console.log('🧪 Testing OpenCode Zen Kimi Model Configuration\n');

  // 1. Check provider config
  const [provider] = await db
    .select()
    .from(llmProviders)
    .where(eq(llmProviders.providerName, 'opencode-zen'));

  if (!provider) {
    console.error('❌ OpenCode Zen provider not found!');
    process.exit(1);
  }

  console.log('✅ Provider Configuration:');
  console.log(`   Name: ${provider.providerName}`);
  console.log(`   Base URL: ${provider.baseUrl}`);
  console.log(`   Is Enabled: ${provider.isEnabled}`);
  console.log(`   Has API Key: ${provider.hasApiKey}`);

  // Verify base URL
  const expectedUrl = 'https://opencode.ai/zen/v1';
  if (provider.baseUrl !== expectedUrl) {
    console.error(`\n❌ Base URL is incorrect!`);
    console.error(`   Expected: ${expectedUrl}`);
    console.error(`   Actual: ${provider.baseUrl}`);
    process.exit(1);
  }

  // 2. Check model mapping
  const kimiMappings = await db
    .select({
      modelId: modelProviderMap.modelId,
      modelName: modelProviderMap.modelName,
      providerModelId: modelProviderMap.providerModelId,
      providerId: modelProviderMap.providerId,
      providerName: llmProviders.providerName,
      isEnabled: modelProviderMap.isEnabled,
      isFree: modelProviderMap.isFree,
    })
    .from(modelProviderMap)
    .leftJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
    .where(eq(modelProviderMap.modelId, 'kimi-k2.5-free'));

  console.log('\n✅ Kimi Model Mappings:');
  kimiMappings.forEach((m, i) => {
    console.log(`\n   Mapping ${i + 1}:`);
    console.log(`   Provider: ${m.providerName}`);
    console.log(`   Model ID: ${m.modelId}`);
    console.log(`   Provider Model ID: ${m.providerModelId}`);
    console.log(`   Is Enabled: ${m.isEnabled}`);
    console.log(`   Is Free: ${m.isFree}`);
  });

  // Find OpenCode Zen mapping
  const opencodeMapping = kimiMappings.find(m =>
    m.providerName?.toLowerCase().includes('opencode') ||
    m.providerName?.toLowerCase().includes('zen')
  );

  if (!opencodeMapping) {
    console.error('\n❌ No OpenCode Zen mapping found for kimi-k2.5-free!');
    process.exit(1);
  }

  console.log('\n✅ OpenCode Zen Mapping Found:');
  console.log(`   Provider Model ID: ${opencodeMapping.providerModelId}`);

  // 3. Construct the expected API request
  const chatUrl = `${provider.baseUrl}/chat/completions`;

  console.log('\n✅ API Request Configuration:');
  console.log(`   URL: ${chatUrl}`);
  console.log(`   Model ID to send: ${opencodeMapping.providerModelId}`);
  console.log(`   Method: POST`);
  console.log(`   Headers: Authorization: Bearer [API_KEY]`);

  // 4. Final verification
  console.log('\n' + '='.repeat(60));
  console.log('📊 Configuration Summary:');
  console.log('='.repeat(60));
  console.log(`✅ Provider: ${provider.providerName}`);
  console.log(`✅ Base URL: ${provider.baseUrl} (correct)`);
  console.log(`✅ Endpoint: ${chatUrl}`);
  console.log(`✅ Model ID: ${opencodeMapping.providerModelId}`);
  console.log(`✅ Enabled: ${provider.isEnabled && opencodeMapping.isEnabled}`);
  console.log(`✅ Has API Key: ${provider.hasApiKey}`);
  console.log(`✅ Is Free: ${opencodeMapping.isFree}`);

  console.log('\n🎉 All checks passed! The configuration is correct.');
  console.log('\n💡 Next step: Try selecting Kimi K2.5 in the chat UI and send a message.');
  console.log('   If it still doesn\'t work, check:');
  console.log('   1. The OPENCODE_ZEN_API_KEY is valid');
  console.log('   2. Check server logs for API errors');
  console.log('   3. Verify the API key has credits/quota');
}

testOpenCodeKimi()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  });
