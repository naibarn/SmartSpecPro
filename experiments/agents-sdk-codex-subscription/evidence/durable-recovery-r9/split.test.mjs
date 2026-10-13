import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateShares } from './split.mjs';

test('allocates every cent exactly once and distributes remainder fairly', () => {
  const shares = allocateShares(1001, 3);
  assert.deepEqual(shares, [334, 334, 333]);
  assert.equal(shares.reduce((sum, share) => sum + share, 0), 1001);
});

test('allocates evenly when there is no remainder', () => {
  assert.deepEqual(allocateShares(1200, 4), [300, 300, 300, 300]);
});

test('rejects invalid totals and party counts', () => {
  for (const total of [0, -1, 1.5, NaN]) assert.throws(() => allocateShares(total, 2));
  for (const people of [0, -1, 1.5, 1001, NaN]) assert.throws(() => allocateShares(100, people));
});
