/**
 * Evidence-based health projection for an existing agent run. This is an
 * advisory projection, not another execution lifecycle or permission gate.
 */

export type AgentProgressStatus =
  | "WORKING"
  | "PROGRESSING"
  | "STALLED"
  | "LOOPING"
  | "REGRESSING"
  | "RECOVERING"
  | "COMPLETED"
  | "PARTIAL"
  | "BLOCKED"
  | "FAILED"
  | "CANCELLED";

export type AgentProgressEvidenceKind =
  | "verified_work_unit"
  | "accepted_receipt"
  | "verified_artifact"
  | "test_result"
  | "deployment_result"
  | "other_verified_outcome";

export type AgentProgressTaskProfile =
  | "interactive"
  | "standard"
  | "long_running"
  | "provider_job";

export interface AgentProgressEvidence {
  tenantId: string;
  evidenceRef: string;
  kind: AgentProgressEvidenceKind;
  status: "verified" | "pending" | "invalidated";
}

export interface AgentProgressCriterion {
  criterionId: string;
  required: boolean;
  weight: number;
  status: "pending" | "verified" | "invalidated";
  evidenceRefs: string[];
}

export interface AgentProgressToolCall {
  tenantId: string;
  toolName: string;
  /** Caller-supplied SHA-256 of canonicalized allow-listed arguments. */
  argumentDigest: string;
  /** True only when a verifier accepted a new, task-bound effect. */
  producedVerifiedEvidence: boolean;
}

export interface AgentProgressInput {
  tenantId: string;
  taskId?: string;
  executionStatus: "queued" | "running" | "completed" | "failed" | "cancelled";
  recoveryStatus: "none" | "in_progress" | "exhausted";
  taskProfile: AgentProgressTaskProfile;
  nowMs: number;
  lastHeartbeatAtMs: number | null;
  lastMeaningfulProgressAtMs: number | null;
  /** The existing task-class policy owns adaptive windows; this projection owns none. */
  stallWindowMsByTaskProfile: Record<AgentProgressTaskProfile, number>;
  loopDetectionMinRepeats: number;
  previousProgress?: number;
  previousPeakProgress: number;
  activeExternalOperation?: boolean;
  waitingOn?: { kind: string; dependencyRef: string } | null;
  requiredCriteria: AgentProgressCriterion[];
  evidence: AgentProgressEvidence[];
  previousVerifiedEvidenceRefs: Array<{ tenantId: string; evidenceRef: string }>;
  invalidatedEvidenceRefs: Array<{ tenantId: string; evidenceRef: string }>;
  toolCalls: AgentProgressToolCall[];
}

export interface AgentProgressAssessment {
  status: AgentProgressStatus;
  progress: number;
  runningPeakProgress: number;
  progressDelta: number;
  verifiedEvidenceCount: number;
  verifiedRequiredCriteria: number;
  requiredCriteriaCount: number;
  reasonCodes: string[];
  recoveryRecommended: boolean;
}

const DIGEST = /^[a-f0-9]{64}$/i;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function validRef(value: string): boolean {
  return value.trim().length > 0 && value.length <= 512;
}

function hasNoEffectLoop(input: AgentProgressInput): boolean {
  if (!Number.isSafeInteger(input.loopDetectionMinRepeats) || input.loopDetectionMinRepeats < 2) {
    return false;
  }
  const repeats = new Map<string, number>();
  for (const call of input.toolCalls) {
    if (call.tenantId !== input.tenantId || !DIGEST.test(call.argumentDigest)) continue;
    const key = `${call.toolName}\u0000${call.argumentDigest.toLowerCase()}`;
    if (call.producedVerifiedEvidence) {
      repeats.set(key, 0);
      continue;
    }
    repeats.set(key, (repeats.get(key) ?? 0) + 1);
  }
  return [...repeats.values()].some(count => count >= input.loopDetectionMinRepeats);
}

function isStalled(input: AgentProgressInput): boolean {
  const stallWindowMs = input.stallWindowMsByTaskProfile[input.taskProfile];
  if (
    input.activeExternalOperation ||
    hasValidWait(input.waitingOn) ||
    input.lastHeartbeatAtMs === null ||
    input.lastMeaningfulProgressAtMs === null ||
    !Number.isFinite(input.nowMs) ||
    !Number.isFinite(input.lastHeartbeatAtMs) ||
    !Number.isFinite(input.lastMeaningfulProgressAtMs) ||
    !Number.isFinite(stallWindowMs) ||
    stallWindowMs <= 0
  ) {
    return false;
  }
  return (
    input.nowMs - input.lastHeartbeatAtMs >= stallWindowMs &&
    input.nowMs - input.lastMeaningfulProgressAtMs >= stallWindowMs
  );
}

function hasValidWait(
  waitingOn: AgentProgressInput["waitingOn"],
): waitingOn is { kind: string; dependencyRef: string } {
  return Boolean(
    waitingOn &&
    typeof waitingOn.kind === "string" &&
    waitingOn.kind.trim() &&
    validRef(waitingOn.dependencyRef),
  );
}

