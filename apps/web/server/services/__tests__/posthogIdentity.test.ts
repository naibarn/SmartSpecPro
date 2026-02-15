import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock posthog-node before importing the module under test
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

describe("PostHog Identity Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set env so the client initializes
    process.env.POSTHOG_API_KEY = "phc_test_key";
    // Reset module to get fresh client
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.POSTHOG_API_KEY;
  });

  it("aliasUser calls posthog.alias with anonymousId and userId", async () => {
    const { aliasUser } = await import("../posthog");
    aliasUser("anon-123", "user-456");

    expect(mockAlias).toHaveBeenCalledWith({
      distinctId: "user-456",
      alias: "anon-123",
    });
  });

  it("identifyUser calls posthog.identify with userId and properties", async () => {
    const { identifyUser } = await import("../posthog");
    identifyUser("user-456", { email: "test@example.com", plan: "pro" });

    expect(mockIdentify).toHaveBeenCalledWith({
      distinctId: "user-456",
      properties: { email: "test@example.com", plan: "pro" },
    });
  });

  it("captureServerEvent uses userId as distinctId", async () => {
    const { captureServerEvent } = await import("../posthog");
    captureServerEvent("user-456", "test_event", { key: "value" });

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "user-456",
        event: "test_event",
        properties: expect.objectContaining({ key: "value" }),
      }),
    );
    // Ensure distinctId is not an anonymous-looking ID
    const call = mockCapture.mock.calls[0][0];
    expect(call.distinctId).toBe("user-456");
  });
});
