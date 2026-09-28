import type { VerticalDramaAssuranceState } from "@shared/verticalDramaSeries/assurance";

export type ExpiredVerticalDramaAssuranceAttempt = {
  tenantId: string;
  executionId: string;
  attemptId: string;
  fenceToken: number;
  domainOwnerType: string;
  domainOwnerId: string;
  sourceFingerprint: string;
  contextFingerprint: string;
  state: VerticalDramaAssuranceState;
  errorCode?: string | null;
};

export type ReconciliationDomainResolution =
  | { kind: "exact_baseline"; domainRef: string }
  | { kind: "missing" }
  | { kind: "unproven" };
export type ReconciliationSideEffectResolution =
  | { kind: "none" }
  | { kind: "resolved" }
  | { kind: "uncertain" };

export interface VerticalDramaAssuranceReconciliationDependencies {
  listExpiredAttempts: (
    limit?: number
  ) => Promise<ExpiredVerticalDramaAssuranceAttempt[]>;
  claimReconciliation: (
    attempt: ExpiredVerticalDramaAssuranceAttempt
  ) => Promise<{ ok: true; fenceToken: number } | { ok: false }>;
  resolveDomain: (
    attempt: ExpiredVerticalDramaAssuranceAttempt
  ) => Promise<ReconciliationDomainResolution>;
  resolveSideEffect: (
    attempt: ExpiredVerticalDramaAssuranceAttempt
  ) => Promise<ReconciliationSideEffectResolution>;
  appendDecision: (input: {
    tenantId: string;
    executionId: string;
    attemptId: string;
    expectedFenceToken: number;
    eventIdempotencyKey: string;
    nextState: VerticalDramaAssuranceState;
    disposition:
      | "verified"
      | "recovered_needs_repair"
      | "blocked"
      | "retryable";
    nextAction: string;
    reasonCode: string;
    recoveredDomainRef?: string;
  }) => Promise<{ duplicate: boolean; state: string }>;
}

export type VerticalDramaAssuranceReconciliationDecision = {
  executionId: string;
  attemptId: string;
  state: VerticalDramaAssuranceState;
  disposition: "verified" | "recovered_needs_repair" | "blocked" | "retryable";
  nextAction: string;
  reasonCode: string;
  eventIdempotencyKey: string;
  duplicate: boolean;
};

function reconciliationKey(
  attempt: ExpiredVerticalDramaAssuranceAttempt,
  fenceToken: number,
  reasonCode: string
): string {
  return `reconcile:${attempt.executionId}:${attempt.attemptId}:${fenceToken}:${reasonCode}`;
}

function classifyNoSideEffect(
  attempt: ExpiredVerticalDramaAssuranceAttempt
): Omit<
  VerticalDramaAssuranceReconciliationDecision,
  "executionId" | "attemptId" | "eventIdempotencyKey" | "duplicate"
> {
  if (
    attempt.errorCode?.startsWith("VD_ASSURANCE_RETRY_SAFE") ||
    attempt.state === "retryable_failed"
  ) {
    return {
      state: "retryable_failed",
      disposition: "retryable",
      nextAction: "retry_from_fresh_context",
      reasonCode: "VD_ASSURANCE_RECONCILED_RETRY_SAFE",
    };
  }
  return {
    state: "stale",
    disposition: "retryable",
    nextAction: "retry_from_fresh_context",
    reasonCode: "VD_ASSURANCE_RECONCILED_STALE",
  };
}

/**
 * Bounded, idempotent reconciliation classifier. It deliberately has no
 * provider, queue, credit, or refund implementation: those remain Section 03
 * authorities and must return conclusive evidence through this seam.
 */
export async function reconcileVerticalDramaAssuranceAttempts(
  dependencies: VerticalDramaAssuranceReconciliationDependencies,
  limit = 50
): Promise<{
  scanned: number;
  decisions: VerticalDramaAssuranceReconciliationDecision[];
}> {
  const attempts = await dependencies.listExpiredAttempts(limit);
  const decisions: VerticalDramaAssuranceReconciliationDecision[] = [];
  for (const attempt of attempts.slice(0, limit)) {
    if (
      !attempt.tenantId ||
      !attempt.domainOwnerType ||
      !attempt.domainOwnerId ||
      !attempt.sourceFingerprint ||
      !attempt.contextFingerprint
    ) {
      continue;
    }
    const claim = await dependencies.claimReconciliation(attempt);
    if (!claim.ok) continue;
    const domain = await dependencies.resolveDomain(attempt);
    const sideEffect = await dependencies.resolveSideEffect(attempt);
    const classified =
      domain.kind === "exact_baseline"
        ? {
            state: "recovered" as const,
            disposition: "recovered_needs_repair" as const,
            nextAction: "repair",
            reasonCode: "VD_ASSURANCE_EXACT_BASELINE_RECOVERED",
            recoveredDomainRef: domain.domainRef,
          }
        : domain.kind === "unproven"
          ? {
              state: "fatal_failed" as const,
              disposition: "blocked" as const,
              nextAction: "inspect_operator_alert",
              reasonCode: "VD_ASSURANCE_LEGACY_UNPROVEN",
            }
          : sideEffect.kind === "uncertain"
            ? {
                state: "reconciliation_required" as const,
                disposition: "blocked" as const,
                nextAction: "await_provider_credit_reconciliation",
                reasonCode: "VD_ASSURANCE_SIDE_EFFECT_UNCERTAIN",
              }
            : classifyNoSideEffect(attempt);
    const eventIdempotencyKey = reconciliationKey(
      attempt,
      claim.fenceToken,
      classified.reasonCode
    );
    const appended = await dependencies.appendDecision({
      tenantId: attempt.tenantId,
      executionId: attempt.executionId,
      attemptId: attempt.attemptId,
      expectedFenceToken: claim.fenceToken,
      eventIdempotencyKey,
      nextState: classified.state,
      disposition: classified.disposition,
      nextAction: classified.nextAction,
      reasonCode: classified.reasonCode,
      ...( "recoveredDomainRef" in classified && classified.recoveredDomainRef
        ? { recoveredDomainRef: classified.recoveredDomainRef }
        : {}),
    });
    decisions.push({
      executionId: attempt.executionId,
      attemptId: attempt.attemptId,
      eventIdempotencyKey,
      duplicate: appended.duplicate,
      ...classified,
    });
  }
  return { scanned: attempts.length, decisions };
}
