const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { chromium } = require('@playwright/test');

test('account re-pair reports an owner-binding denial instead of a generic connection error', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__TAURI__ = { core: { invoke: async name => {
        if (name === 'runner_status') return {
          credentialsReady: true,
          controlPlaneConnected: false,
          running: false,
          stopping: false,
          runnerId: 'local-runner',
          credentialState: 'valid',
          readiness: {},
        };
        if (name === 'list_workspaces' || name === 'discover_local_tools') return [];
        if (name === 'connect_runner') throw 'RUNNER_PERMISSION_DENIED';
        return null;
      } } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href);
    await page.locator('#connect-button').click();
    await page.waitForFunction(() => document.getElementById('connection-notice').textContent.includes('ผูกกับบัญชี SmartAIHub อื่น'));
    assert.match(await page.locator('#connection-notice').textContent(), /เจ้าของเดิม/);
  } finally {
    await browser.close();
  }
});
