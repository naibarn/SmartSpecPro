import { describe, expect, it } from "vitest";
import {
  completeInferenceAttempt,
  createInferenceAttempt,
  inferencePlanPersistenceFingerprint,
  persistInferencePlan,
} from "../persistence";
import type { InferencePlanR4 } from "../contracts";

const hashRef = `sha256:${"a".repeat(64)}`;
const plan: InferencePlanR4 = {
  planId: "plan-1",
  intentHash: hashRef,
  policyRevision: "policy-1",
  registryRevision: "registry-1",
  selectedModelProfile: "model-1",
  selectedDeploymentProfile: "deployment-1",
  endpointSurface: "responses_compatible",
  attemptBudget: 1,
  deadlineAt: "2026-09-27T12:00:00.000Z",
  fallbackCandidates: [],
  fallbackPermission: "none",
  cachePolicyId: "cache-1",
  creditReservationId: "reservation-1",
  estimatedCostMicros: 10,
  routePolicyRevision: "route-1",
  specUid: "urn:smartaihub:spec:llm-routing-inference",
  specRevision: "R4",
  rolloutBundleHash: hashRef,
  logicalCallId: "call-1",
  attemptOwnershipEpoch: 1,
  parentCostCeilingMicros: 20,
  overallDeadlineAt: "2026-09-27T12:00:00.000Z",
  residencyPolicySnapshotRef: "residency-1",
  routerFeatureProvenanceRef: "router-1",
};

const fingerprintInput = {
  tenantId: "tenant-1",
  principalRef: "principal-1",
  idempotencyKey: "idem-1",
  workerJobId: "job-1",
  scoreCalibrationRevision: "scores-1",
  plan,
};

describe("inference persistence boundary validation", () => {
  it("binds plan idempotency to tenant, principal, reservation and job ownership", () => {
    const expected = inferencePlanPersistenceFingerprint(fingerprintInput);
    expect(
      inferencePlanPersistenceFingerprint({
        ...fingerprintInput,
        principalRef: "principal-2",
      })
    ).not.toBe(expected);
    expect(
      inferencePlanPersistenceFingerprint({
        ...fingerprintInput,
        workerJobId: "job-2",
      })
    ).not.toBe(expected);
    expect(
      inferencePlanPersistenceFingerprint({
        ...fingerprintInput,
        scoreCalibrationRevision: "scores-2",
      })
    ).not.toBe(expected);
    expect(
      inferencePlanPersistenceFingerprint({
        ...fingerprintInput,
        plan: { ...plan, creditReservationId: "reservation-2" },
      })
    ).not.toBe(expected);
  });

  it("rejects an invalid plan before requiring database access", async () => {
    await expect(
      persistInferencePlan({
        tenantId: "tenant-1",
        principalRef: "principal-1",
        idempotencyKey: "idem-1",
        scoreCalibrationRevision: "scores-1",
        plan: {} as never,
      })
    ).rejects.toThrow("Invalid immutable inference plan");
  });

  it("rejects attempt creation without a valid owner fence", async () => {
    await expect(
      createInferenceAttempt({
        planId: "plan-1",
        attemptId: "attempt-1",
        attemptOrdinal: 1,
        attemptOwnershipEpoch: 1,
        ownerToken: "",
        candidate: {} as never,
      })
    ).rejects.toThrow("Invalid inference attempt ownership or ordinal");
  });

  it("rejects malformed terminal receipts before database access", async () => {
    await expect(
      completeInferenceAttempt({
        receipt: {} as never,
        attemptOwnershipEpoch: 1,
        ownerToken: "owner-token",
      })
    ).rejects.toThrow("Invalid inference attempt receipt");
  });
});
