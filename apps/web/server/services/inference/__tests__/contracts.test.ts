import { describe, expect, it } from "vitest";
import {
  INFERENCE_SPEC_UID,
  resolveTrustedInferenceIntent,
  adaptInferenceV1,
  inferenceIntentV2Schema,
  inferencePlanR4Schema,
  inferenceAttemptReceiptSchema,
} from "../contracts";

const trusted = {
  tenantId: "tenant-a",
  principalId: "user-7",
  traceId: "trace-server",
  policyRevision: "policy-authority-9",
  budgetScopeRef: "tenant:tenant-a",
  idempotencyKey: "idempotency-server-1",
  maxAuthorizedCostMicros: 80_000,
  effectivePrivacyClass: "tenant-confidential",
  effectiveRisk: "high" as const,
  allowedRegions: ["TH"],
  requireZeroDataRetention: true,
};

function validIntent(overrides: Record<string, unknown> = {}) {
  return {
    contract: "SAH-INFERENCE-2",
    requestId: "req-1",
    traceId: "trace-1",
    tenantId: trusted.tenantId,
    principalId: trusted.principalId,
    consumer: "chat",
    taskClass: "general-chat",
    purpose: "answer-user",
    inputModalities: ["text"],
    outputModalities: ["text"],
    inputTokenEstimate: 100,
    outputTokenReserve: 500,
    requiredFeatures: [],
    languageHints: ["th"],
    privacyClass: "tenant-confidential",
    residencyAllowlist: ["TH"],
    zdrRequired: true,
    qualityClass: "standard",
    risk: "low",
    latencyDeadlineMs: 20_000,
    maxEstimatedCostMicros: 100_000,
    selection: { mode: "AUTO" },
    policyRevision: "policy-7",
    budgetScopeRef: "tenant:tenant-a",
    idempotencyKey: "request:abc123",
    ...overrides,
  };
}

