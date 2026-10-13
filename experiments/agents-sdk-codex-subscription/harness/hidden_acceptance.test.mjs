import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readdirSync } from 'node:fs';

const appRoot = process.env.MINIAPP_WORKSPACE;
if (!appRoot) throw new Error('MINIAPP_WORKSPACE is required');
const { allocateShares } = await import(pathToFileURL(path.join(appRoot, 'split.mjs')).href);

test('split allocates every cent exactly once and distributes remainder fairly', () => {
  assert.deepEqual(allocateShares(1001, 3), [334, 334, 333]);
  assert.equal(allocateShares(1001, 3).reduce((sum, cents) => sum + cents, 0), 1001);
});

test('split rejects invalid totals and party counts', () => {
  assert.throws(() => allocateShares(-1, 2));
  assert.throws(() => allocateShares(100, 0));
});

test('the Mini App includes its own visible tests', () => {
  const visibleTests = readdirSync(appRoot).filter(name => name.endsWith('.test.mjs'));
  assert.ok(visibleTests.length > 0, 'add at least one app-owned *.test.mjs file');
});
