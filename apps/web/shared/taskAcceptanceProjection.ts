import type { GoalProgressInput, GoalProgressProjection } from "./taskGoalProgress";
import { projectGoalProgress } from "./taskGoalProgress";
import type { TaskUsageEvidenceCall, UsageEvidenceAggregate } from "./taskUsageEvidence";
import { aggregateUsageEvidence } from "./taskUsageEvidence";

export type AcceptanceReferenceKind = "goal" | "work_unit" | "job" | "run" | "attempt" | "pull_request" | "commit" | "evidence";

export type AcceptanceVerificationStatus = "verified" | "unverified" | "missing" | "unknown";

export type AcceptanceReference = Readonly<{
  kind: AcceptanceReferenceKind;
  id: string;
  verificationStatus?: AcceptanceVerificationStatus;
  specId?: string;
  requirementIds?: readonly string[];
  sourceSha?: string;
  acceptance?: Readonly<{
    sourceSha: string;
    testsPassed: number;
    totalTests: number;
    status: string;
    environment: string;
    authentication: "simulated" | "verified" | "unknown";
  }>;
}>;

export type AcceptanceLink = Readonly<{
  from: AcceptanceReference;
  to: AcceptanceReference;
}>;

export type TaskAcceptanceInput = Readonly<{
  scope: Readonly<{ kind: "task" | "pilot" | "spec" | "project"; id: string }>;
  reported: Readonly<{
    state: string;
    basis: string | null;
    evidenceStatus: "verified" | "unverified" | "missing";
  }>;
  goal: Readonly<{
    input: GoalProgressInput;
    baselineSource: "trusted" | "unverified" | "missing";
  }>;
  parentClosure: Readonly<{
    closedCount: number | null;
    totalCount: number | null;
    status: "complete" | "incomplete" | "unknown";
  }>;
  remainingRequirements: readonly string[];
  graph: Readonly<{
    available: readonly AcceptanceReference[];
    links: readonly AcceptanceLink[];
  }>;
  verification: Readonly<{
    testsPassed: number | null;
    totalTests: number | null;
    testFiles: number | null;
    sourceSha: string | null;
    status: "passed" | "failed" | "unknown";
  }>;
  acceptanceEnvironment: Readonly<{
    kind: "simulated_auth" | "local_fixture" | "live_production" | "unknown";
    authStatus: "simulated" | "verified" | "unknown";
  }>;
  sdkUsage: Readonly<{
    calls: readonly TaskUsageEvidenceCall[];
    asOf: string | null;
    freshness: "current" | "stale" | "unknown";
    freshnessReason: string | null;
  }>;
  assistantAndConductorUsage: Readonly<{
    status: "known" | "unknown";
    reason: string | null;
  }>;
  goalCounter: Readonly<{
    status: "current" | "stale" | "unknown";
    value: number | null;
    asOf: string | null;
  }>;
  releaseObservations: readonly Readonly<{
    receiptId: string;
    state: "released" | "held" | "failed" | "unknown";
    observedAt: string | null;
  }>[];
}>;

