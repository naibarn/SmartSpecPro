import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCheckRateLimit = vi.fn();
const mockSet = vi.fn();

vi.mock("../../middleware/distributedRateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("../redisClients", () => ({
  getCacheClient: () => ({ set: mockSet }),
}));

vi.mock("../../db", () => ({
  getDb: () => {
    throw new Error("database not configured in unit test");
  },
}));

import { checkPublicContactAbuse } from "../publicContactAbuseGuard";
import { getPublicContactProtectionConfig } from "../publicContactProtectionSettings";

const baseInput = {
  ip: "198.51.100.10",
  email: "visitor@example.com",
  subject: "Enterprise question",
  message: "Please tell me more about the product.",
  formStartedAt: 8_000,
  nowMs: 10_000,
};

describe("public anonymous contact abuse guard", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4 });
    mockSet.mockReset();
    mockSet.mockResolvedValue("OK");
    vi.restoreAllMocks();
  });

  it("allows a valid development/test submission without Turnstile", async () => {
    await expect(checkPublicContactAbuse(baseInput)).resolves.toEqual({
      allowed: true,
    });
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it("requires a complete production Turnstile configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");

    await expect(
      checkPublicContactAbuse({ ...baseInput, turnstileToken: "token" })
    ).resolves.toMatchObject({
      allowed: false,
      reason: "turnstile_configuration",
      temporary: true,
    });
  });

  it("validates Turnstile action and hostname server-side", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "smartaihub.app");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          action: "public_contact",
          hostname: "smartaihub.app",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    await expect(
      checkPublicContactAbuse({ ...baseInput, turnstileToken: "token" })
    ).resolves.toEqual({ allowed: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rejects invalid Turnstile action or hostname", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "smartaihub.app");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          action: "login",
          hostname: "attacker.example",
        }),
        { status: 200 }
      )
    );

    await expect(
      checkPublicContactAbuse({ ...baseInput, turnstileToken: "token" })
    ).resolves.toMatchObject({ allowed: false, reason: "turnstile_failed" });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("fails closed when Turnstile is unavailable", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "smartaihub.app");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(
      checkPublicContactAbuse({ ...baseInput, turnstileToken: "token" })
    ).resolves.toMatchObject({
      allowed: false,
      reason: "turnstile_unavailable",
      temporary: true,
    });
  });

  it("enforces the IP budget before calling Turnstile", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "smartaihub.app");
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 120,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      checkPublicContactAbuse({ ...baseInput, turnstileToken: "token" })
    ).resolves.toMatchObject({
      allowed: false,
      reason: "rate_limited",
      retryAfter: 120,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects honeypot, fast submissions, and link floods", async () => {
    await expect(
      checkPublicContactAbuse({ ...baseInput, honeypot: "bot" })
    ).resolves.toMatchObject({ allowed: false, reason: "honeypot" });
    await expect(
      checkPublicContactAbuse({ ...baseInput, formStartedAt: 9_000 })
    ).resolves.toMatchObject({
      allowed: false,
      reason: "invalid_form_timing",
    });
    await expect(
      checkPublicContactAbuse({
        ...baseInput,
        message:
          "https://a.example https://b.example https://c.example https://d.example https://e.example",
      })
    ).resolves.toMatchObject({ allowed: false, reason: "too_many_links" });
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("fails closed on Redis errors and suppresses replayed submissions", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      error: "redis_unavailable",
    });
    await expect(checkPublicContactAbuse(baseInput)).resolves.toMatchObject({
      allowed: false,
      reason: "abuse_store_unavailable",
      temporary: true,
    });

    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockSet.mockResolvedValueOnce(null);
    await expect(checkPublicContactAbuse(baseInput)).resolves.toMatchObject({
      allowed: false,
      reason: "duplicate_submission",
    });
  });

  it("loads the Turnstile configuration for server-side validation", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "smartaihub.app");
    await expect(getPublicContactProtectionConfig()).resolves.toEqual({
      siteKey: "site-key",
      secretKey: "secret",
      allowedHostnames: ["smartaihub.app"],
      required: true,
      configured: true,
    });
  });
});
