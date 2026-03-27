import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetTenantFeatureFlag,
  mockVerifyPageAccess,
  mockGetDb,
  mockCreateRateLimitMiddleware,
} = vi.hoisted(() => {
  process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token";
  return {
    mockGetTenantFeatureFlag: vi.fn(),
    mockVerifyPageAccess: vi.fn(),
    mockGetDb: vi.fn(),
    mockCreateRateLimitMiddleware: vi.fn(
      () => async ({ next }: { next: () => Promise<unknown> }) => next(),
    ),
  };
});

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: mockGetTenantFeatureFlag,
}));

vi.mock("../../services/socialAccessService", () => ({
  verifyPageAccess: mockVerifyPageAccess,
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../_core/rateLimitedProcedure", () => ({
  createRateLimitMiddleware: mockCreateRateLimitMiddleware,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { metaChannelsRouter } from "../metaChannels";

function createCaller() {
  return metaChannelsRouter.createCaller({
    user: {
      id: 42,
      openId: "user-open-id",
      email: "user@example.com",
      name: "Meta User",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      currentTenantId: "tenant-1",
    } as any,
    tenantId: "tenant-1",
    userToken: null,
    privateVaultToken: null,
    publicUrl: "https://example.com",
    req: {
      ip: "127.0.0.1",
      headers: {},
      protocol: "https",
    } as any,
    res: {} as any,
  });
}

describe("metaChannelsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFeatureFlag.mockResolvedValue(true);
    mockVerifyPageAccess.mockResolvedValue({
      id: 77,
      tenantId: "tenant-1",
      connectionId: 11,
      providerPageId: "page_77",
      pageName: "Demo Page",
      status: "active",
      aiActionMode: "draft_only",
      autoSendConfidenceThreshold: 0.95,
      selectedForInbox: true,
      selectedForPublishing: true,
      selectedForModeration: false,
      providerUserId: "meta-user-1",
    });
    mockFetch.mockReset();
    mockGetDb.mockResolvedValue({
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    });
  });

  it("gets the Meta authorization URL from Python", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          authorization_url: "https://www.facebook.com/v25.0/dialog/oauth?client_id=app&state=state-1",
          state: "state-1",
          expires_in: 600,
        }),
        { status: 200 },
      ),
    );

    const caller = createCaller();
    const result = await caller.getAuthUrl();

    expect(result.authorization_url).toContain("facebook.com");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/oauth/meta/authorize?tenant_id=tenant-1&user_id=42"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-internal-token": "test-internal-token",
        }),
      }),
    );
  });

  it("completes OAuth without creating a web session", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "connected",
          connection: { provider: "meta", providerUserId: "meta-user-1" },
          pages: [],
        }),
        { status: 200 },
      ),
    );

    const caller = createCaller();
    const result = await caller.completeOAuth({ code: "oauth-code", state: "oauth-state" });

    expect(result.status).toBe("connected");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/oauth/meta/callback"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          code: "oauth-code",
          state: "oauth-state",
          tenant_id: "tenant-1",
          user_id: 42,
        }),
      }),
    );
  });

  it("connects a page through the internal Python endpoint", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: "connected", page_id: 77 }), { status: 200 }),
    );

    const caller = createCaller();
    const result = await caller.connectPage({ pageId: 77 });

    expect(result).toMatchObject({ status: "connected", page_id: 77 });
    expect(mockVerifyPageAccess).toHaveBeenCalledWith(77, 42, "tenant-1", "tenant-1");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/internal/meta/pages/connect"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ page_id: 77, subscribed_fields: undefined }),
      }),
    );
  });

  it("disconnects a page and clears its internal connection", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: "disconnected", page_id: 77 }), { status: 200 }),
    );

    const caller = createCaller();
    const result = await caller.disconnectPage({ pageId: 77 });

    expect(result).toMatchObject({ status: "disconnected", page_id: 77 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/internal/meta/pages/disconnect"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ page_id: 77 }),
      }),
    );
  });

  it("updates page settings with tenant-scoped access", async () => {
    const caller = createCaller();
    const result = await caller.updatePageSettings({
      pageId: 77,
      aiActionMode: "auto_send",
      autoSendConfidenceThreshold: 0.87,
      selectedForInbox: false,
      selectedForPublishing: true,
      selectedForModeration: true,
    });

    expect(result).toMatchObject({
      pageId: 77,
      aiActionMode: "auto_send",
      autoSendConfidenceThreshold: 0.87,
      selectedForInbox: false,
      selectedForPublishing: true,
      selectedForModeration: true,
    });
    expect(mockGetDb).toHaveBeenCalled();
  });

  it("rejects an invalid aiActionMode", async () => {
    const caller = createCaller();

    await expect(
      caller.updatePageSettings({
        pageId: 77,
        aiActionMode: "invalid" as any,
      }),
    ).rejects.toThrow();
  });

  it("blocks access when the feature flag is disabled", async () => {
    mockGetTenantFeatureFlag.mockResolvedValue(false);
    const caller = createCaller();

    await expect(caller.getConnectionStatus()).rejects.toThrow("Meta Channels are disabled for this tenant");
    await expect(caller.getAuthUrl()).rejects.toThrow("Meta Channels are disabled for this tenant");
    await expect(caller.connectPage({ pageId: 77 })).rejects.toThrow("Meta Channels are disabled for this tenant");
  });
});
