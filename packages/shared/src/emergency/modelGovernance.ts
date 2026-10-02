/** Pure governance contracts for operational model release and audit replay.
 * These helpers validate supplied evidence; they do not execute, approve, or deploy models.
 */

export type OperationalModelState =
  | 'EXPERIMENTAL' | 'SHADOW' | 'CANARY' | 'APPROVED' | 'DEGRADED' | 'SUSPENDED' | 'RETIRED';

export type OperationalModelPurpose =
  | 'WEATHER' | 'HYDROLOGY' | 'INUNDATION' | 'ROUTING' | 'EXPOSURE' | 'CLASSIFICATION' | 'OTHER';

export interface ModelDefinition {
  readonly modelRef: string;
  readonly modelFamily: string;
  readonly version: string;
  readonly purpose: OperationalModelPurpose;
  readonly executableArtifactRef: string;
  readonly artifactDigest: string;
  readonly runtimeProfileRef: string;
  readonly dependencyLockRef?: string;
  readonly inputSchemaVersion: string;
  readonly outputSchemaVersion: string;
  readonly validityEnvelopeRef: string;
  readonly verificationProfileRefs: readonly string[];
  readonly state: OperationalModelState;
  readonly approvedByPolicyRef?: string;
}

export interface ModelExecutionRecord {
  readonly executionRef: string;
  readonly modelRef: string;
  readonly exactModelVersion: string;
  readonly artifactDigest: string;
  readonly configurationRef: string;
  readonly inputManifestRef: string;
  readonly outputManifestRef: string;
  readonly runtimeRef: string;
  readonly startedAt: string;
  readonly completedAt?: string;
}

export type ModelAdmissionFailure =
  | 'MODEL_NOT_APPROVED' | 'MODEL_IDENTITY_INCOMPLETE' | 'EXECUTION_MODEL_MISMATCH'
  | 'EXECUTION_ARTIFACT_MISMATCH' | 'EXECUTION_RUNTIME_MISMATCH' | 'EXECUTION_PROVENANCE_INCOMPLETE'
  | 'EXECUTION_INCOMPLETE' | 'EXECUTION_TIME_INVALID';

const isNonEmpty = (value: string | undefined): value is string => typeof value === 'string' && value.trim().length > 0;
const isSha256 = (value: string): boolean => /^[a-f0-9]{64}$/i.test(value);
const isDateTime = (value: string): boolean => Number.isFinite(Date.parse(value));

/** Safety products may consume only complete executions of an exact approved artifact. */
export function canUseModelForSafetyProduct(
  model: ModelDefinition,
  execution: ModelExecutionRecord,
): { readonly eligible: boolean; readonly reasons: readonly ModelAdmissionFailure[] } {
  const reasons: ModelAdmissionFailure[] = [];
  if (model.state !== 'APPROVED') reasons.push('MODEL_NOT_APPROVED');
  if (![model.modelRef, model.version, model.executableArtifactRef, model.runtimeProfileRef,
    model.inputSchemaVersion, model.outputSchemaVersion, model.validityEnvelopeRef].every(isNonEmpty) ||
    !isSha256(model.artifactDigest)) reasons.push('MODEL_IDENTITY_INCOMPLETE');
  if (execution.modelRef !== model.modelRef || execution.exactModelVersion !== model.version) reasons.push('EXECUTION_MODEL_MISMATCH');
  if (!isSha256(execution.artifactDigest) || execution.artifactDigest.toLowerCase() !== model.artifactDigest.toLowerCase()) reasons.push('EXECUTION_ARTIFACT_MISMATCH');
  if (!isNonEmpty(execution.runtimeRef) || execution.runtimeRef !== model.runtimeProfileRef) reasons.push('EXECUTION_RUNTIME_MISMATCH');
  if (![execution.executionRef, execution.configurationRef, execution.inputManifestRef, execution.outputManifestRef].every(isNonEmpty)) {
    reasons.push('EXECUTION_PROVENANCE_INCOMPLETE');
  }
  if (!execution.completedAt) reasons.push('EXECUTION_INCOMPLETE');
  if (!isDateTime(execution.startedAt) || (execution.completedAt && !isDateTime(execution.completedAt)) ||
    (execution.completedAt && Date.parse(execution.completedAt) < Date.parse(execution.startedAt))) reasons.push('EXECUTION_TIME_INVALID');
  return { eligible: reasons.length === 0, reasons };
}

