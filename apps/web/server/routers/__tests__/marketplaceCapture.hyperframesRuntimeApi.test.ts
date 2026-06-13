import { describe, expect, it, vi } from "vitest";

import { marketplaceCaptureRouter } from "../marketplaceCapture";
import type { TrpcContext } from "../../_core/context";
import {
  ListHyperframesCreativePresetsOutputSchema,
  RepairHyperframesRenderJobOutputSchema,
} from "@shared/hyperframes/runtimeApiSchemas";
import { getDb } from "../../db";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

function createContext(user: Record<string, unknown> | null): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: user as TrpcContext["user"],
    userToken: null,
    privateVaultToken: null,
    tenantId: "tenant_router",
    publicUrl: "https://example.test",
  };
}

describe("marketplaceCapture HyperFrames runtime API contract", () => {
  it("adds HyperFrames procedures without removing Standard Order procedures", () => {
    const procedures = Object.keys(
      (marketplaceCaptureRouter as unknown as { _def: { procedures: object } })._def
        .procedures
    );

    expect(procedures).toContain("startAutoReview");
    expect(procedures).toContain("getAutoReviewRun");
    expect(procedures).toContain("listAutoReviewRuns");
    expect(procedures).toContain("advanceAutoReviewRun");
    expect(procedures).toContain(
      "selectAutoReviewImageAttemptForStoryboardReview"
    );
    expect(procedures).toContain("cancelAutoReviewRun");
    expect(procedures).toContain("getAutoStoryboardReviewPlan");
    expect(procedures).toContain("startAutoStoryboardReview");
    expect(procedures).toContain("createHyperframesPreview");
    expect(procedures).toContain("getHyperframesRenderJob");
    expect(procedures).toContain("repairHyperframesRenderJob");
    expect(procedures).toContain("listHyperframesTemplates");
    expect(procedures).toContain("listHyperframesCreativePresets");
    expect(procedures).toContain("cancelHyperframesRenderJob");
    expect(procedures).toContain("saveHyperframesRenderToLibrary");
    expect(procedures).toContain("inspectHyperframesRenderDiagnostics");
    expect(procedures).toContain("cancelHyperframesRenderJobAsOperator");
    expect(procedures).toContain("replayHyperframesDeadLetter");
    expect(procedures).toContain("disableHyperframesTemplate");
    expect(procedures).toContain("enableHyperframesTemplate");
  });

  it("validates repair render job output through the runtime API schema", () => {
    const procedure = (marketplaceCaptureRouter as unknown as {
      _def: {
        procedures: Record<string, { _def: { output?: unknown } }>;
      };
    })._def.procedures.repairHyperframesRenderJob;

    expect(procedure._def.output).toBe(RepairHyperframesRenderJobOutputSchema);
  });

  it("exposes creative preset listing through the runtime API schema", () => {
    const procedure = (marketplaceCaptureRouter as unknown as {
      _def: {
        procedures: Record<string, { _def: { output?: unknown } }>;
      };
    })._def.procedures.listHyperframesCreativePresets;

    expect(procedure._def.output).toBe(ListHyperframesCreativePresetsOutputSchema);
  });

  it("requires authentication through the real protectedProcedure middleware", async () => {
    const caller = marketplaceCaptureRouter.createCaller(createContext(null));

    await expect(
      caller.getHyperframesRenderJob({
        renderJobId: "hf_router_1",
        productId: "product_1",
        runId: "mar_1",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.repairHyperframesRenderJob({
        renderJobId: "hf_router_1",
        productId: "product_1",
        runId: "mar_1",
        actionId: "repair_retry_worker_step",
        actionType: "retry_worker_step",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.listHyperframesCreativePresets({})
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns a sanitized tenant-scoped render projection through the router caller", async () => {
    const caller = marketplaceCaptureRouter.createCaller(
      createContext({
        id: 119,
        email: "router@smartspec.local",
        role: "admin",
        currentTenantId: "tenant_router",
      })
    );

    const result = await caller.getHyperframesRenderJob({
      renderJobId: "hf_router_1",
      productId: "product_1",
      runId: "mar_1",
    });

    expect(result.render).toMatchObject({
      renderJobId: "hf_router_1",
      tenantId: "tenant_router",
      productId: "product_1",
      runId: "mar_1",
      status: "not_available",
      redaction: {
        rawHtmlHidden: true,
        signedUrlsHidden: true,
        workerLogsHidden: true,
        storageKeysHidden: true,
      },
    });
    expect(result.render.outputRefs).toEqual([]);
  });

  it("returns backend-derived creative preset availability", async () => {
    const caller = marketplaceCaptureRouter.createCaller(
      createContext({
        id: 119,
        email: "router@smartspec.local",
        role: "admin",
        currentTenantId: "tenant_router",
      })
    );

    const result = await caller.listHyperframesCreativePresets({
      includeCandidate: true,
      category: "overlay",
    });

    expect(result.creativeCapabilities).toMatchObject({
      canUseProducerPresets: false,
      canUseFallbackPresets: false,
      canUseOfficialCliPresets: false,
    });
    expect(result.runtimeCapabilities).toMatchObject({
      diagnosticFallbackOnly: true,
      hyperframesCli: false,
      hyperframesProducer: false,
      runtimeMode: "official_runtime_blocked",
    });
    expect(result.presets.some(preset => preset.id === "hf_text_price_badge_pop_ecommerce_v1")).toBe(true);
    expect(result.presets.some(preset => preset.capabilityState === "producer_ready")).toBe(false);
    expect(result.presetAvailability.hf_text_price_badge_pop_ecommerce_v1).toMatchObject({
      selectable: false,
      fallbackMode: "diagnostic_only",
    });
  });

  it("guards operator diagnostics behind the HyperFrames operator procedure", async () => {
    const caller = marketplaceCaptureRouter.createCaller(
      createContext({
        id: 119,
        email: "viewer@smartspec.local",
        role: "viewer",
        currentTenantId: "tenant_router",
      })
    );

    await expect(
      caller.inspectHyperframesRenderDiagnostics({
        renderJobId: "hf_router_1",
        productId: "product_1",
        runId: "mar_1",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows delegated support diagnostics only when the operator flag is enabled", async () => {
    const flagDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                featureFlags: {
                  marketplaceHyperframesEnabled: true,
                  marketplaceHyperframesWorkerEnabled: true,
                  marketplaceHyperframesLibrarySaveEnabled: false,
                  marketplaceHyperframesOperatorEnabled: true,
                },
              },
            ],
          }),
        }),
      }),
    };
    vi.mocked(getDb)
      .mockResolvedValueOnce(flagDb as any)
      .mockResolvedValueOnce(flagDb as any)
      .mockResolvedValue(null);
    const caller = marketplaceCaptureRouter.createCaller(
      createContext({
        id: 119,
        email: "support@smartspec.local",
        role: "support",
        currentTenantId: "tenant_router",
      })
    );

    const result = await caller.inspectHyperframesRenderDiagnostics({
      renderJobId: "hf_router_1",
      productId: "product_1",
      runId: "mar_1",
    });

    expect(result).toMatchObject({
      redacted: true,
      auditPersistence: {
        persisted: true,
        auditLoggerPersisted: true,
        dbPersisted: false,
      },
    });
  });

  it("returns sanitized operator diagnostics for admins", async () => {
    const caller = marketplaceCaptureRouter.createCaller(
      createContext({
        id: 119,
        email: "admin@smartspec.local",
        role: "admin",
        currentTenantId: "tenant_router",
      })
    );

    const result = await caller.inspectHyperframesRenderDiagnostics({
      renderJobId: "hf_router_1",
      productId: "product_1",
      runId: "mar_1",
    });

    expect(result).toMatchObject({
      redacted: true,
      diagnostics: [],
      render: {
        renderJobId: "hf_router_1",
        tenantId: "tenant_router",
        redaction: {
          rawHtmlHidden: true,
          signedUrlsHidden: true,
          workerLogsHidden: true,
          storageKeysHidden: true,
        },
      },
    });
  });
});
