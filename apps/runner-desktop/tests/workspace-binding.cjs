// Local UI acceptance with a simulated Tauri bridge; never live Runner evidence.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { chromium } = require('@playwright/test');

test('workspace form rejects running edits, preserves inputs, saves and clears explicit IDs', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.fixture = { running: true, calls: [], projectId: null, repositoryId: null };
      window.__TAURI__ = { core: { invoke: async (name, args) => {
        const state = window.fixture;
        state.calls.push({ name, args });
        if (name === 'runner_status') return { connected: true, running: state.running, credentialState: 'ready' };
        if (name === 'list_workspaces') return [{ workspaceId: 'ws-1', displayName: 'Workspace <script>', localPath: 'C:\\repo',
          facts: { projectId: state.projectId, repositoryId: state.repositoryId, gitHead: 'a'.repeat(40), gitBranch: 'main', dirty: false } }];
        if (name === 'bind_workspace_identity') {
          if (state.running) throw 'RUNNER_WORKSPACE_BINDING_REQUIRES_STOP';
          state.projectId = args.projectId;
          state.repositoryId = args.repositoryId;
          return null;
        }
        if (name === 'stop_runner') { state.running = false; return null; }
        if (name === 'rescan_runner') return [];
        throw `UNEXPECTED_${name}`;
      } } };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href);
    const project = page.getByLabel('Project ID', { exact: true });
    const repository = page.getByLabel('Repository ID', { exact: true });
    const save = page.getByRole('button', { name: 'บันทึก Project / Repository' });
    await project.fill('project-real');
    await repository.fill('org/repo');
    await save.click();
    await page.waitForFunction(() => document.getElementById('runtime-notice').textContent.includes('หยุด Runner ก่อนเปลี่ยน'));
    assert.equal(await project.inputValue(), 'project-real');
    await page.locator('#stop-button').click();
    await save.click();
    await page.waitForFunction(() => window.fixture.projectId === 'project-real');
    await page.waitForFunction(() => document.querySelector('.workspace-binding button')?.disabled === false);
    assert.equal(await repository.inputValue(), 'org/repo');
    await project.fill('');
    await repository.fill('');
    await save.click();
    await page.waitForFunction(() => window.fixture.projectId === null && window.fixture.repositoryId === null);
    assert.equal(await page.locator('#workspace-list script').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
