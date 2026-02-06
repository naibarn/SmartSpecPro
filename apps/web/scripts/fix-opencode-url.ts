#!/usr/bin/env tsx
/**
 * Fix OpenCode Zen Base URL
 *
 * The correct base URL should be: https://opencode.ai/zen/v1
 * Not: https://open-api.zen.com
 */

import { getDb } from '../server/db';
import { llmProviders } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

async function fixOpenCodeUrl() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  console.log('🔧 Fixing OpenCode Zen Base URL...\n');

  // Check current config
  const [currentProvider] = await db
    .select()
    .from(llmProviders)
    .where(eq(llmProviders.providerName, 'opencode-zen'));

  if (!currentProvider) {
    console.error('❌ OpenCode Zen provider not found!');
    process.exit(1);
  }

  console.log('Current Base URL:', currentProvider.baseUrl);

  const correctUrl = 'https://opencode.ai/zen/v1';

  if (currentProvider.baseUrl === correctUrl) {
    console.log('✅ Base URL is already correct!');
    process.exit(0);
  }

  // Update the base URL
  await db
    .update(llmProviders)
    .set({ baseUrl: correctUrl })
    .where(eq(llmProviders.providerName, 'opencode-zen'));

  console.log('✅ Updated Base URL to:', correctUrl);

  // Verify the update
  const [updatedProvider] = await db
    .select()
    .from(llmProviders)
    .where(eq(llmProviders.providerName, 'opencode-zen'));

  console.log('\n📋 Updated Configuration:');
  console.log('Provider Name:', updatedProvider.providerName);
  console.log('Base URL:', updatedProvider.baseUrl);
  console.log('Is Enabled:', updatedProvider.isEnabled);
  console.log('Has API Key:', updatedProvider.hasApiKey);
}

fixOpenCodeUrl()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
