import { describe, expect, it } from "vitest";
import { OrchestraTaskKindSchema } from "../../agentRuntime/orchestraSchemas";
import {
  VERTICAL_DRAMA_ASSURANCE_STATES,
  VERTICAL_DRAMA_ASSURANCE_TASK_KINDS,
  VerticalDramaAssuranceRequestSchema,
  buildAssuranceUiProjection,
  mapVerticalDramaTaskToRuntimeCapability,
  wrapLegacyVerticalDramaAssuranceRequest,
} from "../assurance";

const contextRef = { snapshotId: "ctx-1", revision: 1, fingerprint: "a".repeat(64) };

function request(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    tenantId: "tenant-1",
    userId: 7,
    taskKind: "draft_qc",
    runtimeTaskKind: "skill_execution",
    sourceRef: null,
    contextSnapshotRef: contextRef,
    inputRefs: ["draft:1"],
    contractVersion: 1,
    runtimeContractVersion: 2,
    outputContractVersion: 1,
    rulePackIds: ["vd-qc-v1"],
    policyHash: "b".repeat(64),
    modelHash: "c".repeat(64),
    compatibilityMode: "native",
    requiredReadiness: "verified",
    idempotencyKey: "idem-1",
    attemptId: "attempt-1",
    budget: { maxTurns: 1, maxToolCalls: 1, maxParallelAgents: 1, maxPlanDepth: 1, maxWallClockSeconds: 1, maxInputTokens: 1, maxOutputTokens: 1, maxRepairAttempts: 0, estimatedCost: 0 },
    sideEffectPolicy: "none",
    ...overrides,
  };
}

describe("vertical drama assurance contracts", () => {
  it("maps every declared domain task to a valid existing runtime task and output authority", () => {
    for (const task of VERTICAL_DRAMA_ASSURANCE_TASK_KINDS) {
      const mapped = mapVerticalDramaTaskToRuntimeCapability(task);
      expect(mapped.ok).toBe(true);
      if (mapped.ok) {
        expect(OrchestraTaskKindSchema.safeParse(mapped.mapping.runtimeTaskKind).success).toBe(true);
        expect(mapped.mapping.outputAuthority).toBeTruthy();
      }
    }
  });

  it("uses typed failures for unmapped tasks and invalid logical requests", () => {
    expect(mapVerticalDramaTaskToRuntimeCapability("unknown" as any)).toMatchObject({
      ok: false,
      finding: { code: "VD_ASSURANCE_TASK_UNMAPPED" },
    });
    expect(VerticalDramaAssuranceRequestSchema.safeParse(request({ contextSnapshotRef: null })).success).toBe(false);
    expect(VerticalDramaAssuranceRequestSchema.safeParse(request({ sideEffectPolicy: "mutate_everything" })).success).toBe(false);
  });

  it("wraps legacy input without inventing ownership or source facts", () => {
    const wrapped = wrapLegacyVerticalDramaAssuranceRequest({
      request: request(),
      legacyPayload: { draftId: 44, requiredLegacyField: "preserved" },
    });
    expect(VerticalDramaAssuranceRequestSchema.parse(wrapped)).toMatchObject({
      compatibilityMode: "legacy_wrapped",
      sourceRef: null,
      legacyInputRef: { draftId: 44, requiredLegacyField: "preserved" },
    });
  });

  it("only allows continuation across a hard boundary for succeeded verified sufficient readiness", () => {
    for (const state of VERTICAL_DRAMA_ASSURANCE_STATES) {
      const projection = buildAssuranceUiProjection({
        state,
        disposition: state === "succeeded" ? "verified" : "retryable",
        readiness: state === "succeeded" ? "production_ready" : "draft",
        requiredReadiness: "production_ready",
        sourceCurrent: true,
        contextCurrent: true,
        hasRecoveredResult: state === "recovered",
      });
      expect(projection.canContinue).toBe(state === "succeeded");
    }
    const recovered = buildAssuranceUiProjection({
      state: "recovered",
      disposition: "recovered_needs_repair",
      readiness: "production_ready",
      requiredReadiness: "verified",
      sourceCurrent: true,
      contextCurrent: true,
      hasRecoveredResult: true,
    });
    expect(recovered).toMatchObject({ canRepair: true, canContinue: false, verified: false });
  });
});