export type TaskAcceptanceProjection = Readonly<{
  scope: TaskAcceptanceInput["scope"];
  reported: TaskAcceptanceInput["reported"];
  scopeCompletionStatus: "complete" | "incomplete" | "unknown";
  wholeSpecComplete: boolean | null;
  verifiedLiveAcceptance: boolean;
  goal: Readonly<{
    status: GoalProgressProjection["status"];
    reason: string | null;
    verifiedPercent: number | null;
    verifiedPercentLabel: string;
    requiredCriteriaComplete: boolean;
    projection: GoalProgressProjection;
  }>;
  parentClosure: TaskAcceptanceInput["parentClosure"];
  remainingRequirements: readonly string[];
  graph: Readonly<{
    references: readonly AcceptanceReference[];
    missingKinds: readonly AcceptanceReferenceKind[];
    links: readonly AcceptanceLink[];
    missingLinks: readonly AcceptanceLink[];
  }>;
  verification: TaskAcceptanceInput["verification"] & Readonly<{ testPassRate: number | null }>;
  acceptanceEnvironment: TaskAcceptanceInput["acceptanceEnvironment"];
  sdkUsage: Readonly<{
    freshness: TaskAcceptanceInput["sdkUsage"]["freshness"];
    asOf: string | null;
    freshnessReason: string | null;
    historical: UsageEvidenceAggregate;
    current: UsageEvidenceAggregate | null;
  }>;
  assistantAndConductorUsage: TaskAcceptanceInput["assistantAndConductorUsage"];
  goalCounter: TaskAcceptanceInput["goalCounter"];
  releaseObservations: TaskAcceptanceInput["releaseObservations"];
  billingSettlement: Readonly<{
    status: "evidence_observed" | "unknown";
    receipts: ReadonlyArray<UsageEvidenceAggregate["settlements"][number]>;
  }>;
}>;

function referenceKey(reference: AcceptanceReference): string {
  return `${reference.kind}\u0000${reference.id}`;
}

export function formatVerifiedPercentLabel(goal: GoalProgressProjection): string {
  const percent = goal.verifiedGoalCompletion.percent;
  if (percent === null) return "Unknown";
  if (!goal.verifiedGoalCompletion.requiredCriteriaComplete && percent >= 99.99) {
    return "<100% (required criteria pending)";
  }
  if (percent < 100 && Number(percent.toFixed(6)) === 100) return "<100%";
  return `${Number(percent.toFixed(6))}%`;
}

/**
 * Pure bounded acceptance projection. Inputs must come from an authorized
 * read adapter; this module neither authenticates sources nor persists state.
 */
