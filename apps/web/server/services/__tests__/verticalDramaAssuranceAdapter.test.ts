import { describe, expect, it } from "vitest";
import { OrchestraAssuranceRequestSchema } from "@shared/agentRuntime/orchestraSchemas";
import { buildProductionContextSnapshot } from "@shared/verticalDramaSeries/verticalDramaAssuranceContext";
import {
  admitVerticalDramaAssuranceRequest,
  getVerticalDramaAssuranceFlagSnapshot,
  normalizeVerticalDramaAssuranceResult,
  selectVerticalDramaAssuranceMode,
  toOrchestraAssuranceRequest,
} from "../verticalDramaAssuranceAdapter";

const owner = { tenantId: "tenant-1", userId: 7 };
const snapshot = buildProductionContextSnapshot({ schemaVersion: 1, snapshotId: "ctx-1", revision: 1, seriesId: 101, profile: { profileId: "drama_romance", version: 1, contentKind: "fiction", visualGroundingVersion: 1, visualGroundingFingerprint: "a".repeat(64), factPolicyVersion: 1, brollPolicyVersion: 1 }, sourcePackPolicy: "optional", sourcePackDecision: "explicit_none", sourcePack: null, visualSource: { snapshotId: "visual-1", revision: 1, fingerprint: "b".repeat(64), visualCanonVersion: 1, visualCanonFingerprint: "c".repeat(64) }, claimLedger: null, coveragePlan: null, references: { storyControlRefs: [], characterRefs: [], sceneRefs: [], shotRefs: [], claimRefs: [], coverageRefs: [], slotRefs: [], assetRefs: [], segmentRefs: [], mediaBindingRefs: [] } });
const manifest = { taskTypes: ["skill_execution"], surfaceSupport: ["skill"], supportedOriginSurfaces: [], supportedEntryPoints: [] };
const request = { schemaVersion: 1, tenantId: "tenant-1", userId: 7, taskKind: "draft_qc", runtimeTaskKind: "skill_execution", sourceRef: null, contextSnapshotRef: snapshot, inputRefs: ["draft:1"], contractVersion: 1, runtimeContractVersion: 2, outputContractVersion: 1, rulePackIds: ["vd-qc-v1"], policyHash: "d".repeat(64), modelHash: "e".repeat(64), compatibilityMode: "native", requiredReadiness: "verified", idempotencyKey: "idem-1", attemptId: "attempt-1", budget: { maxTurns: 1, maxToolCalls: 1, maxParallelAgents: 1, maxPlanDepth: 1, maxWallClockSeconds: 1, maxInputTokens: 1, maxOutputTokens: 1, maxRepairAttempts: 0, estimatedCost: 0 }, sideEffectPolicy: "none" };

describe("vertical drama assurance adapter", () => {
  it("admits a mapped compatible request and preserves its context contract hash", () => {
    const admitted = admitVerticalDramaAssuranceRequest({ owner, snapshot, request, manifest });
    expect(admitted).toMatchObject({ ok: true, request: { taskKind: "draft_qc", runtimeTaskKind: "skill_execution" } });
    if (!admitted.ok) return;
    expect(OrchestraAssuranceRequestSchema.parse(toOrchestraAssuranceRequest(admitted.request)).contractHash).toBe(snapshot.fingerprint);
  });

  it("rejects missing context and provider-ready side effects before runtime work", () => {
    expect(admitVerticalDramaAssuranceRequest({ owner, snapshot, request: { ...request, contextSnapshotRef: null }, manifest })).toMatchObject({ ok: false, finding: { code: "VD_ASSURANCE_CONTEXT_MISSING" } });
    expect(admitVerticalDramaAssuranceRequest({ owner, snapshot, request: { ...request, sideEffectPolicy: "provider_ready" }, manifest })).toMatchObject({ ok: false, finding: { code: "VD_ASSURANCE_SIDE_EFFECT_POLICY_INVALID" } });
  });

  it("uses kill-switch precedence and default-off legacy selection", () => {
    const allOff = getVerticalDramaAssuranceFlagSnapshot({});
    expect(selectVerticalDramaAssuranceMode("draft_qc", allOff)).toBe("legacy_deterministic");
    expect(selectVerticalDramaAssuranceMode("draft_qc", { ...allOff, verticalDramaDraftQcOrchestraActive: true, verticalDramaAssuranceShadow: true })).toBe("agent_active");
    expect(selectVerticalDramaAssuranceMode("draft_qc", { ...allOff, verticalDramaDraftQcOrchestraActive: true, verticalDramaAssuranceKillSwitch: true })).toBe("legacy_deterministic");
  });

  it("keeps exact recovered baseline evidence actionable but never verified", () => {
    expect(normalizeVerticalDramaAssuranceResult({ attemptId: "attempt-1", executionId: "exec-1", runtimeState: "failed", recoveredBaseline: { exact: true } })).toMatchObject({ state: "recovered", disposition: "recovered_needs_repair", readiness: "draft" });
  });
});
