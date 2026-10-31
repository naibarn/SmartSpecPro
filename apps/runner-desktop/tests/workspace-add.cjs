const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { chromium } = require('@playwright/test');

test('does not report a selected folder as added when the workspace list cannot reload', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.fixture = { listCalls: 0, added: false };
      window.__TAURI__ = { core: { invoke: async name => {
        if (name === 'runner_status') return {
          credentialsReady: true, controlPlaneConnected: true, running: false, stopping: false,
          runnerId: 'local-runner', credentialState: 'valid', readiness: {},
        };
        if (name === 'list_workspaces') {
          window.fixture.listCalls += 1;
          if (window.fixture.added) throw 'RUNNER_WORKSPACE_REGISTRY_SCOPE_MISMATCH';
          return [];
        }
        if (name === 'discover_local_tools') return [];
        if (name === 'add_workspace') {
          window.fixture.added = true;
          return { workspaceId: 'ws-spec224', displayName: 'spec224-live-pilot', localPath: 'D:\\Projects\\spec224-live-pilot' };
        }
        return null;
      } }, event: { listen: async () => {} } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href);
    await page.waitForFunction(() => window.fixture.listCalls > 0);
    await page.locator('#add-workspace-button').click();
    await page.waitForFunction(() => window.fixture.added && window.fixture.listCalls > 1);
    assert.match(await page.locator('#runtime-notice').textContent(), /RUNNER_WORKSPACE_REGISTRY_SCOPE_MISMATCH/);
    assert.doesNotMatch(await page.locator('#runtime-notice').textContent(), /เพิ่ม spec224-live-pilot แล้ว/);
    assert.equal(await page.locator('#workspace-list .workspace-row').count(), 0);
  } finally {
    await browser.close();
  }
});

test('shows the selected folder in the workspace list and selector after registration', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.fixture = { workspaces: [] };
      window.__TAURI__ = { core: { invoke: async (name, args) => {
        if (name === 'runner_status') return {
          credentialsReady: true, controlPlaneConnected: true, running: false, stopping: false,
          runnerId: 'local-runner', credentialState: 'valid', readiness: {},
        };
        if (name === 'list_workspaces') {
          return window.fixture.workspaces.map(workspace => args.mode === 'developer' ? workspace : {
            workspaceId: workspace.workspaceId, displayName: workspace.displayName,
          });
        }
        if (name === 'discover_local_tools') return [];
        if (name === 'add_workspace') {
          const workspace = { workspaceId: 'ws-spec224', displayName: 'spec224-live-pilot', localPath: 'D:\\Projects\\spec224-live-pilot' };
          window.fixture.workspaces.push(workspace);
          return workspace;
        }
        return null;
      } }, event: { listen: async () => {} } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href);
    await page.locator('#add-workspace-button').click();
    await page.waitForFunction(() => document.querySelector('#workspace-list .workspace-row'));
    assert.equal(await page.locator('#workspace-list .workspace-row .workspace-name > p').textContent(), 'spec224-live-pilot');
    assert.equal(await page.locator('#default-workspace option[value="ws-spec224"]').count(), 1);
    assert.match(await page.locator('#runtime-notice').textContent(), /เพิ่ม spec224-live-pilot แล้ว/);
  } finally {
    await browser.close();
  }
});
