import { describe, expect, it } from "vitest";
import {
	  buildProductionOutputProjectionIdentity,
	  computeProductionSpaceReadiness,
	  canSubmitProductionFinalRender,
	  deriveProductionHandoffPayload,
	  PRODUCTION_NODE_CATALOG,
	  getProductionNodeCatalogEntry,
  validateProductionExecutableNodeAgainstCatalog,
  validateProductionNodeConfigSnapshotAgainstCatalog,
	  applyProductionApprovalInvalidation,
  applyProductionLayerVersionChange,
  getProductionLayerVersions,
  doesProductionNodeConfigChangeInvalidateApproval,
  doesProductionChangeInvalidateApproval,
  evaluateProductionAssetPlanReadiness,
  resolveProductionFeatureGates,
  validateProductionSpace,
  validateProductionRunTransition,
  type ProductionSpace,
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

	  it("resolves Feature 116 execution gates with kill-switch precedence", () => {
    expect(resolveProductionFeatureGates({
      feature116RunOneNode: true,
      feature116RunOneShot: true,
      feature116BatchExecution: true,
    })).toMatchObject({
      emergencyKill: false,
      runOneNode: true,
      runOneShot: true,
      batchExecution: true,
    });

    expect(resolveProductionFeatureGates({
      feature116RunOneNode: false,
      feature116RunOneShot: true,
      feature116BatchExecution: true,
    })).toMatchObject({
      runOneNode: false,
      runOneShot: false,
      batchExecution: false,
    });

    expect(resolveProductionFeatureGates({
      feature116EmergencyKill: true,
      feature116ProductionSpaceUi: true,
      feature116RunOneNode: true,
      feature116RunOneShot: true,
    })).toMatchObject({
      emergencyKill: true,
      productionSpaceUi: false,
      runOneNode: false,
      runOneShot: false,
    });
	  });

	  it("keeps the full node matrix visible while bounding MVP-enabled adapters", () => {
	    const mvpEnabled = PRODUCTION_NODE_CATALOG.filter((entry) => entry.adapterStatus === "mvp_enabled").map((entry) => entry.kind);
	    const deferred = PRODUCTION_NODE_CATALOG.filter((entry) => entry.adapterStatus === "deferred").map((entry) => entry.kind);

	    expect(mvpEnabled).toEqual(expect.arrayContaining(["image", "image_generate", "video", "video_generate", "tts", "text_to_speech"]));
	    expect(deferred).toEqual(expect.arrayContaining([
	      "music_generate",
	      "sound_effect_generate",
	      "voice_change",
	      "speech_to_text",
	      "caption_subtitle",
	      "continuity_check",
	      "timeline_assembly",
	      "final_render",
	      "publish_export",
	    ]));
	    expect(getProductionNodeCatalogEntry("final_render")).toMatchObject({
	      adapterStatus: "deferred",
	      mvp: false,
	    });
	  });

	  const baseSpace: ProductionSpace = {
    schemaVersion: "1.0.0",
    productionRunId: "run-116",
    version: 3,
    status: "plan_ready_for_review",
    brief: { summary: "Launch a product proof video", platform: "TikTok", audience: "buyers" },
    contextAssets: [],
    shots: [
      { id: "shot-1", title: "Hook", order: 1, durationSeconds: 4, nodeIds: ["script-1", "image-1"] },
      { id: "shot-2", title: "Proof", order: 2, durationSeconds: 6, nodeIds: ["video-1"] },
    ],
    flowNodes: [
      { id: "script-1", kind: "script", title: "Hook script", status: "ready", estimatedCredits: 0 },
      {
        id: "image-1",
        kind: "image",
        title: "Hero product image",
        status: "ready",
        estimatedCredits: 12,
        outputRefs: [{ outputRefId: "out-image-1", nodeId: "image-1", kind: "image", url: "https://cdn.example.com/image.png" }],
      },
      {
        id: "video-1",
        kind: "video",
        title: "Proof clip",
        status: "warning",
        estimatedCredits: 80,
        outputRefs: [{ outputRefId: "out-video-1", nodeId: "video-1", kind: "video", url: "https://cdn.example.com/video.mp4" }],
      },
    ],
    flowEdges: [
      { id: "edge-1", source: "script-1", target: "image-1", kind: "dependency" },
      { id: "edge-2", source: "image-1", target: "video-1", kind: "reference" },
    ],
    cues: [
      { id: "cue-2", shotId: "shot-2", startSeconds: 4, endSeconds: 10, kind: "shot", label: "Proof" },
      { id: "cue-1", shotId: "shot-1", startSeconds: 0, endSeconds: 4, kind: "shot", label: "Hook" },
    ],
  };

  it("validates a minimal ProductionSpace graph and catches duplicate ids, cycles, and missing edges", () => {
    expect(validateProductionSpace(baseSpace)).toMatchObject({ ok: true, issues: [] });

    const invalid: ProductionSpace = {
      ...baseSpace,
      flowNodes: [...baseSpace.flowNodes, { ...baseSpace.flowNodes[0] }],
      flowEdges: [
        ...baseSpace.flowEdges,
        { id: "edge-2", source: "video-1", target: "script-1" },
        { id: "edge-missing", source: "missing", target: "script-1" },
      ],
    };

    expect(validateProductionSpace(invalid).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "duplicate_node_id",
      "duplicate_edge_id",
      "edge_missing_source",
      "cycle_detected",
    ]));
  });

  it("computes canvas readiness without spending provider generation credits", () => {
    expect(computeProductionSpaceReadiness(baseSpace)).toMatchObject({
      status: "warning",
      readyNodeIds: ["script-1", "image-1"],
      warningNodeIds: ["video-1"],
      estimatedCredits: 92,
    });
  });

  it("invalidates approval only for material node config changes", () => {
    const before = {
      snapshotId: "snap-1",
      version: 1,
      toolSurface: "image" as const,
      adapter: "image" as const,
      config: { prompt: "old" },
      configHash: "hash-a",
    };

    expect(doesProductionNodeConfigChangeInvalidateApproval(before, { ...before, version: 2 })).toBe(false);
    expect(doesProductionNodeConfigChangeInvalidateApproval(before, { ...before, configHash: "hash-b" })).toBe(true);
    expect(doesProductionChangeInvalidateApproval("layout", ["flowNodes.position"])).toBe(false);
    expect(doesProductionChangeInvalidateApproval("shot", ["shots.shot-1"])).toBe(true);
  });

  it("tracks layer versions and invalidates approved state for material edits", () => {
    const shotLayers = applyProductionLayerVersionChange(baseSpace, 4, "shot", ["shots.shot-1"]);
    expect(shotLayers).toMatchObject({
      spaceVersion: 4,
      briefVersion: 3,
      canvasLayoutVersion: 3,
      shotVersions: { "shot-1": 4, "shot-2": 3 },
    });

    const layoutLayers = applyProductionLayerVersionChange({ ...baseSpace, layerVersions: shotLayers }, 5, "layout", ["flowNodes.position"]);
    expect(layoutLayers.canvasLayoutVersion).toBe(5);
    expect(layoutLayers.shotVersions["shot-1"]).toBe(4);

    const approvedSpace: ProductionSpace = {
      ...baseSpace,
      approvalState: { status: "approved", approvalVersion: 3, approvedAt: "2026-05-22T00:00:00.000Z", approvedByUserId: 7 },
    };
    expect(applyProductionApprovalInvalidation(approvedSpace, 7, "layout", ["flowNodes.position"])?.status).toBe("approved");
    const invalidated = applyProductionApprovalInvalidation(approvedSpace, 7, "brief", ["brief.summary"]);
    expect(invalidated).toMatchObject({
      status: "invalidated",
      approvalVersion: 4,
      invalidatedByUserId: 7,
      invalidationReason: "brief",
      invalidatedChangedFields: ["brief.summary"],
    });
    expect(getProductionLayerVersions({ ...baseSpace, layerVersions: layoutLayers }).canvasLayoutVersion).toBe(5);
  });

  it("derives ordered handoff payloads with output refs and cue sheet", () => {
    const payload = deriveProductionHandoffPayload(baseSpace, "video_edit", { tenantId: "tenant-1" });

    expect(payload).toMatchObject({
      schemaVersion: "1.0.0",
      target: "video_edit",
      productionRunId: "run-116",
      sourceSpaceVersion: 3,
    });
    expect(payload.idempotencyKey.startsWith("tenant-1:run-116:video_edit:")).toBe(true);
    expect(payload.orderedShots.map((shot) => shot.shotId)).toEqual(["shot-1", "shot-2"]);
    expect(payload.orderedShots.flatMap((shot) => shot.nodeOutputRefs.map((ref) => ref.outputRefId))).toEqual([
      "out-image-1",
      "out-video-1",
    ]);
    expect(payload.cues.map((cue) => cue.id)).toEqual(["cue-1", "cue-2"]);
  });

  it("enforces node catalog adapters for config snapshots and execution", () => {
    expect(validateProductionNodeConfigSnapshotAgainstCatalog({
      id: "image-1",
      kind: "image",
    }, {
      snapshotId: "config-image",
      version: 1,
      toolSurface: "image",
      adapter: "image",
      config: {},
      configHash: "hash-image",
    })).toMatchObject({ ok: true });

    expect(validateProductionNodeConfigSnapshotAgainstCatalog({
      id: "music-1",
      kind: "music_generate",
    }, {
      snapshotId: "config-music",
      version: 1,
      toolSurface: "audio",
      adapter: "tts",
      config: {},
      configHash: "hash-music",
    })).toMatchObject({ ok: false, reason: "production_node_adapter_deferred" });

    expect(validateProductionExecutableNodeAgainstCatalog({
      id: "shot-1",
      kind: "video_shot",
      title: "Shot group",
      status: "ready",
    })).toMatchObject({ ok: false, reason: "production_node_adapter_preview_only" });
  });

  it("blocks product handoff when claim evidence is missing or self-referential", () => {
    const result = validateProductionSpace({
      ...baseSpace,
      productEvidenceManifest: {
        manifestId: "manifest-1",
        status: "blocked",
        requiredClaimIds: ["claim-1"],
        warnings: [],
        products: [
          {
            id: "product-asset-1",
            productId: "product-1",
            title: "Serum",
            approvalState: "approved",
            claimEvidence: [{ claimId: "claim-1", evidenceIds: ["claim-1"], status: "blocked" }],
          },
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "product_evidence_mismatch",
      "blocked_product_evidence",
    ]));
  });
});
