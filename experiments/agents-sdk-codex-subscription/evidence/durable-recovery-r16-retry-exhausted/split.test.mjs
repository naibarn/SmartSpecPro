import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateShares } from './split.mjs';

test('allocates remainder cents to the first people and sums exactly', () => {
  const shares = allocateShares(1001, 3);
  assert.deepEqual(shares, [334, 334, 333]);
  assert.equal(shares.reduce((sum, share) => sum + share, 0), 1001);
});

test('allocates evenly when there is no remainder', () => {
  assert.deepEqual(allocateShares(1200, 4), [300, 300, 300, 300]);
});

test('rejects invalid totals and people counts', () => {
  assert.throws(() => allocateShares(0, 1));
  assert.throws(() => allocateShares(1.5, 1));
  assert.throws(() => allocateShares(10, 0));
  assert.throws(() => allocateShares(10, 1001));
});
