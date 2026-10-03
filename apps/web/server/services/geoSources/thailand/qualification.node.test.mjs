import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getThailandProviderPack, isThailandCapabilityQualified } from './manifest.ts';

const requiredBlockers = new Set([
  'ENDPOINT_UNVERIFIED', 'AUTHENTICATION_UNVERIFIED', 'SCHEMA_UNVERIFIED',
  'CADENCE_UNVERIFIED', 'RIGHTS_UNVERIFIED', 'LICENSE_UNVERIFIED',
  'ATTRIBUTION_UNVERIFIED', 'COVERAGE_UNVERIFIED', 'RETENTION_UNVERIFIED',
  'ADAPTER_NOT_IMPLEMENTED',
]);

describe('Thailand provider qualification gate', () => {
  it('keeps every researched candidate blocked with field-level evidence gaps', () => {
    const pack = getThailandProviderPack();
    assert.equal(pack.status, 'CANDIDATE_CATALOG_ONLY');
    assert.ok(pack.sources.length > 0);
    for (const source of pack.sources) {
      assert.equal(source.endpointReference, null);
      for (const blocker of requiredBlockers) assert.ok(source.qualificationBlockers.includes(blocker), `${source.sourceId} missing ${blocker}`);
      for (const capability of source.capabilities) {
        assert.equal(isThailandCapabilityQualified(source, capability, {}), false);
      }
    }
  });

  it('does not mistake the RID SWOC documentation URL for an acquisition endpoint', () => {
    const source = getThailandProviderPack().sources.find(item => item.sourceId === 'th-rid-swoc-operations');
    assert.ok(source);
    assert.match(source.researchUrl, /\/api\/docs\/?$/);
    assert.equal(source.endpointReference, null);
    assert.ok(source.qualificationBlockers.includes('ENDPOINT_UNVERIFIED'));
    assert.ok(source.qualificationBlockers.includes('AUTHENTICATION_UNVERIFIED'));
  });

  it('requires explicit authentication evidence even when the other provider checks pass', () => {
    const { sources } = getThailandProviderPack();
    const source = sources[0];
    const capability = source.capabilities[0];
    const evidence = {
      endpointVerified: true, accessVerified: true, contractFixtureVerified: true,
      schemaVerified: true, cadenceVerified: true, rightsGranted: true,
      attributionVerified: true, coverageVerified: true,
      licenseRef: 'https://provider.example/license', attribution: 'Provider attribution',
      expectedCadenceSeconds: 300, staleAfterSeconds: 900,
      retentionClass: 'operational-30d', verifiedGeographies: ['TH-10'],
    };
    assert.equal(isThailandCapabilityQualified(source, capability, evidence, 'TH-10'), false);
    assert.equal(isThailandCapabilityQualified(source, capability, { ...evidence, authenticationVerified: true }, 'TH-10'), true);
  });
});
