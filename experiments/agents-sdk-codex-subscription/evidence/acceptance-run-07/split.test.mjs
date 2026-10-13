import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateShares } from './split.mjs';

test('distributes remainder cents to the first people', () => {
  assert.deepEqual(allocateShares(1001, 3), [334, 334, 333]);
});

test('shares always sum to the bill total', () => {
  for (const [total, people] of [[1, 4], [9999, 7], [0, 3], [101, 1]]) {
    const shares = allocateShares(total, people);
    assert.equal(shares.length, people);
    assert.equal(shares.reduce((sum, share) => sum + share, 0), total);
    assert.ok(shares.every(Number.isInteger));
  }
});

test('rejects invalid totals and party sizes', () => {
  assert.throws(() => allocateShares(-1, 2));
  assert.throws(() => allocateShares(1.5, 2));
  assert.throws(() => allocateShares(10, 0));
  assert.throws(() => allocateShares(10, 2.5));
});