export function projectTaskAcceptance(input: TaskAcceptanceInput): TaskAcceptanceProjection {
  const trustedGoalInput: GoalProgressInput = input.goal.baselineSource === "trusted"
    ? input.goal.input
    : { baseline: null, observations: [] };
  const projectedGoal = projectGoalProgress(trustedGoalInput);
  // A contradictory acceptance result cannot leave a previously verified 100% visible.
  const goal: GoalProgressProjection = input.verification.status === "failed" && projectedGoal.verifiedGoalCompletion.percent === 100
    ? { ...projectedGoal, status: "EVIDENCE_CONFLICT", reason: "acceptance_result_conflict", verifiedGoalCompletion: { ...projectedGoal.verifiedGoalCompletion, percent: null, requiredCriteriaComplete: false } }
    : projectedGoal;
  const referenceByKey = new Map<string, AcceptanceReference>();
  for (const reference of input.graph.available) {
    const key = referenceKey(reference);
    const existing = referenceByKey.get(key);
    if (!existing) {
      referenceByKey.set(key, reference);
    } else if (existing.verificationStatus !== reference.verificationStatus ||
        existing.sourceSha !== reference.sourceSha || existing.specId !== reference.specId ||
        JSON.stringify(existing.requirementIds) !== JSON.stringify(reference.requirementIds) ||
        JSON.stringify(existing.acceptance) !== JSON.stringify(reference.acceptance)) {
      referenceByKey.set(key, { kind: existing.kind, id: existing.id, verificationStatus: "unknown" });
    }
  }
  const references = [...referenceByKey.values()];
  const availableKeys = new Set(references.map(referenceKey));
  const expectedKinds: readonly AcceptanceReferenceKind[] = ["goal", "work_unit", "run", "attempt", "pull_request", "commit", "evidence"];
  const availableKinds = new Set(references.map((reference) => reference.kind));
  const missingKinds = expectedKinds.filter((kind) => !availableKinds.has(kind));
  const missingLinks = input.graph.links.filter((link) =>
    !availableKeys.has(referenceKey(link.from)) || !availableKeys.has(referenceKey(link.to)),
  );
  const historical = aggregateUsageEvidence(input.sdkUsage.calls);
  const snapshotTimeKnown = input.sdkUsage.asOf !== null && Number.isFinite(Date.parse(input.sdkUsage.asOf));
  const freshness = input.sdkUsage.freshness === "current" && !snapshotTimeKnown ? "unknown" : input.sdkUsage.freshness;
  const current = freshness === "current" ? historical : null;
  const baselineTrusted = input.goal.baselineSource === "trusted";
  const verifiedPercent = baselineTrusted ? goal.verifiedGoalCompletion.percent : null;
  const scopeComplete = Boolean(
    baselineTrusted &&
    goal.status === "PROJECTED" &&
    goal.verifiedGoalCompletion.requiredCriteriaComplete &&
    verifiedPercent === 100 &&
    input.verification.status !== "failed" &&
    input.reported.evidenceStatus === "verified" &&
    input.reported.state.trim().toUpperCase() === "COMPLETE",
  );
  const scopeCompletionStatus = !baselineTrusted
    ? "unknown" as const
    : scopeComplete ? "complete" as const : "incomplete" as const;
  const validTestCounts = Number.isSafeInteger(input.verification.testsPassed) && input.verification.testsPassed! >= 0 &&
    Number.isSafeInteger(input.verification.totalTests) && input.verification.totalTests! > 0 &&
    input.verification.testsPassed! <= input.verification.totalTests!;
  const testPassRate = validTestCounts
    ? input.verification.testsPassed! / input.verification.totalTests! * 100
    : null;
  const settlementReceipts = historical.settlements;

  return {
    scope: input.scope,
    reported: input.reported,
    scopeCompletionStatus,
    wholeSpecComplete: input.scope.kind === "spec" && scopeCompletionStatus !== "unknown" ? scopeComplete : null,
    verifiedLiveAcceptance: Boolean(
      scopeComplete && input.verification.status === "passed" && validTestCounts &&
      input.verification.testsPassed === input.verification.totalTests &&
      Boolean(input.verification.sourceSha?.trim()) &&
      input.acceptanceEnvironment.kind === "live_production" &&
      input.acceptanceEnvironment.authStatus === "verified",
    ),
    goal: {
      status: goal.status,
      reason: input.goal.baselineSource === "trusted" ? goal.reason ?? null : `baseline_${input.goal.baselineSource}`,
      verifiedPercent,
      verifiedPercentLabel: baselineTrusted ? formatVerifiedPercentLabel(goal) : "Unknown",
      requiredCriteriaComplete: baselineTrusted && goal.verifiedGoalCompletion.requiredCriteriaComplete,
      projection: goal,
    },
    parentClosure: input.parentClosure,
    remainingRequirements: [...input.remainingRequirements],
    graph: { references, missingKinds, links: [...input.graph.links], missingLinks },
    verification: { ...input.verification, testPassRate },
    acceptanceEnvironment: input.acceptanceEnvironment,
    sdkUsage: {
      freshness,
      asOf: input.sdkUsage.asOf,
      freshnessReason: freshness !== input.sdkUsage.freshness ? "snapshot_time_unknown" : input.sdkUsage.freshnessReason,
      historical,
      current,
    },
    assistantAndConductorUsage: input.assistantAndConductorUsage,
    goalCounter: input.goalCounter,
    releaseObservations: [...input.releaseObservations],
    billingSettlement: {
      status: settlementReceipts.length > 0 ? "evidence_observed" : "unknown",
      receipts: settlementReceipts,
    },
  };
}

export type AcceptanceComparisonEvidence = Readonly<{
  workloadId: string;
  contractRevision: string;
  acceptanceEnvironment: string;
  sourceRevision: string | null;
  effectiveModel: string | null;
  outcome: Readonly<{ status: "verified" | "unverified" | "unknown"; identity: string | null }>;
  usage: Readonly<{
    current: boolean;
    completeTotalTokens: number | null;
    callIdentities: readonly string[];
    callIdentitiesVerified: boolean;
  }>;
  funding: string | null;
  latencyBasis: string | null;
  latencyMs: number | null;
}>;