export interface ModelCanaryPromotionInput {
  readonly currentState: OperationalModelState;
  readonly verificationPassed: boolean;
  readonly withinValidityEnvelope: boolean;
  readonly budgetWithinLimit: boolean;
  readonly approvedByPolicyRef?: string;
}

export type ModelCanaryPromotionFailure =
  | 'MODEL_NOT_IN_CANARY' | 'VERIFICATION_REQUIRED' | 'OUTSIDE_VALIDITY_ENVELOPE'
  | 'BUDGET_LIMIT_EXCEEDED' | 'POLICY_APPROVAL_REQUIRED';

/** Eligibility only; a caller still owns an audited state transition and rollout action. */
export function canPromoteModelCanary(input: ModelCanaryPromotionInput): {
  readonly eligible: boolean;
  readonly reasons: readonly ModelCanaryPromotionFailure[];
} {
  const reasons: ModelCanaryPromotionFailure[] = [];
  if (input.currentState !== 'CANARY') reasons.push('MODEL_NOT_IN_CANARY');
  if (!input.verificationPassed) reasons.push('VERIFICATION_REQUIRED');
  if (!input.withinValidityEnvelope) reasons.push('OUTSIDE_VALIDITY_ENVELOPE');
  if (!input.budgetWithinLimit) reasons.push('BUDGET_LIMIT_EXCEEDED');
  if (!isNonEmpty(input.approvedByPolicyRef)) reasons.push('POLICY_APPROVAL_REQUIRED');
  return { eligible: reasons.length === 0, reasons };
}

export interface ModelReplayBundle {
  readonly bundleRef: string;
  readonly executionRef: string;
  readonly modelRef: string;
  readonly exactModelVersion: string;
  readonly modelArtifactDigest: string;
  readonly configurationRef: string;
  readonly inputManifestRef: string;
  readonly outputManifestRef: string;
  readonly runtimeRef: string;
  readonly componentDigests: Readonly<Record<'input' | 'output' | 'configuration' | 'runtime', string>>;
  readonly manifestDigest: string;
  readonly byteLength: number;
}

/** Snapshot replay references; digest computation and persistence remain at the storage boundary. */
export function createModelReplayBundle(input: {
  readonly bundleRef: string;
  readonly execution: ModelExecutionRecord;
  readonly model: ModelDefinition;
  readonly componentDigests: ModelReplayBundle['componentDigests'];
  readonly manifestDigest: string;
  readonly byteLength: number;
}): ModelReplayBundle {
  return Object.freeze({
    bundleRef: input.bundleRef,
    executionRef: input.execution.executionRef,
    modelRef: input.execution.modelRef,
    exactModelVersion: input.execution.exactModelVersion,
    modelArtifactDigest: input.execution.artifactDigest,
    configurationRef: input.execution.configurationRef,
    inputManifestRef: input.execution.inputManifestRef,
    outputManifestRef: input.execution.outputManifestRef,
    runtimeRef: input.execution.runtimeRef,
    componentDigests: Object.freeze({ ...input.componentDigests }),
    manifestDigest: input.manifestDigest,
    byteLength: input.byteLength,
  });
}

export type ModelReplayFailure =
  | 'BUNDLE_IDENTITY_INCOMPLETE' | 'MODEL_ARTIFACT_MISMATCH' | 'REPLAY_COMPONENT_DIGEST_INVALID'
  | 'REPLAY_COMPONENT_MISMATCH' | 'REPLAY_MANIFEST_DIGEST_INVALID' | 'REPLAY_BYTE_LENGTH_INVALID' | 'REPLAY_MANIFEST_MISMATCH'
  | 'REPLAY_BYTE_LENGTH_MISMATCH';

