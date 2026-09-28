import { describe, expect, it } from "vitest";
import {
  inferenceAttemptReceiptSchema,
  inferencePlanR4Schema,
} from "../contracts";
import { decideInferenceAttemptRetry } from "../attemptPolicy";

const plan = inferencePlanR4Schema.parse({
  planId: "plan-1",
  intentHash: "sha256:" + "a".repeat(64),
  policyRevision: "policy-1",
  registryRevision: "registry-1",
  selectedModelProfile: "model-1",
  selectedDeploymentProfile: "deployment-a",
  endpointSurface: "responses_compatible",
  attemptBudget: 2,
  deadlineAt: "2026-09-27T10:01:00.000Z",
  fallbackCandidates: ["deployment-b"],
  fallbackPermission: "preapproved",
  cachePolicyId: "cache:no-store",
  creditReservationId: "reservation-1",
  estimatedCostMicros: 100,
  routePolicyRevision: "router-policy-1",
  specUid: "urn:smartaihub:spec:llm-routing-inference",
  specRevision: "R4",
  rolloutBundleHash: "sha256:" + "b".repeat(64),
  logicalCallId: "call-1",
  attemptOwnershipEpoch: 1,
  parentCostCeilingMicros: 1000,
  overallDeadlineAt: "2026-09-27T10:02:00.000Z",
  residencyPolicySnapshotRef: "residency-1",
  routerFeatureProvenanceRef: "router-1",
});

function receipt(overrides: Record<string, unknown> = {}) {
  return inferenceAttemptReceiptSchema.parse({
    planId: "plan-1",
    attemptId: "attempt-1",
    attemptOrdinal: 1,
    actualModel: "model-1",
    providerId: "provider-a",
    credentialOwnerRef: "credential-owner-a",
    deploymentId: "deployment-a",
    outcome: "failed",
    submissionState: "submitted",
    streamCommitted: false,
    normalizedFailure: "provider_unavailable",
    ...overrides,
  });
}

describe("Spec 231 retry safety policy", () => {
  it("uses only a preapproved fallback for a known transient submitted failure", () => {
    expect(
      decideInferenceAttemptRetry(
        plan,
        receipt(),
        Date.parse("2026-09-27T10:00:30.000Z"),
        true
      )
    ).toEqual({
      action: "retry",
      strategy: "preapproved_fallback",
      deploymentId: "deployment-b",
      attemptOrdinal: 2,
    });
  });

  it("never retries an ambiguous submission or a submitted request without certified idempotency", () => {
    expect(
      decideInferenceAttemptRetry(
        plan,
        receipt({
          outcome: "unknown",
          normalizedFailure: "unknown_outcome",
          submissionState: "unknown",
        }),
        0,
        true
      )
    ).toEqual({
      action: "terminal",
      reason: "UNKNOWN_OUTCOME",
    });
    expect(decideInferenceAttemptRetry(plan, receipt(), 0, false)).toEqual({
      action: "terminal",
      reason: "IDEMPOTENCY_NOT_CERTIFIED",
    });
  });

  it("permits a preapproved alternate after a confirmed non-submission without retrying the same deployment", () => {
    expect(
      decideInferenceAttemptRetry(
        plan,
        receipt({ submissionState: "not_submitted" }),
        0,
        false
      )
    ).toMatchObject({
      action: "retry",
      deploymentId: "deployment-b",
      attemptOrdinal: 2,
    });
  });

  it("stops after stream commit, terminal errors, attempt exhaustion and deadline", () => {
    expect(
      decideInferenceAttemptRetry(
        plan,
        receipt({ streamCommitted: true }),
        0,
        true
      )
    ).toMatchObject({ action: "terminal", reason: "STREAM_COMMITTED" });
    expect(
      decideInferenceAttemptRetry(
        plan,
        receipt({ normalizedFailure: "content_policy" }),
        0,
        true
      )
    ).toMatchObject({ action: "terminal", reason: "NON_RETRYABLE_FAILURE" });
    expect(
      decideInferenceAttemptRetry(
        plan,
        receipt({ attemptOrdinal: 2, deploymentId: "deployment-b" }),
        0,
        true
      )
    ).toMatchObject({ action: "terminal", reason: "ATTEMPT_BUDGET_EXHAUSTED" });
    expect(
      decideInferenceAttemptRetry(
        plan,
        receipt(),
        Date.parse("2026-09-27T10:01:00.000Z"),
        true
      )
    ).toMatchObject({ action: "terminal", reason: "DEADLINE_EXHAUSTED" });
  });

  it("requires consent when the plan says ask and rejects a receipt from another route", () => {
    const askPlan = inferencePlanR4Schema.parse({
      ...plan,
      fallbackPermission: "ask",
      fallbackCandidates: [],
      attemptBudget: 1,
    });
    expect(decideInferenceAttemptRetry(askPlan, receipt(), 0, true)).toEqual({
      action: "consent_required",
      reason: "LOCKED_ROUTE_FALLBACK_REQUIRES_CONSENT",
    });
    expect(
      decideInferenceAttemptRetry(
        plan,
        receipt({ deploymentId: "unplanned-deployment" }),
        0,
        true
      )
    ).toEqual({
      action: "terminal",
      reason: "PLAN_RECEIPT_MISMATCH",
    });
  });
});
