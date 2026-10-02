import { describe, expect, it } from 'vitest';
import {
  canPromoteModelCanary,
  canUseModelForSafetyProduct,
  createModelReplayBundle,
  decideModelRecovery,
  verifyModelReplayBundle,
  type ModelDefinition,
  type ModelExecutionRecord,
} from '../../../packages/shared/src/emergency/modelGovernance';

const digest = (char: string) => char.repeat(64);
const approved: ModelDefinition = {
  modelRef: 'hydro-baseline', modelFamily: 'hydrology', version: '2.1.0', purpose: 'HYDROLOGY',
  executableArtifactRef: 'artifact://hydro/2.1.0', artifactDigest: digest('a'), runtimeProfileRef: 'runtime/node-22',
  dependencyLockRef: 'lock://hydro/2.1.0', inputSchemaVersion: 'hydro-input/v3', outputSchemaVersion: 'hydro-output/v2',
  validityEnvelopeRef: 'validity/thailand/v1', verificationProfileRefs: ['verify/hydro/v2'], state: 'APPROVED',
};
const execution: ModelExecutionRecord = {
  executionRef: 'exec-01', modelRef: approved.modelRef, exactModelVersion: approved.version, artifactDigest: approved.artifactDigest,
  configurationRef: 'config/7', inputManifestRef: 'input/42', outputManifestRef: 'output/42', runtimeRef: 'runtime/node-22',
  startedAt: '2026-10-01T00:00:00.000Z', completedAt: '2026-10-01T00:00:01.000Z',
};

describe('modelGovernance', () => {
  it('requires exact version, artifact, runtime, config and input/output provenance for safety use', () => {
    expect(canUseModelForSafetyProduct(approved, execution)).toEqual({ eligible: true, reasons: [] });
    expect(canUseModelForSafetyProduct(approved, { ...execution, artifactDigest: digest('b') })).toMatchObject({ eligible: false });
    expect(canUseModelForSafetyProduct({ ...approved, state: 'CANARY' }, execution).reasons).toContain('MODEL_NOT_APPROVED');
    expect(canUseModelForSafetyProduct(approved, { ...execution, completedAt: undefined }).reasons).toContain('EXECUTION_INCOMPLETE');
  });

  it('blocks canary promotion until verification, scope, budget and human policy approval are all present', () => {
    const base = { verificationPassed: true, withinValidityEnvelope: true, budgetWithinLimit: true, approvedByPolicyRef: 'policy/release-4' };
    expect(canPromoteModelCanary({ ...base, currentState: 'CANARY' })).toEqual({ eligible: true, reasons: [] });
    expect(canPromoteModelCanary({ ...base, currentState: 'SHADOW', verificationPassed: false }).reasons).toContain('VERIFICATION_REQUIRED');
    expect(canPromoteModelCanary({ ...base, currentState: 'CANARY', approvedByPolicyRef: undefined }).eligible).toBe(false);
  });

  it('creates immutable replay references and verifies bundle identity and component integrity', () => {
    const bundle = createModelReplayBundle({
      bundleRef: 'replay/exec-01', execution, model: approved,
      componentDigests: { input: digest('1'), output: digest('2'), configuration: digest('3'), runtime: digest('4') },
      manifestDigest: digest('f'), byteLength: 4096,
    });
    const proof = {
      model: approved, execution,
      actualComponentDigests: { input: digest('1'), output: digest('2'), configuration: digest('3'), runtime: digest('4') },
      actualManifestDigest: digest('f'), actualByteLength: 4096,
    };
    expect(verifyModelReplayBundle(bundle, proof)).toEqual({ valid: true, reasons: [] });
    expect(verifyModelReplayBundle({ ...bundle, modelArtifactDigest: digest('b') }, proof).reasons).toContain('MODEL_ARTIFACT_MISMATCH');
    expect(verifyModelReplayBundle(bundle, { ...proof, actualComponentDigests: { ...proof.actualComponentDigests, output: digest('9') } }).reasons).toContain('REPLAY_COMPONENT_MISMATCH');
    expect(verifyModelReplayBundle(bundle, { ...proof, actualManifestDigest: digest('e') }).valid).toBe(false);
  });

  it('supports rollback to a prior verified artifact without promoting canary output', () => {
    expect(decideModelRecovery({ activeModelRef: 'hydro-v3', failedModelRef: 'hydro-v3', priorModelRef: 'hydro-v2', priorArtifactVerified: true }))
      .toEqual({ action: 'ROLLBACK', pinnedModelRef: 'hydro-v2', publicOutputAllowed: true });
    expect(decideModelRecovery({ activeModelRef: 'hydro-v3', failedModelRef: 'hydro-v3', priorModelRef: 'hydro-v2', priorArtifactVerified: false }))
      .toEqual({ action: 'DEGRADE', publicOutputAllowed: false });
    expect(decideModelRecovery({ activeModelRef: 'hydro-v3', failedModelRef: 'canary-v4', priorModelRef: 'hydro-v2', priorArtifactVerified: true }))
      .toEqual({ action: 'ISOLATE_CANARY', pinnedModelRef: 'hydro-v3', publicOutputAllowed: true });
  });
});
