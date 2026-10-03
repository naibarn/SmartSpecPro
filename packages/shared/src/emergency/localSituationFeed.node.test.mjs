import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeLocalSituationFeed, getFeedPlacement } from './feedSemantics.ts';

const source = (overrides = {}) => ({
  kind: 'situation', publicRef: 'S-1', title: 'Flood situation', status: 'active',
  severity: 'moderate', freshness: 'current', observedAt: '2026-10-03T04:00:00.000Z',
  updatedAt: '2026-10-03T04:00:00.000Z', spatialRelation: 'IN_VIEWPORT', ...overrides,
});

describe('Spec 260 local situation feed projection', () => {
  it('preserves critical published alerts outside the ordinary digest budget with source lineage', () => {
    const input = [
      ...Array.from({ length: 6 }, (_, index) => source({ publicRef: `S-${index}`, title: `Situation ${index}` })),
      source({ kind: 'alert', publicRef: 'A-CRIT', situationRef: 'S-CRIT', title: 'Evacuate now', severity: 'critical', status: 'published', freshness: 'current' }),
    ];
    const feed = composeLocalSituationFeed(input, { budget: 5, generatedAt: '2026-10-03T04:01:00.000Z' });
    assert.equal(feed.items[0].publicRef, 'A-CRIT');
    assert.equal(feed.items[0].lane, 'CRITICAL_SAFETY');
    assert.equal(feed.items[0].provenance.sourceRef, 'A-CRIT');
    assert.equal(feed.items[0].provenance.publisher, 'AUTHORIZED_EMERGENCY_OPERATIONS');
    assert.equal(feed.items.some(item => item.publicRef === 'A-CRIT'), true);
  });

  it('only projects the emergency source families present in the map API and marks placements honestly', () => {
    const feed = composeLocalSituationFeed([
      source({ kind: 'facility', publicRef: 'F-1', title: 'Water point', status: 'open', severity: 'unknown', freshness: 'stale' }),
      source({ kind: 'situation', publicRef: 'S-1' }),
    ], { generatedAt: '2026-10-03T04:01:00.000Z' });
    assert.deepEqual(new Set(feed.items.map(item => item.lane)), new Set(['LOCAL_UTILITY', 'LOCAL_SITUATION']));
    assert.ok(feed.items.every(item => item.placement.type === 'ORGANIC' && item.placement.label === null));
    assert.deepEqual(getFeedPlacement(true), { type: 'SPONSORED', label: 'Sponsored' });
  });
});
