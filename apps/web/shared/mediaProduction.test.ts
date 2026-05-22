import { describe, expect, it } from "vitest";
import {
  buildProductionOutputProjectionIdentity,
  canSubmitProductionFinalRender,
  evaluateProductionAssetPlanReadiness,
  validateProductionRunTransition,
  type ProductionQualityGate,
} from "./mediaProduction";

describe("mediaProduction shared orchestration contracts", () => {
  it("blocks final render when required assets are missing", () => {
    const readiness = evaluateProductionAssetPlanReadiness({
      assetPlanId: "plan-1",
      productionRunId: "run-1",
      contractVersion: "1.0.0",
      nodes: [
        { id: "product-image", kind: "product_image", role: "hero", required: true, status: "ready" },
        { id: "voice", kind: "voice", role: "narrator", required: true, status: "missing" },
      ],
    });

    expect(readiness).toMatchObject({
      status: "blocked",
      requiredTotal: 2,
      requiredReady: 1,
      blockingNodeIds: ["voice"],
    });
  });

  it("allows final render only after quality gate and readiness pass", () => {
    const gate: ProductionQualityGate = {
      gateStatus: "pass",
      confidenceScore: 0.9,
      expectedQualityScore: 0.9,
      creditRiskScore: 0.1,
      providerFitScore: 0.9,
      storyAlignmentScore: 0.9,
      productTruthScore: 0.9,
      assetReadinessScore: 1,
      blockingIssues: [],
      revisionInstructions: [],
      reviewerVerdicts: [],
      allowedNextActions: ["submit_final_render"],
      attemptCount: 1,
      maxAttemptsReached: false,
      contractVersion: "1.0.0",
    };

    expect(canSubmitProductionFinalRender(gate, {
      status: "ready",
      requiredTotal: 1,
      requiredReady: 1,
      blockingNodeIds: [],
      warningNodeIds: [],
      estimatedCredits: 90,
    })).toBe(true);

    expect(canSubmitProductionFinalRender({ ...gate, gateStatus: "revise" }, {
      status: "ready",
      requiredTotal: 1,
      requiredReady: 1,
      blockingNodeIds: [],
      warningNodeIds: [],
      estimatedCredits: 90,
    })).toBe(false);
  });

  it("builds stable idempotent projection keys independent of object key order", () => {
    const a = buildProductionOutputProjectionIdentity({
      tenantId: "t1",
      productionRunId: "run1",
      surface: "storyboard_review",
      sourceOutput: { b: 2, a: { y: 2, x: 1 } },
    });
    const b = buildProductionOutputProjectionIdentity({
      tenantId: "t1",
      productionRunId: "run1",
      surface: "storyboard_review",
      sourceOutput: { a: { x: 1, y: 2 }, b: 2 },
    });

    expect(a.sourceOutputHash).toBe(b.sourceOutputHash);
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
  });

  it("validates production state transitions with stable reason codes", () => {
    expect(validateProductionRunTransition("goal_ready", "plan_generating")).toMatchObject({ ok: true });
    expect(validateProductionRunTransition("plan_verifying", "plan_ready_for_review")).toMatchObject({ ok: true });
    expect(validateProductionRunTransition("goal_ready", "final_generating")).toMatchObject({
      ok: false,
      reasonCode: "production_state_invalid_transition",
    });
    expect(validateProductionRunTransition("completed", "revision_running")).toMatchObject({
      ok: false,
      reasonCode: "production_state_terminal",
    });
  });
});
