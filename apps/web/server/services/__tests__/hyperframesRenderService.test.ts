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
import { buildHyperframesCompositionInput } from "../hyperframesCompositionService";
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
        "HyperFrames runtime execution is not implemented in this web worker; dependency/runtime rollout must provide render, inspect, QA, and artifact persistence."
      )
    ).toBe("failed_transient");
    expect(
      mapOutboxStatusToRenderStatus("failed", "QA rejected unsafe output")
    ).toBe("failed_permanent");
  });
});
