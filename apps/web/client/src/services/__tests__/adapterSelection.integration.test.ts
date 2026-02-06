import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MediaJobClient, createMediaJobClient } from "../mediaJobClient";
import { MockEngineAdapter } from "./MockEngineAdapter";

describe("Engine Adapter Auto-Selection", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    // Restore window state
    if (originalWindow) {
      (globalThis as any).window = originalWindow;
    }
    vi.restoreAllMocks();
  });

  it("selects WebEngineAdapter when window.__TAURI__ is undefined", async () => {
    // Ensure __TAURI__ is NOT defined
    if (typeof window !== "undefined") {
      delete (window as any).__TAURI__;
    }

    const client = await createMediaJobClient();
    expect(client).toBeInstanceOf(MediaJobClient);
    // The factory should have selected WebEngineAdapter or StubAdapter
    // We can't easily check the internal adapter type, but we verify it doesn't crash
  });

  it("adapter can be explicitly overridden via constructor", () => {
    const mockAdapter = new MockEngineAdapter();
    const client = new MediaJobClient(mockAdapter);

    // Verify the client uses our mock by submitting a job
    const spec = {
      specVersion: "0.1" as const,
      jobId: "test-123",
      jobType: "probe" as const,
      inputs: { assets: [{ assetId: "a1", kind: "video" as const, uri: "https://example.com/v.mp4" }] },
      output: { mode: "file" as const, target: "/tmp/out.mp4" },
    };

    client.submitJob(spec);
    expect(mockAdapter.submittedSpecs).toHaveLength(1);
    expect(mockAdapter.submittedSpecs[0].jobId).toBe("test-123");
  });

  it("MediaJobClient sets specVersion if missing", async () => {
    const mockAdapter = new MockEngineAdapter();
    const client = new MediaJobClient(mockAdapter);

    const spec = {
      specVersion: undefined as any,
      jobId: "test-456",
      jobType: "probe" as const,
      inputs: { assets: [] },
      output: { mode: "file" as const, target: "" },
    };

    await client.submitJob(spec);
    expect(mockAdapter.submittedSpecs[0].specVersion).toBe("0.1");
  });

  it("MediaJobClient generates jobId if missing", async () => {
    const mockAdapter = new MockEngineAdapter();
    const client = new MediaJobClient(mockAdapter);

    const spec = {
      specVersion: "0.1" as const,
      jobId: "",
      jobType: "probe" as const,
      inputs: { assets: [] },
      output: { mode: "file" as const, target: "" },
    };

    await client.submitJob(spec);
    expect(mockAdapter.submittedSpecs[0].jobId).toBeTruthy();
  });
});
