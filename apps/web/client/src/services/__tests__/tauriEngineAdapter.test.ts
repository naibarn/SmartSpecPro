import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TauriEngineAdapter } from "../tauriEngineAdapter";
import type { MediaJobSpec, MediaJobProgress } from "@shared/types/mediaJob";

// Mock @tauri-apps/api/core
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

// Mock @tauri-apps/api/event
type EventCallback = (event: { payload: any }) => void;
let eventListeners: Map<string, EventCallback[]> = new Map();
const mockUnlisten = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: EventCallback) => {
    const listeners = eventListeners.get(event) || [];
    listeners.push(handler);
    eventListeners.set(event, listeners);
    return Promise.resolve(mockUnlisten);
  },
}));

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

describe("TauriEngineAdapter", () => {
  let adapter: TauriEngineAdapter;

  beforeEach(() => {
    adapter = new TauriEngineAdapter();
    mockInvoke.mockReset();
    mockUnlisten.mockReset();
    eventListeners = new Map();
  });

  it("submitJob calls invoke('submit_media_job') with serialized spec JSON", async () => {
    mockInvoke.mockResolvedValue("test-job");

    const spec = makeSpec();
    const result = await adapter.submitJob(spec);

    expect(mockInvoke).toHaveBeenCalledWith("submit_media_job", {
      specJson: JSON.stringify(spec),
    });
    expect(result).toBe("test-job");
  });

  it("getStatus calls invoke('get_media_job_status') with jobId", async () => {
    const progress: MediaJobProgress = {
      jobId: "test-id",
      status: "running",
      progress: 0.5,
    };
    mockInvoke.mockResolvedValue(progress);

    const result = await adapter.getStatus("test-id");

    expect(mockInvoke).toHaveBeenCalledWith("get_media_job_status", {
      jobId: "test-id",
    });
    expect(result).toEqual(progress);
  });

  it("cancelJob calls invoke('cancel_media_job') with jobId", async () => {
    mockInvoke.mockResolvedValue(undefined);

    await adapter.cancelJob("test-id");

    expect(mockInvoke).toHaveBeenCalledWith("cancel_media_job", {
      jobId: "test-id",
    });
  });

  it("onProgress subscribes to 'media-job-progress' Tauri event and filters by jobId", async () => {
    const callback = vi.fn();
    const unsubscribe = adapter.onProgress("job-123", callback);

    // Wait for the async listener setup
    await vi.waitFor(() => {
      expect(eventListeners.has("media-job-progress")).toBe(true);
    });

    const listeners = eventListeners.get("media-job-progress")!;

    // Emit matching event
    listeners.forEach((l) =>
      l({
        payload: { jobId: "job-123", status: "running", progress: 0.5 },
      }),
    );

    // Emit non-matching event
    listeners.forEach((l) =>
      l({
        payload: { jobId: "job-456", status: "running", progress: 0.3 },
      }),
    );

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      jobId: "job-123",
      status: "running",
      progress: 0.5,
    });

    unsubscribe();
  });
});
