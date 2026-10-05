/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: posthogMock }));

describe("PostHog consent gate", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.stubEnv("VITE_POSTHOG_API_KEY", "test-project-key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://posthog.example.test");
    vi.clearAllMocks();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("does not initialize or expose analytics before explicit consent", async () => {
    const { getPostHog, initPostHog } = await import("./posthog");
    initPostHog();
    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(getPostHog()).toBeNull();
  });

  it("initializes only after a durable grant and opts in explicitly", async () => {
    const { getPostHog, setAnalyticsConsent } = await import("./posthog");
    setAnalyticsConsent(true);
    expect(posthogMock.init).toHaveBeenCalledWith("test-project-key", expect.objectContaining({
      opt_out_capturing_by_default: true,
      capture_pageview: false,
      autocapture: false,
    }));
    expect(posthogMock.opt_in_capturing).toHaveBeenCalledOnce();
    expect(getPostHog()).not.toBeNull();
  });

  it("opts out, resets identity, and hides the SDK after consent is revoked", async () => {
    const { getPostHog, setAnalyticsConsent } = await import("./posthog");
    setAnalyticsConsent(true);
    setAnalyticsConsent(false);
    expect(posthogMock.opt_out_capturing).toHaveBeenCalledOnce();
    expect(posthogMock.reset).toHaveBeenCalledOnce();
    expect(getPostHog()).toBeNull();
  });

  it("fails closed when the browser cannot persist a consent grant", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage disabled", "SecurityError");
    });
    const { getPostHog, setAnalyticsConsent } = await import("./posthog");
    setAnalyticsConsent(true);
    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(getPostHog()).toBeNull();
  });
});
