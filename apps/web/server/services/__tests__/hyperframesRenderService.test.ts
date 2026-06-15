import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockGetMarketplaceProductWithAccess } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockGetMarketplaceProductWithAccess: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../marketplaceProductService", () => ({
  getMarketplaceProductWithAccess: mockGetMarketplaceProductWithAccess,
}));

import { HyperframesArtifactRefSchema } from "@shared/hyperframes/contracts";
import {
  buildHyperframesCompositionInput,
  buildHyperframesFinalCompositeCompositionInput,
} from "../hyperframesCompositionService";
import {
  buildHyperframesRenderJobPayload,
  buildHyperframesRenderProjection,
  cancelHyperframesRenderJob,
  getHyperframesRenderProjection,
  mapOutboxStatusToRenderStatus,
  redactHyperframesRenderProjectionForUser,
  retryHyperframesRenderJob,
} from "../hyperframesRenderService";

function createOutboxSelectDb(job: Record<string, unknown> | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (job ? [job] : []),
        }),
      }),
    }),
  };
}

function createOutboxMutationDb(
  job: Record<string, unknown> | null,
  returningRows: Array<Record<string, unknown>>
) {
  const returning = vi.fn(async () => returningRows);
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (job ? [job] : []),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning }),
      }),
    }),
    returning,
  };
}

