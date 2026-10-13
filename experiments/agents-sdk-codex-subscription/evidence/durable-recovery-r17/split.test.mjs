import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateShares } from './split.mjs';

test('allocates all cents and assigns remainder to the first people', () => {
  assert.deepEqual(allocateShares(1001, 3), [334, 334, 333]);
  assert.deepEqual(allocateShares(1, 3), [1, 0, 0]);
  assert.equal(allocateShares(1001, 3).reduce((sum, share) => sum + share, 0), 1001);
});

test('accepts supported totals and people counts only', () => {
  for (const total of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => allocateShares(total, 2));
  }
  for (const people of [0, -1, 1.5, 1001]) {
    assert.throws(() => allocateShares(100, people));
  }
  assert.equal(allocateShares(100, 1).length, 1);
  assert.equal(allocateShares(100, 1000).length, 1000);
});
