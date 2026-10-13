import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateShares } from './split.mjs';

test('distributes remainder cents to the earliest people', () => {
  assert.deepEqual(allocateShares(1001, 3), [334, 334, 333]);
});

test('allocates every cent exactly once', () => {
  const shares = allocateShares(12345, 17);
  assert.equal(shares.reduce((sum, share) => sum + share, 0), 12345);
  assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
});

test('rejects invalid totals and party counts', () => {
  for (const total of [0, -1, 1.5, NaN]) assert.throws(() => allocateShares(total, 2));
  for (const people of [0, -1, 1.5, 1001, NaN]) assert.throws(() => allocateShares(100, people));
});