describe("Spec 231 SAH-INFERENCE-2 contracts", () => {
  it("accepts a bounded AUTO intent and binds it to trusted tenant/principal context", () => {
    const result = resolveTrustedInferenceIntent(validIntent(), trusted);

    expect(result).toMatchObject({
      ok: true,
      intent: {
        contract: "SAH-INFERENCE-2",
        tenantId: "tenant-a",
        principalId: "user-7",
        traceId: "trace-server",
        policyRevision: "policy-authority-9",
        budgetScopeRef: "tenant:tenant-a",
        idempotencyKey: "idempotency-server-1",
        maxEstimatedCostMicros: 80_000,
        risk: "high",
        privacyClass: "tenant-confidential",
        residencyAllowlist: ["TH"],
        zdrRequired: true,
        selection: { mode: "AUTO" },
      },
    });
  });

  it("rejects extra fields and reports field names without echoing payload values", () => {
    const result = resolveTrustedInferenceIntent(
      validIntent({ apiKey: "secret-value" }),
      trusted
    );

    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_INFERENCE_INTENT",
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it.each([
    ["tenantId", "tenant-b"],
    ["principalId", "user-8"],
  ] as const)("rejects a client-forged %s", (field, value) => {
    const result = resolveTrustedInferenceIntent(
      validIntent({ [field]: value }),
      trusted
    );

    expect(result).toEqual({
      ok: false,
      code: "INFERENCE_SCOPE_MISMATCH",
      field,
    });
  });

  it("rejects non-integer or unbounded financial and deadline values", () => {
    expect(
      inferenceIntentV2Schema.safeParse(
        validIntent({ maxEstimatedCostMicros: Number.MAX_SAFE_INTEGER + 1 })
      ).success
    ).toBe(false);
    expect(
      inferenceIntentV2Schema.safeParse(
        validIntent({ maxEstimatedCostMicros: 1.5 })
      ).success
    ).toBe(false);
    expect(
      inferenceIntentV2Schema.safeParse(
        validIntent({ latencyDeadlineMs: 3_600_001 })
      ).success
    ).toBe(false);
  });

  it("preserves explicit locks and their distinct fallback contracts", () => {
    for (const selection of [
      {
        mode: "MODEL_LOCK",
        modelProfileId: "model:stable-v3",
        fallback: "none",
      },
      {
        mode: "MODEL_LOCK",
        modelProfileId: "model:stable-v3",
        fallback: "ask",
      },
      {
        mode: "MODEL_LOCK",
        modelProfileId: "model:stable-v3",
        fallback: "preapproved_equivalent",
      },
      {
        mode: "PROVIDER_LOCK",
        providerId: "provider:account-a",
        fallback: "ask",
      },
      { mode: "LOCAL_ONLY" },
      { mode: "PLATFORM_ONLY" },
    ]) {
      expect(
        inferenceIntentV2Schema.safeParse(validIntent({ selection })).success
      ).toBe(true);
    }
    expect(
      inferenceIntentV2Schema.safeParse(
        validIntent({
          selection: {
            mode: "PROVIDER_LOCK",
            providerId: "p1",
            fallback: "preapproved_equivalent",
          },
        })
      ).success
    ).toBe(false);
  });

  it("requires an R4 immutable plan identity and rejects a plan above its parent ceiling", () => {
    const plan = {
      planId: "plan-1",
      intentHash: `sha256:${"a".repeat(64)}`,
      policyRevision: "policy-7",
      registryRevision: "registry-4",
      selectedModelProfile: "model:stable-v3",
      selectedDeploymentProfile: "deployment:account-a:v2",
      endpointSurface: "responses_compatible",
      attemptBudget: 2,
      deadlineAt: "2026-09-27T10:00:00.000Z",
      fallbackCandidates: ["deployment:account-b:v1"],
      fallbackPermission: "preapproved",
      cachePolicyId: "cache:no-store-private",
      creditReservationId: "reservation-3",
      estimatedCostMicros: 50_000,
      routePolicyRevision: "route-policy-9",
      specUid: INFERENCE_SPEC_UID,
      specRevision: "R4",
      rolloutBundleHash: `sha256:${"b".repeat(64)}`,
      logicalCallId: "call-1",
      attemptOwnershipEpoch: 1,
      parentCostCeilingMicros: 100_000,
      overallDeadlineAt: "2026-09-27T10:01:00.000Z",
      residencyPolicySnapshotRef: "policy-snapshot-2",
      routerFeatureProvenanceRef: "feature-proof-8",
    };

    expect(inferencePlanR4Schema.safeParse(plan).success).toBe(true);
    expect(
      inferencePlanR4Schema.safeParse({ ...plan, estimatedCostMicros: 100_001 })
        .success
    ).toBe(false);
    expect(
      inferencePlanR4Schema.safeParse({ ...plan, specUid: "Spec 231" }).success
    ).toBe(false);
  });

  it("adapts supported v1 fields without weakening locks and binds trusted scope", () => {
    const legacy = {
      contract: "SAH-INFERENCE-1",
      requestId: "req-legacy",
      traceId: "client-controlled-trace",
      tenantId: "tenant-a",
      principalId: "user-7",
      consumer: "chat",
      taskClass: "general-chat",
      purpose: "answer-user",
      inputModalities: ["text"],
      outputModalities: ["text"],
      inputTokenEstimate: 100,
      outputTokenReserve: 500,
      requiredFeatures: ["streaming"],
      toolContractRefs: [],
      languageHints: ["th"],
      privacyClass: "public",
      residencyAllowlist: ["US", "TH"],
      zdrRequired: false,
      qualityClass: "standard",
      risk: "low",
      latencyDeadlineMs: 20_000,
      maxEstimatedCostMicros: 100_000,
      selection: {
        mode: "USER_SELECTED_MODEL",
        modelProfileId: "model:stable-v3",
      },
    };
    const result = adaptInferenceV1(legacy, trusted);

    expect(result).toMatchObject({
      ok: true,
      intent: {
        contract: "SAH-INFERENCE-2",
        traceId: "trace-server",
        tenantId: "tenant-a",
        principalId: "user-7",
        risk: "high",
        privacyClass: "tenant-confidential",
        residencyAllowlist: ["TH"],
        zdrRequired: true,
        maxEstimatedCostMicros: 80_000,
        policyRevision: "policy-authority-9",
        idempotencyKey: "idempotency-server-1",
        selection: {
          mode: "MODEL_LOCK",
          modelProfileId: "model:stable-v3",
          fallback: "none",
        },
        requiredFeatures: ["streaming"],
      },
    });
  });

  it("reports unsupported v1 requirements explicitly instead of weakening them", () => {
    const result = adaptInferenceV1(
      {
        contract: "SAH-INFERENCE-1",
        requestId: "req-legacy",
        consumer: "agent",
        taskClass: "external-agent",
        purpose: "delegate",
        inputModalities: ["text"],
        outputModalities: ["text"],
        inputTokenEstimate: 100,
        outputTokenReserve: 100,
        requiredFeatures: [],
        languageHints: [],
        privacyClass: "tenant-confidential",
        zdrRequired: true,
        qualityClass: "standard",
        risk: "high",
        latencyDeadlineMs: 10_000,
        maxEstimatedCostMicros: 10_000,
        selection: { mode: "EXTERNAL_AGENT_HARNESS" },
      },
      trusted
    );

    expect(result).toEqual({
      ok: false,
      code: "UNSUPPORTED_V1_REQUIREMENT",
      requirements: ["selection.mode"],
    });
  });

  it("preserves unknown provider outcomes and rejects untrusted or inconsistent attempt receipts", () => {
    const unknownReceipt = {
      planId: "plan-1",
      attemptId: "attempt-1",
      attemptOrdinal: 1,
      actualModel: "model:stable-v3",
      providerId: "provider:account-a",
      credentialOwnerRef: "credential-owner:platform",
      deploymentId: "deployment:1",
      outcome: "unknown",
      submissionState: "unknown",
      streamCommitted: false,
      normalizedFailure: "unknown_outcome",
    };
    expect(
      inferenceAttemptReceiptSchema.safeParse(unknownReceipt).success
    ).toBe(true);
    expect(
      inferenceAttemptReceiptSchema.safeParse({
        ...unknownReceipt,
        outcome: "completed",
        submissionState: "submitted",
        normalizedFailure: undefined,
      }).success
    ).toBe(false);
    expect(
      inferenceAttemptReceiptSchema.safeParse({
        ...unknownReceipt,
        outcome: "completed",
        submissionState: "submitted",
        normalizedFailure: undefined,
        observedExecution: {
          model: "model:stable-v3",
          providerId: "provider:account-b",
          credentialOwnerRef: "credential-owner:platform",
          deploymentId: "deployment:1",
          endpointSurface: "responses_compatible",
        },
      }).success
    ).toBe(true); // preserve mismatched provider identity as evidence for quarantine
    expect(
      inferenceAttemptReceiptSchema.safeParse({
        ...unknownReceipt,
        outcome: "completed",
        submissionState: "submitted",
        normalizedFailure: undefined,
        observedExecution: {
          model: "model:stable-v3",
          providerId: "provider:account-a",
          credentialOwnerRef: "credential-owner:platform",
          deploymentId: "deployment:1",
          endpointSurface: "responses_compatible",
        },
      }).success
    ).toBe(true);
    expect(
      inferenceAttemptReceiptSchema.safeParse({
        ...unknownReceipt,
        normalizedFailure: "provider_unavailable",
      }).success
    ).toBe(false);
    expect(
      inferenceAttemptReceiptSchema.safeParse({
        ...unknownReceipt,
        apiKey: "must-not-enter-receipt",
      }).success
    ).toBe(false);
    expect(
      inferenceAttemptReceiptSchema.safeParse({
        ...unknownReceipt,
        outcome: "failed",
        normalizedFailure: "connection_failed",
        submissionState: "not_submitted",
        streamCommitted: true,
      }).success
    ).toBe(false);
  });
});