export function verifyModelReplayBundle(
  bundle: ModelReplayBundle,
  actual: {
    readonly model: ModelDefinition;
    readonly execution: ModelExecutionRecord;
    readonly actualComponentDigests: ModelReplayBundle['componentDigests'];
    readonly actualManifestDigest: string;
    readonly actualByteLength: number;
  },
): { readonly valid: boolean; readonly reasons: readonly ModelReplayFailure[] } {
  const reasons: ModelReplayFailure[] = [];
  if (![bundle.bundleRef, bundle.executionRef, bundle.modelRef, bundle.exactModelVersion, bundle.configurationRef,
    bundle.inputManifestRef, bundle.outputManifestRef, bundle.runtimeRef].every(isNonEmpty)) reasons.push('BUNDLE_IDENTITY_INCOMPLETE');
  if (!isSha256(bundle.modelArtifactDigest) || bundle.modelArtifactDigest.toLowerCase() !== actual.model.artifactDigest.toLowerCase() ||
    bundle.modelArtifactDigest.toLowerCase() !== actual.execution.artifactDigest.toLowerCase() ||
    bundle.modelRef !== actual.model.modelRef || bundle.modelRef !== actual.execution.modelRef ||
    bundle.exactModelVersion !== actual.model.version || bundle.exactModelVersion !== actual.execution.exactModelVersion ||
    bundle.executionRef !== actual.execution.executionRef || bundle.configurationRef !== actual.execution.configurationRef ||
    bundle.inputManifestRef !== actual.execution.inputManifestRef || bundle.outputManifestRef !== actual.execution.outputManifestRef ||
    bundle.runtimeRef !== actual.execution.runtimeRef) reasons.push('MODEL_ARTIFACT_MISMATCH');
  if (!Object.values(bundle.componentDigests).every(isSha256)) reasons.push('REPLAY_COMPONENT_DIGEST_INVALID');
  if ((Object.keys(bundle.componentDigests) as Array<keyof ModelReplayBundle['componentDigests']>).some((key) =>
    !isSha256(actual.actualComponentDigests[key]) || actual.actualComponentDigests[key].toLowerCase() !== bundle.componentDigests[key].toLowerCase())) {
    reasons.push('REPLAY_COMPONENT_MISMATCH');
  }
  if (!isSha256(bundle.manifestDigest)) reasons.push('REPLAY_MANIFEST_DIGEST_INVALID');
  if (!Number.isSafeInteger(bundle.byteLength) || bundle.byteLength <= 0) reasons.push('REPLAY_BYTE_LENGTH_INVALID');
  if (!isSha256(actual.actualManifestDigest) || actual.actualManifestDigest.toLowerCase() !== bundle.manifestDigest.toLowerCase()) {
    reasons.push('REPLAY_MANIFEST_MISMATCH');
  }
  if (!Number.isSafeInteger(actual.actualByteLength) || actual.actualByteLength !== bundle.byteLength) reasons.push('REPLAY_BYTE_LENGTH_MISMATCH');
  return { valid: reasons.length === 0, reasons };
}

export type ModelRecoveryDecision =
  | { readonly action: 'ROLLBACK'; readonly pinnedModelRef: string; readonly publicOutputAllowed: true }
  | { readonly action: 'ISOLATE_CANARY'; readonly pinnedModelRef: string; readonly publicOutputAllowed: true }
  | { readonly action: 'DEGRADE'; readonly publicOutputAllowed: false };

/** Decide a fail-closed recovery posture. This does not itself pin deployments or publish output. */
export function decideModelRecovery(input: {
  readonly activeModelRef: string;
  readonly failedModelRef: string;
  readonly priorModelRef?: string;
  readonly priorArtifactVerified: boolean;
}): ModelRecoveryDecision {
  if (input.failedModelRef !== input.activeModelRef && isNonEmpty(input.activeModelRef)) {
    return { action: 'ISOLATE_CANARY', pinnedModelRef: input.activeModelRef, publicOutputAllowed: true };
  }
  if (isNonEmpty(input.priorModelRef) && input.priorArtifactVerified) {
    return { action: 'ROLLBACK', pinnedModelRef: input.priorModelRef, publicOutputAllowed: true };
  }
  return { action: 'DEGRADE', publicOutputAllowed: false };
}
