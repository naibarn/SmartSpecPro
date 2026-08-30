import {
  fingerprintLongFormPolicy,
  resolveLongFormMode,
  type LongFormRunExtension,
} from "@shared/verticalDramaSeries/longFormContracts";

export type LongFormDraftAdmissionInput = {
  blueprintId: string;
  blueprintFingerprint: string;
  targetEpisodeCount: number;
  relationshipGraphRevisionId?: string;
  relationshipGraphFingerprint?: string;
  relationshipDependencyIndexFingerprint?: string;
  relationshipRedactionPolicyVersion?: string;
  relationshipRedactionPolicyFingerprint?: string;
  componentFingerprints?: Partial<
    Record<
      "arcBlockPlan" | "cast" | "world" | "look" | "memorySnapshot",
      string
    >
  >;
  policyValues?: Record<string, unknown>;
  benchmarkFinalizationRef?: string;
};

export function createLongFormRunExtension(
  input: LongFormDraftAdmissionInput
): LongFormRunExtension {
  const mode = resolveLongFormMode(input.targetEpisodeCount);
  const missing = [
    ["relationshipGraphRevisionId", input.relationshipGraphRevisionId],
    ["relationshipGraphFingerprint", input.relationshipGraphFingerprint],
    [
      "relationshipDependencyIndexFingerprint",
      input.relationshipDependencyIndexFingerprint,
    ],
    [
      "relationshipRedactionPolicyVersion",
      input.relationshipRedactionPolicyVersion,
    ],
    [
      "relationshipRedactionPolicyFingerprint",
      input.relationshipRedactionPolicyFingerprint,
    ],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length)
    throw new Error(`long_form_graph_not_ready:${missing.join(",")}`);
  const components = input.componentFingerprints ?? {};
  const policies = input.policyValues ?? {};
  const policy = (key: string) =>
    fingerprintLongFormPolicy({ key, value: policies[key] ?? {} });
  return {
    blueprintId: input.blueprintId,
    blueprintFingerprint: input.blueprintFingerprint,
    mode: mode.mode,
    requestedEpisodeCount: mode.requestedEpisodeCount,
    recommendedEpisodeCount: mode.recommendedEpisodeCount,
    episodeDurationSeconds: 90,
    arcBlockPlanFingerprint: components.arcBlockPlan ?? policy("arcBlockPlan"),
    relationshipGraphRevisionId: input.relationshipGraphRevisionId as string,
    relationshipGraphFingerprint: input.relationshipGraphFingerprint as string,
    relationshipDependencyIndexFingerprint:
      input.relationshipDependencyIndexFingerprint as string,
    relationshipRedactionPolicyVersion:
      input.relationshipRedactionPolicyVersion as string,
    relationshipRedactionPolicyFingerprint:
      input.relationshipRedactionPolicyFingerprint as string,
    castFingerprint: components.cast ?? policy("cast"),
    worldFingerprint: components.world ?? policy("world"),
    lookFingerprint: components.look ?? policy("look"),
    memorySnapshotFingerprint:
      components.memorySnapshot ?? policy("memorySnapshot"),
    retryPolicyFingerprint: policy("retry"),
    sloPolicyFingerprint: policy("slo"),
    speechPolicyFingerprint: policy("speech"),
    benchmarkPolicyFingerprint: policy("benchmark"),
    antiDriftPolicyFingerprint: policy("antiDrift"),
    planChunkPolicyFingerprint: policy("planChunk"),
    executionPolicyFingerprint: policy("execution"),
    pricingSnapshotFingerprint: policy("pricing"),
    closurePolicyVersion: String(
      policies.closurePolicyVersion ?? "long-form-closure-v1"
    ),
    benchmarkFinalizationRef: input.benchmarkFinalizationRef,
  };
}

export function assertLongFormRunFingerprintStable(
  expected: LongFormRunExtension,
  actual: LongFormRunExtension
): void {
  const keys: Array<keyof LongFormRunExtension> = [
    "blueprintFingerprint",
    "arcBlockPlanFingerprint",
    "relationshipGraphFingerprint",
    "relationshipDependencyIndexFingerprint",
    "relationshipRedactionPolicyFingerprint",
    "castFingerprint",
    "worldFingerprint",
    "lookFingerprint",
    "memorySnapshotFingerprint",
    "retryPolicyFingerprint",
    "sloPolicyFingerprint",
    "speechPolicyFingerprint",
    "benchmarkPolicyFingerprint",
    "antiDriftPolicyFingerprint",
    "planChunkPolicyFingerprint",
    "executionPolicyFingerprint",
    "pricingSnapshotFingerprint",
  ];
  for (const key of keys)
    if (expected[key] !== actual[key])
      throw new Error(`stale_long_form_fingerprint:${String(key)}`);
}
