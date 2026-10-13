import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { allocateShares, dollarsToCents } from './split.mjs';

test('allocates remainder cents fairly and reconciles exactly', () => {
  const shares = allocateShares(1001, 3);
  assert.deepEqual(shares, [334, 334, 333]);
  assert.equal(shares.reduce((sum, share) => sum + share, 0), 1001);
});

test('supports one person and the maximum party size', () => {
  assert.deepEqual(allocateShares(99, 1), [99]);
  const shares = allocateShares(1000, 1000);
  assert.equal(shares.length, 1000);
  assert.equal(shares.reduce((sum, share) => sum + share, 0), 1000);
});

test('accepts positive bills and rounds them to whole cents', () => {
  assert.equal(dollarsToCents('0.001'), 0);
  assert.equal(dollarsToCents('1.005'), 101);
  assert.equal(dollarsToCents('0'), null);
  assert.equal(dollarsToCents('-0.01'), null);
  assert.equal(dollarsToCents('not money'), null);
});

test('rejects invalid totals and people counts', () => {
  for (const total of [0, -1, 1.5, NaN]) assert.throws(() => allocateShares(total, 2));
  for (const people of [0, -1, 1.5, 1001, NaN]) assert.throws(() => allocateShares(100, people));
});

test('shows the required fields, actions, and results section', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<label for="bill-total">Bill total<\/label>/);
  assert.match(html, /aria-label="Bill total in dollars"/);
  assert.match(html, /<label for="people">Number of people<\/label>/);
  assert.match(html, /type="submit"/);
  assert.match(html, /type="reset"/);
  assert.match(html, /id="results"/);
});
