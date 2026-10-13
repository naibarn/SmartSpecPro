import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateShares } from './split.mjs';

test('allocates each cent exactly once and gives remainder cents to earliest people', () => {
  assert.deepEqual(allocateShares(1001, 3), [334, 334, 333]);
  assert.deepEqual(allocateShares(10, 4), [3, 3, 2, 2]);
  assert.equal(allocateShares(1001, 3).reduce((sum, share) => sum + share, 0), 1001);
});

test('supports one person and the maximum party size', () => {
  assert.deepEqual(allocateShares(99, 1), [99]);
  const shares = allocateShares(1001, 1000);
  assert.equal(shares.length, 1000);
  assert.equal(shares.reduce((sum, share) => sum + share, 0), 1001);
});

test('rejects invalid totals and people counts', () => {
  for (const total of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => allocateShares(total, 2));
  for (const people of [0, -1, 1.5, 1001, NaN]) assert.throws(() => allocateShares(100, people));
});
