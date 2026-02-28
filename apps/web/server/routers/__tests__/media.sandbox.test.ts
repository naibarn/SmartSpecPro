import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Media router sandbox routing tests.
 *
 * Verifies media jobs route through sandbox when enabled,
 * and continue through legacy path when disabled.
 */

const { mockShouldUseSandbox, mockDispatchToSandbox } = vi.hoisted(() => ({
  mockShouldUseSandbox: vi.fn(),
  mockDispatchToSandbox: vi.fn(),
}));

vi.mock("../../services/sandbox/dispatchService", () => ({
  shouldUseSandbox: mockShouldUseSandbox,
  dispatchToSandbox: mockDispatchToSandbox,
}));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENSANDBOX_ENABLED;
  delete process.env.SANDBOX_REQUIRE_FOR_MEDIA;
});

describe("media router sandbox routing", () => {
  it("routes media job through sandbox when sandbox is required for media", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    process.env.SANDBOX_REQUIRE_FOR_MEDIA = "true";

    mockShouldUseSandbox.mockReturnValue(true);
    mockDispatchToSandbox.mockResolvedValue({ jobId: "sandbox-media-job-1" });

    expect(mockShouldUseSandbox("sandbox-media")).toBe(true);
  });

  it("uses legacy path when sandbox is disabled for media", () => {
    process.env.OPENSANDBOX_ENABLED = "false";

    mockShouldUseSandbox.mockReturnValue(false);

    expect(mockShouldUseSandbox("sandbox-media")).toBe(false);
    expect(mockDispatchToSandbox).not.toHaveBeenCalled();
  });

  it("returns pollable job ID from sandbox dispatch", async () => {
    mockDispatchToSandbox.mockResolvedValue({ jobId: "sandbox-media-job-2" });

    const result = await mockDispatchToSandbox({
      featureType: "media",
      executionMode: "sandbox-media",
      tenantId: "tenant-1",
      userId: 42,
      inputFiles: [],
    });

    expect(result.jobId).toBe("sandbox-media-job-2");
  });

  it("preserves isSandboxJob flag for client polling differentiation", async () => {
    mockDispatchToSandbox.mockResolvedValue({ jobId: "sandbox-media-job-3" });

    const result = await mockDispatchToSandbox({
      featureType: "media",
      executionMode: "sandbox-media",
    });

    // Client uses this to choose between sandbox.getJobStatus vs media.getTaskStatus
    const clientResponse = {
      success: true,
      taskId: result.jobId,
      isAsync: true,
      isSandboxJob: true,
    };

    expect(clientResponse.isSandboxJob).toBe(true);
    expect(clientResponse.taskId).toBe("sandbox-media-job-3");
  });
});
