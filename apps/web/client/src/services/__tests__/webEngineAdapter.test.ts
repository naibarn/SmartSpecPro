import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebEngineAdapter } from "../webEngineAdapter";
import type { MediaJobSpec, MediaJobProgress } from "@shared/types/mediaJob";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Minimal EventSource mock
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  listeners: Record<string, ((event: any) => void)[]> = {};
  closed = false;

  constructor(url: string, opts?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = opts?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, handler: (event: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  close() {
    this.closed = true;
  }

  // Test helper to emit events
  emit(event: string, data: any) {
    const handlers = this.listeners[event] || [];
    for (const h of handlers) {
      h({ data: JSON.stringify(data) });
    }
  }
}

vi.stubGlobal("EventSource", MockEventSource);

function makeSpec(): MediaJobSpec {
  return {
    specVersion: "0.1",
    jobId: "test-job",
    jobType: "probe",
    inputs: {
      assets: [{ assetId: "a1", kind: "video", uri: "file:///test.mp4" }],
    },
    output: { mode: "memory", target: "" },
  };
}

describe("WebEngineAdapter", () => {
  let adapter: WebEngineAdapter;

  beforeEach(() => {
    adapter = new WebEngineAdapter("");
    mockFetch.mockReset();
    MockEventSource.instances = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submitJob sends POST and returns jobId", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: "abc123" }),
    });

    const result = await adapter.submitJob(makeSpec());

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/media-jobs",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    expect(result).toBe("abc123");
  });

  it("submitJob throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "Invalid spec" }),
    });

    await expect(adapter.submitJob(makeSpec())).rejects.toThrow(
      "Invalid spec",
    );
  });

  it("getStatus sends GET and returns progress", async () => {
    const progress: MediaJobProgress = {
      jobId: "abc123",
      status: "running",
      progress: 0.5,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(progress),
    });

    const result = await adapter.getStatus("abc123");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/media-jobs/abc123",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result).toEqual(progress);
  });

  it("getStatus throws 404 for unknown job", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(adapter.getStatus("unknown")).rejects.toThrow("not found");
  });

  it("cancelJob sends DELETE", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await adapter.cancelJob("abc123");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/media-jobs/abc123",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
      }),
    );
  });

  it("onProgress connects to SSE and calls callback on progress events", async () => {
    const callback = vi.fn();
    const unsubscribe = adapter.onProgress("job-123", callback);

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toBe("/api/media-jobs/job-123/events");
    expect(es.withCredentials).toBe(true);

    // Simulate progress events
    es.emit("progress", {
      jobId: "job-123",
      status: "running",
      progress: 0.5,
    });
    es.emit("progress", {
      jobId: "job-123",
      status: "running",
      progress: 0.8,
    });

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ progress: 0.5 }),
    );

    unsubscribe();
    expect(es.closed).toBe(true);
  });

  it("onProgress closes on done event", () => {
    const callback = vi.fn();
    adapter.onProgress("job-123", callback);

    const es = MockEventSource.instances[0];
    es.emit("done", { jobId: "job-123", status: "done", progress: 1.0 });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(es.closed).toBe(true);
  });
});
