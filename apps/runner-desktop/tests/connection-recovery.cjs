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
      } }, event: { listen: async () => {} } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href);
    await page.locator('#connect-button').click();
    await page.waitForFunction(() => document.getElementById('connection-notice').textContent.includes('ผูกกับบัญชี SmartAIHub อื่น'));
    assert.match(await page.locator('#connection-notice').textContent(), /เจ้าของเดิม/);
  } finally {
    await browser.close();
  }
});

test('a start-request 403 is not misreported as an account ownership denial', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__TAURI__ = { core: { invoke: async name => {
        if (name === 'runner_status') return {
          credentialsReady: true, controlPlaneConnected: false, running: false,
          stopping: false, runnerId: 'local-runner', credentialState: 'valid', readiness: {},
        };
        if (name === 'list_workspaces' || name === 'discover_local_tools') return [];
        if (name === 'connect_runner') throw 'RUNNER_CONNECT_START_REJECTED_403';
        return null;
      } }, event: { listen: async () => {} } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href);
    await page.locator('#connect-button').click();
    await page.waitForFunction(() => document.getElementById('connection-notice').textContent.includes('ก่อนถึงหน้าอนุมัติ'));
    const message = await page.locator('#connection-notice').textContent();
    assert.doesNotMatch(message, /ผูกกับบัญชี SmartAIHub อื่น|เจ้าของเดิม/);
  } finally {
    await browser.close();
  }
});

test('a stale heartbeat is shown as reconnecting when the local control loop has failed', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__TAURI__ = { core: { invoke: async name => {
        if (name === 'runner_status') return {
          credentialsReady: true,
          controlPlaneConnected: true,
          running: true,
          stopping: false,
          runnerId: 'local-runner',
          credentialState: 'valid',
          lastError: 'RUNNER_CONNECTION_INTERRUPTED',
          lastControlPlaneHeartbeatAcknowledgedAtMs: Date.now() - 30_000,
          readiness: { capabilityPublicationState: 'pending' },
        };
        if (name === 'list_workspaces' || name === 'discover_local_tools') return [];
        return null;
      } }, event: { listen: async () => {} } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href);
    await page.waitForFunction(() => document.getElementById('connection-state').textContent === 'กำลังเชื่อมต่อใหม่');
    assert.match(await page.locator('#connection-detail').textContent(), /heartbeat ล่าสุด/);
    assert.match(await page.locator('#runtime-notice').textContent(), /Runner จะลองใหม่อัตโนมัติ/);
  } finally {
    await browser.close();
  }
});

test('a confirmed reconnect clears the error and restores the running UI without restarting the app', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.runnerRecovered = false;
      window.retryCount = 0;
      window.__TAURI__ = { core: { invoke: async name => {
        if (name === 'runner_status' || name === 'retry_runner_credentials') return {
          credentialsReady: true, controlPlaneConnected: window.runnerRecovered,
          running: true, stopping: false, runnerId: 'local-runner', credentialState: 'valid',
          lastError: window.runnerRecovered ? null : 'RUNNER_CONNECTION_INTERRUPTED',
          lastControlPlaneHeartbeatAcknowledgedAtMs: Date.now(),
          readiness: { capabilityPublicationState: 'pending' },
        };
        if (name === 'retry_runner_control') { window.retryCount += 1; return null; }
        if (name === 'list_workspaces' || name === 'discover_local_tools') return [];
        return null;
      } }, event: { listen: async () => {} } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href);
    await page.waitForFunction(() => document.getElementById('runtime-state').textContent === 'พบข้อผิดพลาด');
    assert.equal(await page.locator('#start-button').textContent(), 'ลองเชื่อมต่ออีกครั้ง');
    await page.locator('#start-button').click();
    assert.equal(await page.evaluate(() => window.retryCount), 1);
    await page.evaluate(() => { window.runnerRecovered = true; });
    await page.locator('#refresh-button').click();
    await page.waitForFunction(() => document.getElementById('connection-state').textContent === 'เชื่อมต่อแล้ว');
    assert.equal(await page.locator('#runtime-state').textContent(), 'กำลังทำงาน');
    assert.doesNotMatch(await page.locator('#runtime-notice').textContent(), /การเชื่อมต่อขาดหาย/);
    assert.equal(await page.locator('#stop-button').isEnabled(), true);
  } finally {
    await browser.close();
  }
});

test('the automatic Runner loop setting can be saved independently of login startup', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.startupPreferences = { login: false, loop: false, starts: 0 };
      window.__TAURI__ = { core: { invoke: async (name, args) => {
        if (name === 'runner_status') return {
          credentialsReady: true, controlPlaneConnected: false, running: false, stopping: false,
          runnerId: 'local-runner', credentialState: 'valid', readiness: {},
          autoStartEnabled: window.startupPreferences.login,
          autoStartRunnerLoop: window.startupPreferences.loop,
        };
        if (name === 'set_auto_start_runner_loop') window.startupPreferences.loop = args.enabled;
        if (name === 'set_auto_start') window.startupPreferences.login = args.enabled;
        if (name === 'start_runner') window.startupPreferences.starts += 1;
        if (name === 'list_workspaces' || name === 'discover_local_tools') return [];
        return null;
      } }, event: { listen: async () => {} } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href);
    await page.locator('#auto-start-loop').check();
    await page.waitForFunction(() => window.startupPreferences.loop);
    assert.equal(await page.locator('#auto-start').isChecked(), false);
    assert.equal(await page.evaluate(() => window.startupPreferences.starts), 0);
    await page.locator('#auto-start-loop').uncheck();
    await page.waitForFunction(() => !window.startupPreferences.loop);
  } finally {
    await browser.close();
  }
});
