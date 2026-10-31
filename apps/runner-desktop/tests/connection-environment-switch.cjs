const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { chromium } = require('@playwright/test');

test('a saved different website offers an explicit restart and does not reuse old-site credentials', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.calls = [];
      window.confirm = () => true;
      window.__TAURI__ = { core: { invoke: async name => {
        window.calls.push(name);
        if (name === 'runner_status') return {
          credentialsReady: true, controlPlaneConnected: true, running: true, stopping: false,
          runnerId: 'local-runner', credentialState: 'valid', connectionEnvironment: 'developer',
          activeServerUrl: 'https://smartaihub.app', readiness: { capabilityPublicationState: 'acknowledged' },
        };
        if (name === 'list_workspaces' || name === 'discover_local_tools') return [];
        return null;
      } }, event: { listen: async () => {} } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href);

    const button = page.locator('#connect-button');
    assert.equal(await button.isEnabled(), true);
    assert.match(await button.textContent(), /รีสตาร์ท|เริ่มใหม่|Developer/);
    await button.click();
    await page.waitForFunction(() => window.calls.includes('restart_runner_for_saved_environment'));
    assert.equal(await page.evaluate(() => window.calls.filter(name => name === 'connect_runner').length), 0);
  } finally {
    await browser.close();
  }
});

test('canceling the environment restart leaves the current Runner untouched', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.calls = [];
      window.confirm = () => false;
      window.__TAURI__ = { core: { invoke: async name => {
        window.calls.push(name);
        if (name === 'runner_status') return {
          credentialsReady: true, controlPlaneConnected: true, running: true, stopping: false,
          runnerId: 'local-runner', credentialState: 'valid', connectionEnvironment: 'developer',
          activeServerUrl: 'https://smartaihub.app', readiness: {},
        };
        if (name === 'list_workspaces' || name === 'discover_local_tools') return [];
        return null;
      } }, event: { listen: async () => {} } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href);
    await page.locator('#connect-button').click();
    assert.equal(await page.evaluate(() => window.calls.includes('restart_runner_for_saved_environment')), false);
    assert.equal(await page.evaluate(() => window.calls.includes('connect_runner')), false);
  } finally {
    await browser.close();
  }
});
