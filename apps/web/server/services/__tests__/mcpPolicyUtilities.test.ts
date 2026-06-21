import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../mcpProviderConfigService", () => ({
  assertMcpProviderConfigReady: vi.fn(async () => undefined),
  getMcpProviderRuntimeConfig: vi.fn(async () => ({
    callbackBaseUrl: "https://app.example.com",
    redirectAllowlist: ["https://app.example.com"],
    provider: {
      clientId: "client-id",
      authorizationUrl: "https://provider.example.com/oauth/authorize",
      tokenUrl: "https://provider.example.com/oauth/token",
      clientSecret: "secret",
      enabled: true,
    },
  })),
}));

describe("MCP policy utilities", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("binds OAuth redirect URI to the selected provider key", async () => {
    const { startMcpOAuth } = await import("../mcpOAuthBroker");

    const result = await startMcpOAuth({
      tenantId: "tenant-1",
      userId: 42,
      providerKey: "higgsfield",
    });

    const authUrl = new URL(result.authorizationUrl);
    const redirectUri = new URL(authUrl.searchParams.get("redirect_uri") ?? "");
    expect(redirectUri.pathname).toBe("/auth/callback/mcp-connect");
    expect(redirectUri.searchParams.get("providerKey")).toBe("higgsfield");
    expect(authUrl.searchParams.get("state")).toBe(result.state);
  });

  it("resolves daily budget windows at UTC day start", async () => {
    const { resolveMcpDailyWindowStart } = await import("../mcpConnectionSharingService");

    expect(resolveMcpDailyWindowStart(new Date("2026-06-18T15:30:00Z")).toISOString()).toBe(
      "2026-06-18T00:00:00.000Z",
    );
  });

  it("redacts secrets, prompts, raw URLs, sessions, and long values from usage summaries", async () => {
    const { redactMcpUsageSummary } = await import("../mcpConnectionService");

    const redacted = redactMcpUsageSummary({
      token: "secret-token",
      prompt: "raw prompt",
      referenceUrl: "https://example.com/raw.png",
      sessionId: "session",
      status: "submitted",
      longSafeValue: "x".repeat(300),
    });

    expect(redacted).toEqual({
      status: "submitted",
      longSafeValue: `${"x".repeat(256)}...`,
    });
  });

  it("builds redacted observability events with required transport labels", async () => {
    const { buildMcpObservabilityEvent } = await import("../mcpObservability");

    const event = buildMcpObservabilityEvent({
      event: "generation_start",
      metadata: {
        transport: "mcp",
        originSurface: "media_studio",
        assetType: "video",
        providerKey: "higgsfield",
        connectionId: "conn-1",
        ownerUserId: 1,
        actorUserId: 2,
        sharedGroupId: 3,
        toolName: "video_generate",
        schemaHash: "abc",
        creditPolicy: "provider_credits_tracked",
      },
      jobId: "task-1",
      providerJobId: "provider-1",
      details: {
        prompt: "raw prompt",
        referenceUrl: "https://example.com/image.png",
        safeCode: "quota_soft",
      },
    });

    expect(event).toMatchObject({
      event: "generation_start",
      provider: "higgsfield",
      transport: "mcp",
      originSurface: "media_studio",
      assetType: "video",
      creditPolicy: "provider_credits_tracked",
      jobId: "task-1",
      providerJobId: "provider-1",
      details: { safeCode: "quota_soft" },
    });
  });
});
