import { describe, expect, it } from "vitest";

import {
  appendIdempotencyRecord,
  assertPreflightTransition,
  checkIdempotency,
  transitionPreflightBundle,
} from "../preflightApprovalLifecycleService";
import type { PreflightApprovalBundle } from "../../../shared/workOrchestrator";

function buildBundle(): PreflightApprovalBundle {
  const now = "2026-04-21T00:00:00.000Z";
  return {
    id: "bundle-1",
    tenantId: "tenant-1",
    requestId: "req-1",
    caseId: "case-1",
    state: "previewed",
    createdAt: now,
    updatedAt: now,
    previewView: "requester_safe",
    brief: {
      title: "Launch",
      objective: "Create assets",
      summary: "Create assets",
      sourceRefs: [],
      approvalSnapshots: [],
      generatedAt: now,
    },
    capabilityCatalog: [],
    capabilityPlan: null,
    executionPlan: null,
    teamResolution: null,
    budget: null,
    approvalSnapshots: [],
    preflightRevision: {
      algorithm: "sha256-json-v1",
      fingerprint: "a".repeat(64),
      inputs: {
        requestTitle: "Launch",
        requestObjective: "Create assets",
        linkedConversationIds: [],
        linkedWorkpackRunIds: [],
        linkedRoleRoutineRunIds: [],
        selectedSourceIds: [],
        policyDigest: null,
        explicitTeamId: null,
      },
      generatedAt: now,
    },
    createdByUserId: 42,
    launchedAt: null,
    supersededByBundleId: null,
    approvedAt: null,
    approvedByUserId: null,
    idempotencyRecords: [],
    stateTransitions: [],
    requesterSafeDiagnostics: {},
    adminDiagnostics: {},
    metadata: {},
  };
}

describe("preflightApprovalLifecycleService", () => {
  it("rejects invalid lifecycle transitions", () => {
    expect(() => assertPreflightTransition("draft", "launched")).toThrow(
      "PREVIEW_TRANSITION_INVALID:draft->launched",
    );
  });

  it("records approval transitions with actor metadata", () => {
    const bundle = transitionPreflightBundle({
      bundle: buildBundle(),
      toState: "approved",
      event: "preflight.approved",
      actorUserId: 42,
      reasonCode: "preflight_approved",
      occurredAt: "2026-04-21T01:00:00.000Z",
    });

    expect(bundle.state).toBe("approved");
    expect(bundle.approvedByUserId).toBe(42);
    expect(bundle.stateTransitions[0]).toEqual(
      expect.objectContaining({
        event: "preflight.approved",
        toState: "approved",
      }),
    );
  });

  it("supports idempotency matching and conflict detection", () => {
    const bundleWithRecord = appendIdempotencyRecord({
      bundle: buildBundle(),
      operation: "approve_preflight_bundle",
      idempotencyKey: "approve-1",
      inputFingerprint: '{"a":1}',
      result: { state: "approved" },
      createdAt: "2026-04-21T01:00:00.000Z",
    });

    expect(
      checkIdempotency({
        bundle: bundleWithRecord,
        operation: "approve_preflight_bundle",
        idempotencyKey: "approve-1",
        inputFingerprint: '{"a":1}',
      }),
    ).toEqual(expect.objectContaining({ matched: true, conflict: false }));

    expect(
      checkIdempotency({
        bundle: bundleWithRecord,
        operation: "approve_preflight_bundle",
        idempotencyKey: "approve-1",
        inputFingerprint: '{"a":2}',
      }),
    ).toEqual(expect.objectContaining({ matched: false, conflict: true }));
  });
});
