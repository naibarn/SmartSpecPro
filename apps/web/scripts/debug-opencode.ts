#!/usr/bin/env tsx
import { getDb } from '../server/db';
import { llmProviders, modelProviderMap } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

async function debugOpenCode() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Check OpenCode Zen provider config
  const [provider] = await db.select().from(llmProviders).where(eq(llmProviders.providerName, 'opencode-zen'));

  console.log('📋 OpenCode Zen Provider Config:');
  console.log('Provider Name:', provider?.providerName);
  console.log('Display Name:', provider?.displayName);
  console.log('Base URL:', provider?.baseUrl);
  console.log('Has API Key:', provider?.hasApiKey);
  console.log('API Key (encrypted):', provider?.apiKeyEncrypted ? '***set***' : 'NOT SET');
  console.log('Is Enabled:', provider?.isEnabled);
  console.log('Default Model:', provider?.defaultModel);
  console.log('Available Models:', provider?.availableModels?.length || 0);
  if (provider?.availableModels && Array.isArray(provider.availableModels)) {
    console.log('\nAvailable Models:');
    provider.availableModels.forEach((m: any) => {
      console.log(`  - ${m.name} (${m.id})`);
    });
  }

  // Check Kimi model mapping
  const kimiModels = await db.select().from(modelProviderMap).where(eq(modelProviderMap.modelId, 'kimi-k2.5-free'));

  console.log('\n📋 Kimi Model Mapping:');
  if (kimiModels.length === 0) {
    console.log('❌ No mapping found for kimi-k2.5-free');
  } else {
    kimiModels.forEach(m => {
      console.log('Model ID:', m.modelId);
      console.log('Provider Model ID:', m.providerModelId);
      console.log('Provider ID:', m.providerId);
      console.log('Is Enabled:', m.isEnabled);
      console.log('Is Free:', m.isFree);
    });
  }

  // Check if there's an API key in environment
  const envKey = process.env.OPENCODE_ZEN_API_KEY;
  console.log('\n🔑 Environment Variable:');
  console.log('OPENCODE_ZEN_API_KEY:', envKey ? '***set***' : 'NOT SET');

  if (!provider?.hasApiKey && !envKey) {
    console.log('\n⚠️  WARNING: No API key configured for OpenCode Zen!');
    console.log('   Please set OPENCODE_ZEN_API_KEY in your .env file');
  }

  if (!provider?.isEnabled) {
    console.log('\n⚠️  WARNING: OpenCode Zen provider is not enabled!');
    console.log('   The provider needs hasApiKey=true and isEnabled=true to work');
  }
}

debugOpenCode()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
