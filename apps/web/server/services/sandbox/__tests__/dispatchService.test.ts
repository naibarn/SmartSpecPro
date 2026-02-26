import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock("../../../_core/env", () => ({
  ENV: {
    pythonBackendUrl: "http://localhost:8000",
    webGatewayToken: "test-token-123",
  },
}));

// Mock global fetch
vi.stubGlobal("fetch", mockFetch);

import {
  dispatchToSandbox,
  shouldUseSandbox,
  type SandboxDispatchRequest,
} from "../dispatchService";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset env overrides
  delete process.env.OPENSANDBOX_ENABLED;
});

describe("shouldUseSandbox", () => {
  it("returns false when OPENSANDBOX_ENABLED is false", () => {
    process.env.OPENSANDBOX_ENABLED = "false";
    expect(shouldUseSandbox("sandbox-code")).toBe(false);
  });

  it("returns false for core-text execution mode", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("core-text")).toBe(false);
  });

  it("returns false for llm-only execution mode", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("llm-only")).toBe(false);
  });

  it("returns true for sandbox-code when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("sandbox-code")).toBe(true);
  });

  it("returns true for sandbox-command when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("sandbox-command")).toBe(true);
  });

  it("returns true for sandbox-media when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("sandbox-media")).toBe(true);
  });

  it("returns true for media-generate when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("media-generate")).toBe(true);
  });

  it("returns true for sandbox-browser when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("sandbox-browser")).toBe(true);
  });

  it("returns true for sandbox-file when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("sandbox-file")).toBe(true);
  });
});

describe("dispatchToSandbox", () => {
  it("sends correct request to Python backend", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ job_id: "job-123" }),
    });

    const request: SandboxDispatchRequest = {
      featureType: "media",
      executionMode: "sandbox-media",
      tenantId: "tenant-1",
      userId: 42,
      inputFiles: [],
    };

    const result = await dispatchToSandbox(request);
    expect(result.jobId).toBe("job-123");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/internal/sandbox/dispatch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("throws on Python backend error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const request: SandboxDispatchRequest = {
      featureType: "media",
      executionMode: "sandbox-media",
      tenantId: "tenant-1",
      userId: 42,
      inputFiles: [],
    };

    await expect(dispatchToSandbox(request)).rejects.toThrow();
  });
});
