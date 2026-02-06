import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { llmProviders } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '../server/services/crypto';

async function testOpenCodeZen() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('DATABASE_URL not set');
    return;
  }

  const client = postgres(dbUrl);
  const db = drizzle(client);

  const [zen] = await db.select().from(llmProviders).where(eq(llmProviders.providerName, 'opencode-zen')).limit(1);

  if (!zen || !zen.apiKeyEncrypted) {
    console.log('OpenCode Zen provider not found or no API key');
    await client.end();
    return;
  }

  const apiKey = decrypt(zen.apiKeyEncrypted);
  if (!apiKey) {
    console.log('Failed to decrypt API key');
    await client.end();
    return;
  }

  const baseUrl = (zen.baseUrl || '').replace(/\/+$/, '');
  const chatUrl = baseUrl.includes('/v1') ? baseUrl + '/chat/completions' : baseUrl + '/v1/chat/completions';

  console.log('Testing OpenCode Zen at:', chatUrl);
  console.log('');

  // Test different models: GLM, Kimi, MiniMax, and other potential models
  const modelsToTest = [
    // GLM models
    'glm-4.7-free',
    'glm-4.7',
    'glm-4.6',
    // Kimi models
    'kimi-k2.5-free',
    'kimi-k2.5',
    'kimi-k2',
    'kimi-k2-thinking',
    // MiniMax models
    'minimax-m2.1-free',
    'minimax-m2.1',
    // Trinity (if available)
    'trinity-large-preview-free',
    // Other potential models
    'gpt-5.2',
    'gpt-5.1',
    'qwen3-coder',
    'big-pickle',
  ];

  const results: { model: string; status: 'success' | 'failed' | 'error'; message: string }[] = [];

  for (const model of modelsToTest) {
    process.stdout.write(`Testing: ${model.padEnd(30)}`);

    try {
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Say hi in one word' }],
          max_tokens: 10,
        }),
      });

      const data = await response.json() as any;

      if (response.ok) {
        const content = data.choices?.[0]?.message?.content || 'No content';
        console.log(`✓ OK - "${content.substring(0, 30)}"`);
        results.push({ model, status: 'success', message: content.substring(0, 30) });
      } else {
        const errMsg = data?.error?.message || JSON.stringify(data).substring(0, 60);
        console.log(`✗ FAILED - ${errMsg}`);
        results.push({ model, status: 'failed', message: errMsg });
      }
    } catch (error: any) {
      console.log(`✗ ERROR - ${error.message}`);
      results.push({ model, status: 'error', message: error.message });
    }
  }

  console.log('\n--- Summary ---');
  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status !== 'success');

  console.log(`\n✓ Working models (${successful.length}):`);
  for (const r of successful) {
    console.log(`   ${r.model}`);
  }

  if (failed.length > 0) {
    console.log(`\n✗ Failed models (${failed.length}):`);
    for (const r of failed) {
      console.log(`   ${r.model}: ${r.message.substring(0, 50)}`);
    }
  }

  await client.end();
}

testOpenCodeZen().catch(console.error);
