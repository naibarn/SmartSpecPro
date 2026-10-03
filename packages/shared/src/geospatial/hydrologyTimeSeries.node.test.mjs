import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHydrologyTrendReader, deriveHydroMaterialChange } from './hydrologyTimeSeries.ts';

const policy = {
  revision: 'trend-v1', minSamples: 2, windowSeconds: 3600, staleAfterSeconds: 900,
  stableDelta: 0.1, slightDelta: 0.4, rapidDelta: 1.0,
};

describe('hydrology event-time read and material-change contracts', () => {
  it('queries one bounded tenant/station/variable event-time window and represents empty history as unknown', async () => {
    const calls = [];
    const reader = createHydrologyTrendReader({ readByEventTime: async query => {
      calls.push(query);
      return [
        { observedAt: '2026-10-03T03:10:00.000Z', value: 1, quality: 'valid', freshness: 'current', unit: 'm' },
        { observedAt: '2026-10-03T03:50:00.000Z', value: 1.8, quality: 'valid', freshness: 'current', unit: 'm' },
      ];
    } });
    const result = await reader({ tenantId: 'tenant-1', stationId: 'station-1', variableCode: 'water_level', policy, now: '2026-10-03T04:00:00.000Z' });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      tenantId: 'tenant-1', stationId: 'station-1', variableCode: 'water_level',
      fromObservedAt: '2026-10-03T03:00:00.000Z', throughObservedAt: '2026-10-03T04:00:00.000Z',
      order: 'observedAt-desc', limit: 500,
    });
    assert.equal(result.trend.label, 'RISING');
    assert.equal(result.trend.delta, 0.8);
    assert.equal(result.coverageState, 'DATA_AVAILABLE');

    const emptyReader = createHydrologyTrendReader({ readByEventTime: async () => [] });
    const empty = await emptyReader({ tenantId: 'tenant-1', stationId: 'station-1', variableCode: 'water_level', policy, now: '2026-10-03T04:00:00.000Z' });
    assert.equal(empty.coverageState, 'NO_OBSERVATIONS');
    assert.equal(empty.trend.label, 'UNKNOWN');
  });

  it('emits a stable material-change key only for policy-relevant transitions', () => {
    const common = { tenantId: 'tenant-1', stationId: 'station-1', metric: 'water_level', policyRevision: 'material-v2' };
    const event = deriveHydroMaterialChange({
      ...common,
      previous: { thresholdBand: 'below', trend: 'STABLE', freshness: 'current' },
      current: { observationRef: 'obs-22', sourceRevision: 'rev-8', thresholdBand: 'above', trend: 'RAPIDLY_RISING', freshness: 'current' },
    });
    assert.equal(event.kind, 'THRESHOLD_CROSSED');
    assert.match(event.idempotencyKey, /obs-22/);
    assert.deepEqual(deriveHydroMaterialChange({
      ...common,
      previous: { thresholdBand: 'below', trend: 'STABLE', freshness: 'current' },
      current: { observationRef: 'obs-23', sourceRevision: 'rev-9', thresholdBand: 'below', trend: 'STABLE', freshness: 'current' },
    }), null);
  });
});
