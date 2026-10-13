import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateShares } from './split.mjs';

test('shares distribute remainder cents fairly and reconcile exactly', () => {
  assert.deepEqual(allocateShares(1001, 3), [334, 334, 333]);
  assert.deepEqual(allocateShares(100, 4), [25, 25, 25, 25]);
  const shares = allocateShares(12345, 17);
  assert.equal(shares.reduce((sum, cents) => sum + cents, 0), 12345);
  assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
});

test('rejects invalid totals and people counts', () => {
  for (const total of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => allocateShares(total, 2));
  }
  for (const people of [0, -1, 1.5, 1001, NaN, Infinity]) {
    assert.throws(() => allocateShares(100, people));
  }
});