export function assessAgentProgress(input: AgentProgressInput): AgentProgressAssessment {
  const invalidatedRefs = new Set(
    input.invalidatedEvidenceRefs
      .filter(item => item.tenantId === input.tenantId && validRef(item.evidenceRef))
      .map(item => item.evidenceRef),
  );
  const previousVerifiedRefs = new Set(
    input.previousVerifiedEvidenceRefs
      .filter(item => item.tenantId === input.tenantId && validRef(item.evidenceRef))
      .map(item => item.evidenceRef),
  );
  const evidence = input.evidence.filter(
    item =>
      item.tenantId === input.tenantId &&
      item.status === "verified" &&
      validRef(item.evidenceRef) &&
      !invalidatedRefs.has(item.evidenceRef),
  );
  const evidenceRefs = new Set(evidence.map(item => item.evidenceRef));
  const requiredCriteria = input.requiredCriteria.filter(item => item.required);
  const fulfilledCriteria = requiredCriteria.filter(
    item =>
      item.status === "verified" &&
      item.evidenceRefs.length > 0 &&
      item.evidenceRefs.every(ref => evidenceRefs.has(ref)),
  );
  const totalWeight = requiredCriteria.reduce(
    (sum, item) => sum + (Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 0),
    0,
  );
  const fulfilledWeight = fulfilledCriteria.reduce(
    (sum, item) => sum + (Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 0),
    0,
  );
  const progress = totalWeight > 0
    ? clampUnit(fulfilledWeight / totalWeight)
    : evidence.length > 0
      ? 1
      : 0;
  const previousProgress = clampUnit(
    input.previousProgress ?? input.previousPeakProgress,
  );
  const progressDelta = progress - previousProgress;
  const runningPeakProgress = Math.max(
    clampUnit(input.previousPeakProgress),
    progress,
  );
  const invalidated = [...invalidatedRefs].some(
    item =>
      previousVerifiedRefs.has(item),
  );
  const complete =
    input.executionStatus === "completed" &&
    !invalidated &&
    evidence.length > 0 &&
    fulfilledCriteria.length === requiredCriteria.length;

  let status: AgentProgressStatus;
  const reasonCodes: string[] = [];

  if (input.executionStatus === "cancelled") {
    status = "CANCELLED";
    reasonCodes.push("execution_cancelled");
  } else if (input.recoveryStatus === "in_progress") {
    status = "RECOVERING";
    reasonCodes.push("recovery_in_progress");
  } else if (input.executionStatus === "failed") {
    if (input.recoveryStatus === "exhausted") {
      status = "FAILED";
      reasonCodes.push("recovery_exhausted");
    } else {
      status = "BLOCKED";
      reasonCodes.push("recovery_not_exhausted");
    }
  } else if (complete) {
    status = "COMPLETED";
    reasonCodes.push("required_outcomes_verified");
  } else if (invalidated) {
    status = "REGRESSING";
    reasonCodes.push("verified_evidence_invalidated");
  } else if (hasValidWait(input.waitingOn)) {
    status = "BLOCKED";
    reasonCodes.push("external_dependency_wait");
  } else if (input.executionStatus === "completed") {
    status = "PARTIAL";
    reasonCodes.push(
      evidence.length === 0 ? "outcome_evidence_missing" : "required_outcomes_unverified",
    );
  } else if (progressDelta > 0) {
    status = "PROGRESSING";
    reasonCodes.push("verified_progress_delta");
  } else if (hasNoEffectLoop(input)) {
    status = "LOOPING";
    reasonCodes.push("repeated_tool_call_without_verified_effect");
  } else if (isStalled(input)) {
    status = "STALLED";
    reasonCodes.push("stale_heartbeat_and_no_evidence_progress");
  } else {
    status = "WORKING";
    reasonCodes.push(
      input.activeExternalOperation ? "external_operation_in_flight" : "execution_active",
    );
  }

  return {
    status,
    progress,
    runningPeakProgress,
    progressDelta,
    verifiedEvidenceCount: evidence.length,
    verifiedRequiredCriteria: fulfilledCriteria.length,
    requiredCriteriaCount: requiredCriteria.length,
    reasonCodes,
    recoveryRecommended: status === "STALLED" || status === "LOOPING" || status === "REGRESSING",
  };
}

export type OptionalQualityEvaluationStatus =
  | "completed"
  | "budget_exceeded"
  | "skipped_budget"
  | "timed_out"
  | "unavailable";

export interface OptionalQualityEvaluationResult<T> {
  status: OptionalQualityEvaluationStatus;
  value?: T;
  durationMs: number;
}

/** Optional judges are bounded and fail-open: their result never controls execution. */
export async function runOptionalQualityEvaluation<T>(input: {
  budgetMs: number;
  maxTokens: number;
  evaluate: (context: { signal: AbortSignal; maxTokens: number }) => Promise<{
    value: T;
    tokensUsed: number;
  }>;
  now?: () => number;
}): Promise<OptionalQualityEvaluationResult<T>> {
  const clock = input.now ?? Date.now;
  const startedAt = clock();
  if (
    !Number.isFinite(input.budgetMs) ||
    input.budgetMs <= 0 ||
    !Number.isSafeInteger(input.maxTokens) ||
    input.maxTokens <= 0
  ) {
    return { status: "skipped_budget", durationMs: 0 };
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ kind: "timeout" }>(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, input.budgetMs);
  });

  try {
    const evaluated = Promise.resolve().then(() => input.evaluate({
      signal: controller.signal,
      maxTokens: input.maxTokens,
    })).then(
      value => ({ kind: "completed" as const, value }),
      () => ({ kind: "unavailable" as const }),
    );
    const result = await Promise.race([evaluated, timeout]);
    const durationMs = Math.max(0, clock() - startedAt);
    if (result.kind === "timeout") return { status: "timed_out", durationMs };
    if (result.kind === "unavailable") return { status: "unavailable", durationMs };
    if (!result.value || typeof result.value !== "object") {
      return { status: "unavailable", durationMs };
    }
    const tokensUsed = (result.value as { tokensUsed?: unknown }).tokensUsed;
    if (
      !Number.isSafeInteger(tokensUsed) ||
      (tokensUsed as number) < 0 ||
      (tokensUsed as number) > input.maxTokens
    ) {
      return { status: "budget_exceeded", durationMs };
    }
    return {
      status: "completed",
      value: (result.value as { value: T }).value,
      durationMs,
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
