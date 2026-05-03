import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MediaJobRateLimitError, WebEngineAdapter } from "../webEngineAdapter";
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

  it("onProgress closes on error event and calls callback", () => {
    const callback = vi.fn();
    adapter.onProgress("job-err", callback);

    const es = MockEventSource.instances[0];
    es.emit("error", {
      jobId: "job-err",
      status: "error",
      progress: 0,
      message: "FFmpeg crashed",
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" }),
    );
    expect(es.closed).toBe(true);
  });

  it("cancelJob throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(adapter.cancelJob("abc123")).rejects.toThrow(
      "Cancel failed: 500",
    );
  });

  it("getStatus throws descriptive error for non-404 failures", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(adapter.getStatus("job-xyz")).rejects.toThrow(
      "Get status failed: 500",
    );
  });

  it("getStatus throws rate limit error with retry-after for 429", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: vi.fn(() => "7") },
    });

    await expect(adapter.getStatus("job-xyz")).rejects.toMatchObject({
      name: "MediaJobRateLimitError",
      retryAfterMs: 7000,
    } satisfies Partial<MediaJobRateLimitError>);
  });

  it("submitJob falls back to statusText when json parsing fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new Error("parse failed")),
    });

    await expect(adapter.submitJob(makeSpec())).rejects.toThrow(
      "Internal Server Error",
    );
  });

  it("uses baseUrl prefix for all requests", async () => {
    const customAdapter = new WebEngineAdapter("https://api.example.com");
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: "remote-123" }),
    });

    await customAdapter.submitJob(makeSpec());

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/media-jobs",
      expect.any(Object),
    );
  });

  it("encodes jobId in URL to prevent injection", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          jobId: "job/../../secret",
          status: "running",
          progress: 0,
        }),
    });

    await adapter.getStatus("job/../../secret");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent("job/../../secret")),
      expect.any(Object),
    );
  });
});