export type AcceptanceComparison = Readonly<{
  comparable: boolean;
  reasons: readonly string[];
  leftModel: string | null;
  rightModel: string | null;
  tokenDelta: number | null;
  latencyDeltaMs: number | null;
}>;

/** Compares only evidence with a matching workload/contract/environment and known metrics. */
export function compareTaskAcceptanceEvidence(
  left: AcceptanceComparisonEvidence,
  right: AcceptanceComparisonEvidence,
): AcceptanceComparison {
  const reasons: string[] = [];
  const hasText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && !/^(unknown|unverified|missing|n\/a)$/i.test(value.trim());
  const validTokens = (value: number | null) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const validLatency = (value: number | null) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  const validCallIdentities = (evidence: AcceptanceComparisonEvidence) => {
    const ids = evidence.usage.callIdentities;
    return evidence.usage.callIdentitiesVerified && ids.length > 0 && ids.every(hasText) && new Set(ids.map((id) => id.trim())).size === ids.length;
  };
  for (const evidence of [left, right]) {
    if (!hasText(evidence.workloadId)) reasons.push("workload_unknown");
    if (!hasText(evidence.contractRevision)) reasons.push("contract_revision_unknown");
    if (!hasText(evidence.acceptanceEnvironment)) reasons.push("acceptance_environment_unknown");
  }
  if (hasText(left.workloadId) && hasText(right.workloadId) && left.workloadId !== right.workloadId) reasons.push("workload_mismatch");
  if (hasText(left.contractRevision) && hasText(right.contractRevision) && left.contractRevision !== right.contractRevision) reasons.push("contract_revision_mismatch");
  if (hasText(left.acceptanceEnvironment) && hasText(right.acceptanceEnvironment) && left.acceptanceEnvironment !== right.acceptanceEnvironment) reasons.push("acceptance_environment_mismatch");
  if (!hasText(left.sourceRevision) || !hasText(right.sourceRevision)) reasons.push("source_revision_unknown");
  else if (left.sourceRevision !== right.sourceRevision) reasons.push("source_revision_mismatch");
  if (!hasText(left.effectiveModel) || !hasText(right.effectiveModel)) reasons.push("effective_model_unknown");
  if (left.outcome.status !== "verified" || right.outcome.status !== "verified" || !hasText(left.outcome.identity) || !hasText(right.outcome.identity)) reasons.push("outcome_unverified");
  if (!left.usage.current || !right.usage.current) reasons.push("usage_not_current");
  if (!validTokens(left.usage.completeTotalTokens) || !validTokens(right.usage.completeTotalTokens)) reasons.push("usage_incomplete_or_invalid");
  if (!validCallIdentities(left) || !validCallIdentities(right)) reasons.push("call_identities_unverified");
  if (!hasText(left.funding) || !hasText(right.funding)) reasons.push("funding_unknown");
  else if (left.funding !== right.funding) reasons.push("funding_mismatch");
  if (!hasText(left.latencyBasis) || !hasText(right.latencyBasis)) reasons.push("latency_basis_unknown");
  else if (left.latencyBasis !== right.latencyBasis) reasons.push("latency_basis_mismatch");
  if (!validLatency(left.latencyMs) || !validLatency(right.latencyMs)) reasons.push("latency_unknown_or_invalid");
  return {
    comparable: reasons.length === 0,
    reasons,
    leftModel: left.effectiveModel,
    rightModel: right.effectiveModel,
    tokenDelta: reasons.length === 0 ? right.usage.completeTotalTokens! - left.usage.completeTotalTokens! : null,
    latencyDeltaMs: reasons.length === 0 ? right.latencyMs! - left.latencyMs! : null,
  };
}