describe("hyperframesRenderService", () => {
  beforeEach(() => {
    mockGetDb.mockReset();
    mockGetDb.mockResolvedValue(null);
    mockGetMarketplaceProductWithAccess.mockReset();
    mockGetMarketplaceProductWithAccess.mockResolvedValue({ id: "product_1" });
  });

  it("builds required outbox payload hash fields", () => {
    const composition = buildHyperframesCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: {
        selectedImageUrls: ["https://cdn.example.com/product.png"],
      },
    });
    const payload = buildHyperframesRenderJobPayload({ composition });

    expect(payload).toMatchObject({
      productId: "product_1",
      compositionInputHash: composition.provenance.compositionInputHash,
      templateId: "marketplace_storyboard_motion_9x9_v1",
      platformPresetId: "generic_vertical_9_16",
      renderIntent: "preview",
      compositionMode: "storyboard_motion_preview",
      launchMode: "auto_storyboard_review",
    });
    expect(payload.compositionHtmlHash).toMatch(/^hf_/);
    expect(payload.runtimeProfileHash).toMatch(/^hf_/);
  });

  it("maps missing official runtime packages to a blocked configuration status", () => {
    expect(
      mapOutboxStatusToRenderStatus(
        "failed",
        "HyperFrames CLI runtime package/binary is not available.",
        "hyperframes_render"
      )
    ).toBe("blocked_needs_user");
  });

  it("projects final composite creative and audio metadata into outbox payload", () => {
    const composition = buildHyperframesFinalCompositeCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      finalComposite: {
        finalVideoLengthSec: 8,
        overlayPreset: "spec_highlight",
        subtitlePreset: "classic_box",
        audioPackPresetId: "hf_audio_pack_ecommerce_fast_cut_v1",
        musicPresetId: "hf_audio_music_upbeat_ecommerce_social_v1",
        sfxPresetIds: ["hf_audio_sfx_whoosh_scene_transition_v1"],
        audioEvents: [
          {
            id: "music_bed_main",
            role: "music",
            presetId: "hf_audio_music_upbeat_ecommerce_social_v1",
            visualTrigger: "video_start",
            startSec: 0,
            durationSec: 8,
            volume: 0.18,
            assetRef: "/api/storage/hyperframes/audio-presets/hf_audio_music_upbeat_ecommerce_social_v1.wav",
          },
        ],
        shots: [
          {
            id: "shot_1",
            index: 0,
            sourceVideoUrl: "/api/storage/files/shot-1.mp4",
            startSec: 0,
            durationSec: 8,
          },
        ],
      },
    });
    const payload = buildHyperframesRenderJobPayload({ composition });

    expect(payload.creativePlanHash).toMatch(/^hf_/);
    expect(payload.presetManifestHash).toMatch(/^hf_/);
    expect(payload.audioEventMapHash).toMatch(/^hf_/);
    expect(payload.overlayPresetId).toBe("spec_highlight");
    expect(payload.subtitlePresetId).toBe("classic_box");
    expect(payload.musicPresetId).toBe("hf_audio_music_upbeat_ecommerce_social_v1");
    expect(payload.sfxPresetIds).toEqual(["hf_audio_sfx_whoosh_scene_transition_v1"]);
    expect(payload.rendererPolicyVersion).toBe(
      "official_html_css_browser_final_composite_v1"
    );
  });

  it("hashes the actual HyperFrames composition HTML for final composite provenance", () => {
    const baseInput = {
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      finalComposite: {
        finalVideoLengthSec: 8,
        overlayPreset: "spec_highlight" as const,
        subtitlePreset: "classic_box" as const,
        shots: [
          {
            id: "shot_1",
            index: 0,
            sourceVideoUrl: "/api/storage/files/shot-1.mp4",
            startSec: 0,
            durationSec: 8,
            onScreenText: ["จอใหญ่"],
          },
        ],
      },
    };
    const firstPayload = buildHyperframesRenderJobPayload({
      composition: buildHyperframesFinalCompositeCompositionInput({
        ...baseInput,
        finalComposite: {
          ...baseInput.finalComposite,
          hookText: "จอใหญ่",
        },
      }),
    });
    const secondPayload = buildHyperframesRenderJobPayload({
      composition: buildHyperframesFinalCompositeCompositionInput({
        ...baseInput,
        finalComposite: {
          ...baseInput.finalComposite,
          hookText: "ลดแรงวันนี้",
        },
      }),
    });

    expect(firstPayload.compositionHtmlHash).toMatch(/^hf_/);
    expect(secondPayload.compositionHtmlHash).toMatch(/^hf_/);
    expect(firstPayload.compositionHtmlHash).not.toBe(
      secondPayload.compositionHtmlHash
    );
  });

  it("always returns explicit repairActions arrays", () => {
    const projection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "failed_transient",
      safeDiagnostics: ["storage timeout"],
    });

    expect(projection.repairActions).toHaveLength(1);
    expect(projection.repairActions[0]?.actionType).toBe("retry_worker_step");
    expect(projection.permissions.canRepair).toBe(false);
    expect(projection.redaction.rawHtmlHidden).toBe(true);
  });

  it("exposes user render actions only when the caller can mutate the render", () => {
    const readonlyProjection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "rendering",
      canMutate: false,
    });
    const ownerProjection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_2",
      status: "failed_transient",
      canMutate: true,
    });
    const activeOwnerProjection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_3",
      status: "rendering",
      canMutate: true,
    });

    expect(readonlyProjection.permissions).toMatchObject({
      canCancel: false,
      canRepair: false,
    });
    expect(ownerProjection.permissions).toMatchObject({
      canCancel: false,
      canRepair: true,
    });
    expect(activeOwnerProjection.permissions).toMatchObject({
      canCancel: true,
      canRepair: false,
    });
  });

  it("keeps blocked and operator replay statuses out of self-service repair", () => {
    const blockedProjection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "template_disabled",
    });
    const deadLetterProjection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_2",
      status: "dead_lettered",
    });

    expect(blockedProjection.repairActions).toEqual([]);
    expect(deadLetterProjection.repairActions[0]).toMatchObject({
      actionType: "retry_worker_step",
      requiresOperator: true,
    });
  });

  it("requires product access before exposing same-tenant render status by product context", async () => {
    mockGetDb.mockResolvedValue(
      createOutboxSelectDb({
        id: "hf_render_1",
        tenantId: "tenant_1",
        userId: 1,
        runId: "mar_1",
        status: "completed",
        lastError: null,
        jobType: "hyperframes_render",
        payloadJson: {
          productId: "product_1",
          compositionInputHash: "hf_input",
          renderIntent: "final",
        },
        updatedAt: new Date("2026-06-04T00:00:00.000Z"),
      })
    );
    mockGetMarketplaceProductWithAccess.mockRejectedValueOnce(
      new Error("access denied")
    );

    const projection = await getHyperframesRenderProjection({
      auth: { userId: 2, tenantId: "tenant_1" },
      renderJobId: "hf_render_1",
      productId: "product_1",
      runId: "mar_1",
    });

    expect(mockGetMarketplaceProductWithAccess).toHaveBeenCalledWith(
      "product_1",
      { userId: 2, tenantId: "tenant_1" }
    );
    expect(projection).toMatchObject({
      renderJobId: "hf_render_1",
      productId: "product_1",
      runId: "mar_1",
      status: "not_available",
    });
  });

  it("does not treat queued render jobs as runtime blocked from legacy env config", async () => {
    process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY = "false";
    mockGetDb.mockResolvedValue(
      createOutboxSelectDb({
        id: "hf_render_queued",
        tenantId: "tenant_1",
        userId: 1,
        runId: "mar_1",
        status: "queued",
        attempts: 0,
        lockedBy: null,
        lastError: null,
        jobType: "hyperframes_render",
        payloadJson: {
          productId: "product_1",
          compositionInputHash: "hf_input_queued",
          compositionHtmlHash: "hf_html_queued",
          templateId: "marketplace_storyboard_motion_9x9_v1",
          templateVersion: "1.0.0",
          platformPresetId: "generic_vertical_9_16",
          renderIntent: "preview",
          compositionMode: "storyboard_motion_preview",
        },
        updatedAt: new Date(),
      })
    );

    const projection = await getHyperframesRenderProjection({
      auth: { userId: 1, tenantId: "tenant_1" },
      renderJobId: "hf_render_queued",
      productId: "product_1",
      runId: "mar_1",
    });

    expect(projection).toMatchObject({
      status: "queued",
      templateId: "marketplace_storyboard_motion_9x9_v1",
      renderIntent: "preview",
      compositionInputHash: "hf_input_queued",
    });
    expect(projection.safeDiagnostics.join(" ")).not.toContain(
      "runtime is not ready"
    );
    delete process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY;
  });

  it("closes a stale queued render as completed when runtime output already exists", async () => {
    mockGetDb.mockResolvedValue(
      createOutboxSelectDb({
        id: "hf_render_stale_output",
        tenantId: "tenant_1",
        userId: 1,
        runId: "mar_1",
        status: "queued",
        attempts: 0,
        lockedBy: null,
        lastError: null,
        jobType: "hyperframes_render",
        payloadJson: {
          productId: "product_1",
          compositionInputHash: "hf_input_output",
          compositionHtmlHash: "hf_html_output",
          templateId: "marketplace_storyboard_motion_9x9_v1",
          templateVersion: "1.0.0",
          platformPresetId: "generic_vertical_9_16",
          platformPresetVersion: "1.0.0",
          renderIntent: "preview",
          compositionMode: "storyboard_motion_preview",
          runtimeProfileHash: "hf_runtime",
          outputUrl: "https://cdn.example.test/hyperframes-preview.mp4",
          outputArtifactRef: {
            artifactId: "hf_output_1",
            kind: "hyperframes_render_mp4",
            storageRef:
              "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_stale_output/output.mp4",
            contentHash: "hf_output_hash",
            mimeType: "video/mp4",
            retentionClass: "review",
            redacted: true,
          },
        },
        updatedAt: new Date("2026-06-04T00:00:00.000Z"),
      })
    );

    const projection = await getHyperframesRenderProjection({
      auth: { userId: 1, tenantId: "tenant_1" },
      renderJobId: "hf_render_stale_output",
      productId: "product_1",
      runId: "mar_1",
    });

    expect(projection).toMatchObject({
      status: "completed",
      progressPercent: 100,
      renderIntent: "preview",
    });
    expect(projection.outputRefs[0]).toMatchObject({
      kind: "preview_video",
      url: "https://cdn.example.test/hyperframes-preview.mp4",
      contentHash: "hf_output_hash",
    });
    expect(projection.safeDiagnostics[0]).toContain("output artifact exists");
    expect(projection.safeDiagnostics.join(" ")).not.toContain(
      "runtime is not ready"
    );
  });

  it("stops projecting old queued render jobs as active forever", async () => {
    mockGetDb.mockResolvedValue(
      createOutboxSelectDb({
        id: "hf_render_old_queued",
        tenantId: "tenant_1",
        userId: 1,
        runId: "mar_1",
        status: "queued",
        attempts: 0,
        lockedBy: null,
        lastError: null,
        jobType: "hyperframes_render",
        payloadJson: {
          productId: "product_1",
          compositionInputHash: "hf_input_old_queue",
          compositionHtmlHash: "hf_html_old_queue",
          templateId: "marketplace_storyboard_motion_9x9_v1",
          templateVersion: "1.0.0",
          platformPresetId: "generic_vertical_9_16",
          renderIntent: "preview",
          compositionMode: "storyboard_motion_preview",
        },
        updatedAt: new Date("2026-06-04T00:00:00.000Z"),
      })
    );

    const projection = await getHyperframesRenderProjection({
      auth: { userId: 1, tenantId: "tenant_1" },
      renderJobId: "hf_render_old_queued",
      productId: "product_1",
      runId: "mar_1",
    });

    expect(projection).toMatchObject({
      status: "blocked_needs_user",
      safeMessage:
        "HyperFrames preview ยังไม่เริ่มหลังรอนานกว่าปกติ งาน Storyboard ที่สร้างแล้วไม่ถูกบล็อก",
      progressPercent: 0,
    });
    expect(projection.safeDiagnostics[0]).toContain(
      "stayed queued longer than expected"
    );
    expect(projection.permissions.canCancel).toBe(false);
  });

  it("throws conflict when retry update loses the optimistic race", async () => {
    const db = createOutboxMutationDb(
      {
        id: "hf_render_1",
        tenantId: "tenant_1",
        userId: 1,
        runId: "mar_1",
        status: "failed",
        lastError:
          "HyperFrames runtime execution is not implemented in this web worker; dependency/runtime rollout must provide render.",
        jobType: "hyperframes_render",
        payloadJson: {
          productId: "product_1",
          compositionInputHash: "hf_input",
          renderIntent: "preview",
        },
        updatedAt: new Date("2026-06-04T00:00:00.000Z"),
      },
      []
    );
    mockGetDb.mockResolvedValue(db);

    await expect(
      retryHyperframesRenderJob({
        auth: { userId: 1, tenantId: "tenant_1" },
        renderJobId: "hf_render_1",
        productId: "product_1",
        runId: "mar_1",
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/changed before retry/i),
    });
    expect(db.returning).toHaveBeenCalled();
  });

  it("throws conflict when cancel update no longer matches a cancellable render", async () => {
    const db = createOutboxMutationDb(
      {
        id: "hf_render_1",
        tenantId: "tenant_1",
        userId: 1,
        runId: "mar_1",
        status: "running",
        lastError: null,
        jobType: "hyperframes_render",
        payloadJson: {
          productId: "product_1",
          compositionInputHash: "hf_input",
          renderIntent: "preview",
        },
        updatedAt: new Date("2026-06-04T00:00:00.000Z"),
      },
      []
    );
    mockGetDb.mockResolvedValue(db);

    await expect(
      cancelHyperframesRenderJob({
        auth: { userId: 1, tenantId: "tenant_1" },
        renderJobId: "hf_render_1",
        productId: "product_1",
        runId: "mar_1",
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/changed before cancellation/i),
    });
    expect(db.returning).toHaveBeenCalled();
  });

  it("carries completed output refs and artifact refs from runtime payload", () => {
    const artifact = HyperframesArtifactRefSchema.parse({
      artifactId: "output_1",
      kind: "hyperframes_render_mp4",
      storageRef: "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
      contentHash: "hf_output",
      mimeType: "video/mp4",
      retentionClass: "library",
      redacted: true,
    });
    const projection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "completed",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input",
        compositionHtmlHash: "hf_html",
        templateId: "marketplace_storyboard_motion_9x9_v1",
        templateVersion: "1.0.0",
        templateContentHash: "hf_template",
        platformPresetId: "generic_vertical_9_16",
        platformPresetVersion: "1.0.0",
        renderIntent: "final",
        compositionMode: "storyboard_motion_preview",
        runtimeProfileHash: "hf_runtime",
        launchMode: "auto_storyboard_review",
        traceId: "trace_1",
        correlationId: "corr_1",
        qaStatus: "passed",
        playableProbe: { passed: true, hasVideo: true, hasAudio: true },
      },
      artifactRefs: [artifact],
      outputRefs: [
        {
          outputId: "output_1",
          kind: "final_video",
          url: "https://cdn.example.com/output.mp4",
          storageRef: artifact.storageRef,
          contentHash: artifact.contentHash,
          accessibleLabel: "Final HyperFrames video",
        },
      ],
    });

    expect(projection.outputRefs[0]).toMatchObject({
      kind: "final_video",
      contentHash: "hf_output",
    });
    expect(projection.artifactRefs[0]?.retentionClass).toBe("library");
    expect(projection.qaStatus).toBe("passed");
    expect(projection.compositionHtmlHash).toBe("hf_html");
    expect(projection.runtimeProfileHash).toBe("hf_runtime");
  });

  it("exposes completed final video output links only from sanitized projection refs", () => {
    const projection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_final",
      status: "completed",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input",
        compositionHtmlHash: "hf_html",
        templateId: "marketplace_storyboard_motion_9x9_v1",
        templateVersion: "1.0.0",
        templateContentHash: "hf_template",
        platformPresetId: "generic_vertical_9_16",
        platformPresetVersion: "1.0.0",
        renderIntent: "final",
        compositionMode: "captioned_final_composite",
        runtimeProfileHash: "hf_runtime",
        launchMode: "auto_storyboard_review",
        traceId: "trace_final",
        correlationId: "corr_final",
        qaStatus: "passed",
        playableProbe: { passed: true, hasVideo: true, hasAudio: true },
      },
      outputRefs: [
        {
          outputId: "hf_render_final_output",
          kind: "final_video",
          url: "/api/storage/files/marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_final/output.mp4",
          storageRef:
            "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_final/output.mp4",
          contentHash: "hf_final_content",
          accessibleLabel: "HyperFrames rendered output",
        },
      ],
      updatedAt: "2026-06-04T00:00:00.000Z",
    });
    const publicProjection = redactHyperframesRenderProjectionForUser(projection);

    expect(publicProjection).toMatchObject({
      renderJobId: "hf_render_final",
      updatedAt: "2026-06-04T00:00:00.000Z",
      progressPercent: 100,
      status: "completed",
    });
    expect(publicProjection.outputRefs[0]).toMatchObject({
      kind: "final_video",
      url: "/api/storage/files/marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_final/output.mp4",
      storageRef: null,
      contentHash: "hf_final_content",
    });
  });

  it("downgrades completed final projection when playable probe is missing", () => {
    const projection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_missing_probe",
      status: "completed",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input",
        compositionHtmlHash: "hf_html",
        templateId: "marketplace_storyboard_motion_9x9_v1",
        templateVersion: "1.0.0",
        templateContentHash: "hf_template",
        platformPresetId: "generic_vertical_9_16",
        platformPresetVersion: "1.0.0",
        renderIntent: "final",
        compositionMode: "captioned_final_composite",
        runtimeProfileHash: "hf_runtime",
        launchMode: "auto_storyboard_review",
        traceId: "trace_final",
        correlationId: "corr_final",
        qaStatus: "passed",
      },
      outputRefs: [
        {
          outputId: "hf_render_missing_probe_output",
          kind: "final_video",
          url: "/api/storage/files/marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_missing_probe/output.mp4",
          contentHash: "hf_final_content",
          accessibleLabel: "HyperFrames rendered output",
        },
      ],
    });

    expect(projection.status).toBe("failed_permanent");
    expect(projection.progressPercent).toBe(100);
    expect(projection.safeDiagnostics[0]).toContain("verified playable final video");
  });

  it("does not report completed final renders without playable probe and final video output", async () => {
    mockGetDb.mockResolvedValue(
      createOutboxSelectDb({
        id: "hf_final_missing_output",
        tenantId: "tenant_1",
        userId: 1,
        runId: "mar_1",
        status: "completed",
        attempts: 1,
        lockedBy: null,
        lastError: null,
        jobType: "hyperframes_render",
        payloadJson: {
          productId: "product_1",
          compositionInputHash: "hf_input",
          compositionHtmlHash: "hf_html",
          templateId: "marketplace_storyboard_motion_9x9_v1",
          templateVersion: "1.0.0",
          templateContentHash: "hf_template",
          platformPresetId: "generic_vertical_9_16",
          platformPresetVersion: "1.0.0",
          renderIntent: "final",
          compositionMode: "captioned_final_composite",
          runtimeProfileHash: "hf_runtime",
        },
        updatedAt: new Date("2026-06-04T00:00:00.000Z"),
      })
    );

    const projection = await getHyperframesRenderProjection({
      auth: { userId: 1, tenantId: "tenant_1" },
      renderJobId: "hf_final_missing_output",
      productId: "product_1",
      runId: "mar_1",
    });

    expect(projection.status).toBe("failed_permanent");
    expect(projection.progressPercent).toBe(100);
    expect(projection.outputRefs).toEqual([]);
    expect(projection.safeDiagnostics[0]).toContain("verified playable final video");
  });

  it("redacts normal-user render projections without mutating internal artifact refs", () => {
    const artifact = HyperframesArtifactRefSchema.parse({
      artifactId: "output_1",
      kind: "hyperframes_render_mp4",
      storageRef:
        "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
      contentHash: "hf_output",
      mimeType: "video/mp4",
      retentionClass: "library",
      redacted: true,
    });
    const projection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "completed",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input",
        templateId: "marketplace_storyboard_motion_9x9_v1",
        templateVersion: "1.0.0",
        platformPresetId: "generic_vertical_9_16",
        renderIntent: "final",
        compositionMode: "storyboard_motion_preview",
        qaStatus: "passed",
        playableProbe: { passed: true, hasVideo: true, hasAudio: true },
      },
      artifactRefs: [artifact],
      outputRefs: [
        {
          outputId: "output_1",
          kind: "final_video",
          url: "https://cdn.example.test/output.mp4",
          storageRef: artifact.storageRef,
          contentHash: artifact.contentHash,
          accessibleLabel: "Final HyperFrames video",
        },
      ],
    });

    const publicProjection = redactHyperframesRenderProjectionForUser(projection);

    expect(projection.artifactRefs).toHaveLength(1);
    expect(projection.outputRefs[0]?.storageRef).toContain("marketplace-auto-review/");
    expect(publicProjection.artifactRefs).toEqual([]);
    expect(publicProjection.outputRefs[0]).toMatchObject({
      kind: "final_video",
      storageRef: null,
      contentHash: "hf_output",
    });
    expect(JSON.stringify(publicProjection)).not.toContain("marketplace-auto-review/");
  });

  it("removes signed URLs and private diagnostics from normal-user projections", () => {
    const projection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "failed_transient",
      safeDiagnostics: [
        "failed /tmp/render/x https://cdn.example.test/final.mp4?X-Amz-Signature=abc token=secret marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
      ],
      outputRefs: [
        {
          outputId: "output_1",
          kind: "final_video",
          url: "https://cdn.example.test/final.mp4?X-Amz-Signature=abc",
          thumbnailUrl: "https://cdn.example.test/thumb.png?token=secret",
          storageRef:
            "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
          contentHash: "hf_output",
          accessibleLabel: "Final HyperFrames video",
        },
      ],
    });

    const publicProjection = redactHyperframesRenderProjectionForUser(projection);
    const serialized = JSON.stringify(publicProjection);

    expect(publicProjection.outputRefs[0]?.url).toBeNull();
    expect(publicProjection.outputRefs[0]?.thumbnailUrl).toBeNull();
    expect(publicProjection.safeDiagnostics[0]).toContain("[redacted-url]");
    expect(publicProjection.safeDiagnostics[0]).toContain("[redacted-path]");
    expect(publicProjection.safeDiagnostics[0]).toContain("[redacted-storage-ref]");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("abc");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).not.toContain("marketplace-auto-review/");
    expect(serialized).not.toContain("/tmp/render");
  });

  it("keeps public HTTPS output URLs while stripping benign query strings", () => {
    const projection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "completed",
      outputRefs: [
        {
          outputId: "output_1",
          kind: "final_video",
          url: "https://cdn.example.test/final.mp4?v=hf_output#play",
          thumbnailUrl: "/media/hyperframes/thumb.png?v=1#poster",
          contentHash: "hf_output",
          accessibleLabel: "Final HyperFrames video",
        },
      ],
    });

    const publicProjection = redactHyperframesRenderProjectionForUser(projection);

    expect(publicProjection.outputRefs[0]?.url).toBe(
      "https://cdn.example.test/final.mp4"
    );
    expect(publicProjection.outputRefs[0]?.thumbnailUrl).toBe(
      "/media/hyperframes/thumb.png"
    );
  });

  it("keeps storage API output URLs while hiding raw storage refs", () => {
    const projection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "completed",
      outputRefs: [
        {
          outputId: "output_1",
          kind: "final_video",
          url: "/api/storage/files/marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4?v=1",
          storageRef:
            "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
          contentHash: "hf_output",
          accessibleLabel: "Final HyperFrames video",
        },
      ],
    });

    const publicProjection = redactHyperframesRenderProjectionForUser(projection);

    expect(publicProjection.outputRefs[0]?.url).toBe(
      "/api/storage/files/marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4"
    );
    expect(publicProjection.outputRefs[0]?.storageRef).toBeNull();
    expect(publicProjection.artifactRefs).toEqual([]);
  });

  it("does not expose insecure, credentialed, private, or signed relative output links", () => {
    const projection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "completed",
      outputRefs: [
        {
          outputId: "output_1",
          kind: "final_video",
          url: "http://cdn.example.test/final.mp4",
          thumbnailUrl: "/media/hyperframes/thumb.png?token=secret",
          contentHash: "hf_output",
          accessibleLabel: "Final HyperFrames video",
        },
        {
          outputId: "output_2",
          kind: "snapshot",
          url: "https://user:secret@cdn.example.test/poster.png",
          contentHash: "hf_snapshot",
          accessibleLabel: "Final HyperFrames poster",
        },
        {
          outputId: "output_3",
          kind: "snapshot",
          url: "/api/marketplace-capture/hyperframes/output.mp4?v=1",
          contentHash: "hf_private_api",
          accessibleLabel: "Private API output",
        },
        {
          outputId: "output_4",
          kind: "final_video",
          url: "https://cdn.example.test/final.mp4?refresh_token=secret&bearer=abc",
          contentHash: "hf_signed",
          accessibleLabel: "Signed token output",
        },
      ],
    });

    const publicProjection = redactHyperframesRenderProjectionForUser(projection);

    expect(publicProjection.outputRefs[0]?.url).toBeNull();
    expect(publicProjection.outputRefs[0]?.thumbnailUrl).toBeNull();
    expect(publicProjection.outputRefs[1]?.url).toBeNull();
    expect(publicProjection.outputRefs[2]?.url).toBeNull();
    expect(publicProjection.outputRefs[3]?.url).toBeNull();
  });

  it("maps active outbox status to the visible worker stage by job type", () => {
    expect(
      mapOutboxStatusToRenderStatus("running", null, "hyperframes_asset_stage")
    ).toBe("staging_assets");
    expect(mapOutboxStatusToRenderStatus("locked", null, "hyperframes_lint")).toBe(
      "linting"
    );
    expect(
      mapOutboxStatusToRenderStatus("running", null, "hyperframes_snapshot")
    ).toBe("snapshotting");
    expect(
      mapOutboxStatusToRenderStatus("running", null, "hyperframes_inspect")
    ).toBe("inspecting");
    expect(
      mapOutboxStatusToRenderStatus("running", null, "hyperframes_finalize")
    ).toBe("qa_checking");
    expect(
      mapOutboxStatusToRenderStatus("running", null, "hyperframes_render")
    ).toBe("rendering");
  });

  it("keeps runtime-deferred worker failures transient while QA failures stay permanent", () => {
    expect(
      mapOutboxStatusToRenderStatus(
        "failed",
        "HyperFrames runtime configuration failure: Official HyperFrames HTML/CSS/browser runtime is required for final composite renders."
      )
    ).toBe("blocked_needs_user");
    expect(
      mapOutboxStatusToRenderStatus(
        "failed",
        "HyperFrames runtime execution is not implemented in this web worker; dependency/runtime rollout must provide render, inspect, QA, and artifact persistence."
      )
    ).toBe("failed_transient");
    expect(
      mapOutboxStatusToRenderStatus(
        "failed",
        "HyperFrames runtime transient failure: Command failed: hyperframes render /tmp/work --strict | stdout tail: audio_src_not_found: <audio> element references file(s) not found in the project"
      )
    ).toBe("failed_transient");
    expect(
      mapOutboxStatusToRenderStatus(
        "failed",
        "HyperFrames runtime configuration failure: HyperFrames missing render media asset: media-jobs/assets/missing.mp4"
      )
    ).toBe("blocked_needs_user");
    expect(
      mapOutboxStatusToRenderStatus("failed", "QA rejected unsafe output")
    ).toBe("failed_permanent");
  });
});
