/**
 * Unit tests for `videoRenderer.ts`'s `resolveVideoRenderEngine()` and
 * `executeVideoRender()`, covering the Phase 6 default-engine flip and the
 * automatic per-job `UnsupportedPresetError` fallback to HyperFrames.
 * See planning/remotion-migration/plan.md section 7.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getTenantFeatureFlagsMock,
  executeRemotionRenderMock,
  executeHyperframesCliRenderMock,
  executeHyperframesProducerRenderMock,
  getHyperframesRuntimeModeMock,
} = vi.hoisted(() => ({
  getTenantFeatureFlagsMock: vi.fn(),
  executeRemotionRenderMock: vi.fn(),
  executeHyperframesCliRenderMock: vi.fn(),
  executeHyperframesProducerRenderMock: vi.fn(),
  getHyperframesRuntimeModeMock: vi.fn(),
}));

vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: getTenantFeatureFlagsMock,
}));

vi.mock("../remotionRuntimeAdapter", () => ({
  executeRemotionRender: executeRemotionRenderMock,
}));

vi.mock("../hyperframesRuntimeAdapter", () => ({
  executeHyperframesCliRender: executeHyperframesCliRenderMock,
  executeHyperframesProducerRender: executeHyperframesProducerRenderMock,
  getHyperframesRuntimeMode: getHyperframesRuntimeModeMock,
}));

import { UnsupportedPresetError } from "../remotionCompositionService";
import {
  executeVideoRender,
  resolveVideoRenderEngine,
  type VideoRenderInput,
} from "../videoRenderer";

const baseInput: VideoRenderInput = {
  workspace: "/tmp/workspace",
  outputPath: "/tmp/workspace/out.mp4",
  payload: {},
};

describe("resolveVideoRenderEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantFeatureFlagsMock.mockResolvedValue({
      marketplaceRemotionRendererEnabled: false,
      marketplaceHyperframesRendererForced: false,
    });
  });

  it("defaults to remotion when nothing else is set", async () => {
    const engine = await resolveVideoRenderEngine({ tenantId: "t1", env: {} });
    expect(engine).toBe("remotion");
  });

  it("honors RENDERER_ENGINE=hyperframes as a global kill-switch, overriding tenant flags", async () => {
    getTenantFeatureFlagsMock.mockResolvedValue({
      marketplaceRemotionRendererEnabled: true,
      marketplaceHyperframesRendererForced: false,
    });
    const engine = await resolveVideoRenderEngine({
      tenantId: "t1",
      env: { RENDERER_ENGINE: "hyperframes" },
    });
    expect(engine).toBe("hyperframes");
  });

  it("honors RENDERER_ENGINE=remotion as an explicit global force-on", async () => {
    const engine = await resolveVideoRenderEngine({
      tenantId: "t1",
      env: { RENDERER_ENGINE: "remotion" },
    });
    expect(engine).toBe("remotion");
  });

  it("honors the per-tenant marketplaceHyperframesRendererForced rollback flag", async () => {
    getTenantFeatureFlagsMock.mockResolvedValue({
      marketplaceRemotionRendererEnabled: false,
      marketplaceHyperframesRendererForced: true,
    });
    const engine = await resolveVideoRenderEngine({ tenantId: "t1", env: {} });
    expect(engine).toBe("hyperframes");
  });

  it("honors the legacy marketplaceRemotionRendererEnabled flag (backward compat)", async () => {
    getTenantFeatureFlagsMock.mockResolvedValue({
      marketplaceRemotionRendererEnabled: true,
      marketplaceHyperframesRendererForced: false,
    });
    const engine = await resolveVideoRenderEngine({ tenantId: "t1", env: {} });
    expect(engine).toBe("remotion");
  });

  it("falls through to the default when the tenant flag lookup throws (no DB)", async () => {
    getTenantFeatureFlagsMock.mockRejectedValue(new Error("no DATABASE_URL"));
    const engine = await resolveVideoRenderEngine({ tenantId: "t1", env: {} });
    expect(engine).toBe("remotion");
  });
});

describe("executeVideoRender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHyperframesRuntimeModeMock.mockReturnValue("cli");
    executeHyperframesCliRenderMock.mockResolvedValue({
      outputPath: "/tmp/workspace/out.mp4",
      inputPath: "/tmp/workspace/in.json",
    });
  });

  it("falls back to hyperframes when Remotion throws UnsupportedPresetError", async () => {
    executeRemotionRenderMock.mockRejectedValue(
      new UnsupportedPresetError("preset not ported")
    );

    const result = await executeVideoRender("remotion", baseInput);

    expect(executeRemotionRenderMock).toHaveBeenCalledWith(baseInput);
    expect(executeHyperframesCliRenderMock).toHaveBeenCalled();
    expect(result).toEqual({
      engine: "hyperframes",
      outputPath: "/tmp/workspace/out.mp4",
      inputPath: "/tmp/workspace/in.json",
      result: {
        outputPath: "/tmp/workspace/out.mp4",
        inputPath: "/tmp/workspace/in.json",
      },
    });
  });

  it("re-throws non-UnsupportedPresetError Remotion failures without falling back", async () => {
    const boom = new Error("Chromium crashed");
    executeRemotionRenderMock.mockRejectedValue(boom);

    await expect(executeVideoRender("remotion", baseInput)).rejects.toThrow(
      "Chromium crashed"
    );
    expect(executeHyperframesCliRenderMock).not.toHaveBeenCalled();
  });

  it("returns the Remotion result directly on success, without touching hyperframes", async () => {
    const remotionResult = {
      engine: "remotion" as const,
      outputPath: "/tmp/workspace/out.mp4",
      inputPath: "bundle://serve-url",
      result: {},
    };
    executeRemotionRenderMock.mockResolvedValue(remotionResult);

    const result = await executeVideoRender("remotion", baseInput);

    expect(result).toBe(remotionResult);
    expect(executeHyperframesCliRenderMock).not.toHaveBeenCalled();
  });

  it("uses the hyperframes path directly when engine is explicitly hyperframes", async () => {
    const result = await executeVideoRender("hyperframes", baseInput);

    expect(executeRemotionRenderMock).not.toHaveBeenCalled();
    expect(executeHyperframesCliRenderMock).toHaveBeenCalled();
    expect(result?.engine).toBe("hyperframes");
  });
});
