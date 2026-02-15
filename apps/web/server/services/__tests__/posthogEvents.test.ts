import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock posthog-node before importing
const mockCapture = vi.fn();
const mockIdentify = vi.fn();
const mockAlias = vi.fn();
const mockShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: mockCapture,
    identify: mockIdentify,
    alias: mockAlias,
    shutdown: mockShutdown,
  })),
}));

describe("PostHog Event Capture (Node.js)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.POSTHOG_API_KEY = "phc_test_key";
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.POSTHOG_API_KEY;
  });

  it("captureServerEvent includes event name and properties", async () => {
    const { captureServerEvent } = await import("../posthog");
    captureServerEvent("user-1", "job_submitted", { job_type: "image" });

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "user-1",
        event: "job_submitted",
        properties: expect.objectContaining({ job_type: "image" }),
      }),
    );
  });

  it("captureServerEvent includes environment in properties", async () => {
    process.env.ENVIRONMENT = "production";
    const { captureServerEvent } = await import("../posthog");
    captureServerEvent("user-1", "media_job_completed", {
      duration_ms: 5000,
      output_size_bytes: 1024000,
    });

    const call = mockCapture.mock.calls[0][0];
    expect(call.properties.environment).toBe("production");
    expect(call.properties.duration_ms).toBe(5000);
    expect(call.properties.output_size_bytes).toBe(1024000);
    delete process.env.ENVIRONMENT;
  });

  it("no-ops when POSTHOG_API_KEY is not set", async () => {
    delete process.env.POSTHOG_API_KEY;
    vi.resetModules();
    const { captureServerEvent } = await import("../posthog");
    captureServerEvent("user-1", "some_event");

    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("shutdownPostHog flushes and cleans up", async () => {
    const { captureServerEvent, shutdownPostHog } = await import("../posthog");
    // Initialize the client by capturing something
    captureServerEvent("user-1", "init_event");
    await shutdownPostHog();

    expect(mockShutdown).toHaveBeenCalled();
  });
});
