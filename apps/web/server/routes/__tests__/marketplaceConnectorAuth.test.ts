import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { mockAuthorizeRequest, mockGetDb, mockGetMarketplaceConnectorTenantRuntimeConfig } = vi.hoisted(() => ({
  mockAuthorizeRequest: vi.fn(),
  mockGetDb: vi.fn(),
  mockGetMarketplaceConnectorTenantRuntimeConfig: vi.fn(),
}));

vi.mock("../../_core/authz", async () => {
  const actual = await vi.importActual<typeof import("../../_core/authz")>("../../_core/authz");
  return {
    ...actual,
    authorizeRequest: mockAuthorizeRequest,
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../services/marketplaceConnectorTenantConfigService", () => ({
  getMarketplaceConnectorTenantRuntimeConfig: mockGetMarketplaceConnectorTenantRuntimeConfig,
}));

function makeApp(options: { tenantId?: string } = {}) {
  const app = express();
  if (options.tenantId) {
    app.use((req: express.Request & { tenantId?: string }, _res, next) => {
      req.tenantId = options.tenantId;
      next();
    });
  }
  app.use(express.json());
  return app;
}

describe("marketplace connector authorization routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockGetDb.mockReset();
    mockGetMarketplaceConnectorTenantRuntimeConfig.mockReset();
    mockGetMarketplaceConnectorTenantRuntimeConfig.mockResolvedValue({
      liveProbeUrl: "",
      liveProbeToken: "",
      fixtureFallbackEnabled: false,
      activeGrantTtlDays: 90,
    });
    delete process.env.DATABASE_URL;
    delete process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL;
    delete process.env.MARKETPLACE_CONNECTOR_WRITEBACK_SECRET;
    const { clearConnectorGrantStoreForTest } = await import("../../services/marketplaceConnectorGrantService");
    const { clearMarketplaceIntelligenceStoreForTest } = await import("../../services/marketplaceIntelligenceService");
    clearConnectorGrantStoreForTest();
    clearMarketplaceIntelligenceStoreForTest();
  });

  it("requires a logged-in browser session", async () => {
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp();
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({ ok: false, error: "Unauthorized" });

    const res = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start")
      .send({ provider: "shopee" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("returns a browser authorization URL for an authenticated user", async () => {
    process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL = "https://example.test/shopee-app";
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp();
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: "tenant-1" },
      userId: 1,
      tenantId: "tenant-1",
      sub: "1",
      scopes: [],
    });

    const res = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start")
      .send({ provider: "shopee" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    expect(res.body.authorizationUrl).toBe("https://example.test/shopee-app");
    expect(res.body.authorizationAttemptId).toMatch(/^mcga_/);
    expect(res.body.nextAction).toBe("open_browser");
  });

  it("auto-selects the URL-resolved tenant when the session has no current tenant", async () => {
    process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL = "https://example.test/shopee-app";
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp({ tenantId: "tenant-from-url" });
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: null },
      userId: 1,
      sub: "1",
      scopes: [],
    });

    const started = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start")
      .send({ provider: "shopee" });
    expect(started.status).toBe(200);
    expect(started.body.status).toBe("pending");

    const status = await request(app).get("/api/marketplace-connectors/shopee/status");
    expect(status.status).toBe(200);
    expect(status.body.status).toBe("pending");
  });

  it("can resolve the tenant from an explicit URL query when middleware context is unavailable", async () => {
    process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL = "https://example.test/shopee-app";
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp();
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: null },
      userId: 1,
      sub: "1",
      scopes: [],
    });

    const started = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start?tenantId=tenant-from-query")
      .send({ provider: "shopee" });
    expect(started.status).toBe(200);

    const status = await request(app).get("/api/marketplace-connectors/shopee/status?tenantId=tenant-from-query");
    expect(status.body.status).toBe("pending");
  });

  it("requires an active connector grant before running live probe", async () => {
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp({ tenantId: "tenant-from-url" });
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: null },
      userId: 1,
      sub: "1",
      scopes: [],
    });

    const res = await request(app)
      .post("/api/marketplace-connectors/shopee/probe")
      .send({ keyword: "CGM", region: "TH", locale: "th-TH", limit: 4 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("connector_grant_not_active");
  });

  it("returns recorded MCP probe field discovery only when recorded sample mode is requested", async () => {
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp({ tenantId: "tenant-from-url" });
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: null },
      userId: 1,
      sub: "1",
      scopes: [],
    });

    const res = await request(app)
      .post("/api/marketplace-connectors/shopee/probe")
      .send({ keyword: "CGM", region: "TH", locale: "th-TH", limit: 4, sourceMode: "recorded_sample" });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe("recorded_mcp_sample");
    expect(res.body.itemCount).toBe(4);
    expect(res.body.fieldCoverage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "item_data.item_card_display_price.price",
        percent: 100,
        use: "pricing",
      }),
      expect.objectContaining({
        path: "item_data.item_card_display_sold_count.monthly_sold_count",
        percent: 100,
        use: "sales",
      }),
    ]));
    expect(res.body.capabilitySummary.pricing).toBeGreaterThanOrEqual(90);
  });

  it("saves OpenAI-hosted Shopee write-back payload as a marketplace intelligence snapshot", async () => {
    process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL = "https://example.test/shopee-app";
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp({ tenantId: "tenant-from-url" });
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: null },
      userId: 1,
      sub: "1",
      scopes: [],
    });

    const started = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start")
      .send({ provider: "shopee" });
    await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/complete")
      .send({ provider: "shopee", authorizationAttemptId: started.body.authorizationAttemptId });

    const res = await request(app)
      .post("/api/marketplace-connectors/shopee/writeback/search-snapshot")
      .send({
        platform: "shopee",
        sourceProvider: "openai_hosted_shopee_mcp",
        keyword: "CGM",
        region: "TH",
        locale: "th-TH",
        sourceMetadata: {
          executionHost: "openai_chatgpt",
          upstreamAppId: "asdk_app_697080d6e3f08191925a46ec4917e27f",
          upstreamToolName: "shopee.search",
          requestId: "host-req-1",
        },
        items: [
          {
            rank: 1,
            itemid: 24556542593,
            shopid: 791925750,
            title: "Sinocare iCan CGM",
            shopName: "Sinocare Official",
            brandName: "Sinocare",
            price: 1614,
            originalPrice: 1699,
            discount: 5,
            monthlySoldCount: 276,
            historicalSoldCount: 6467,
            ratingScore: 4.8,
            reviewCount: 1631,
            shopeeVerified: true,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.sourceProvider).toBe("openai_hosted_shopee_mcp");
    expect(res.body.snapshot.source).toBe("openai_hosted_shopee_mcp");
    expect(res.body.snapshot.itemCount).toBe(1);
    expect(res.body.snapshot.items[0]).toMatchObject({
      title: "Sinocare iCan CGM",
      sellerName: "Sinocare Official",
      brand: "Sinocare",
      price: 1614,
      monthlySoldCount: 276,
      itemId: 24556542593,
      shopId: 791925750,
    });
    expect(res.body.snapshot.fieldCoveragePercent).toBeGreaterThan(0);
  });

  it("issues a user-scoped write-back token and accepts external bearer write-back without a browser session", async () => {
    process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL = "https://example.test/shopee-app";
    process.env.MARKETPLACE_CONNECTOR_WRITEBACK_SECRET = "test-writeback-secret";
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp({ tenantId: "tenant-from-url" });
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: null },
      userId: 1,
      sub: "1",
      scopes: [],
    });

    const started = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start")
      .send({ provider: "shopee" });
    await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/complete")
      .send({ provider: "shopee", authorizationAttemptId: started.body.authorizationAttemptId });

    const tokenRes = await request(app)
      .post("/api/marketplace-connectors/shopee/writeback/token")
      .set("host", "smartaihub.app")
      .set("x-forwarded-proto", "https")
      .send({});

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.writeBackToken).toMatch(/^mci_wb_/);
    expect(tokenRes.body.endpointUrl).toBe("https://smartaihub.app/api/marketplace-connectors/shopee/writeback/search-snapshot");
    expect(tokenRes.body.prompt).toContain("Authorization: Bearer mci_wb_");

    mockAuthorizeRequest.mockResolvedValue({ ok: false, error: "No browser session" });

    const res = await request(app)
      .post("/api/marketplace-connectors/shopee/writeback/search-snapshot")
      .set("authorization", `Bearer ${tokenRes.body.writeBackToken}`)
      .send({
        platform: "shopee",
        sourceProvider: "openai_hosted_shopee_mcp",
        keyword: "notebook",
        region: "TH",
        locale: "th-TH",
        sourceMetadata: {
          executionHost: "openai_chatgpt",
          upstreamAppId: "asdk_app_697080d6e3f08191925a46ec4917e27f",
          upstreamToolName: "shopee.search",
        },
        items: [
          {
            rank: 1,
            itemid: 111,
            shopid: 222,
            title: "Live notebook from upstream host",
            shopName: "Notebook Official",
            brandName: "NotebookBrand",
            price: 15990,
            monthlySoldCount: 22,
            ratingScore: 4.9,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.authMode).toBe("writeback_token");
    expect(res.body.snapshot.keyword).toBe("notebook");
    expect(res.body.snapshot.items[0]).toMatchObject({
      title: "Live notebook from upstream host",
      sellerName: "Notebook Official",
      itemId: 111,
      shopId: 222,
      price: 15990,
    });
  });

  it("invalidates write-back tokens when the user revokes the connector grant", async () => {
    process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL = "https://example.test/shopee-app";
    process.env.MARKETPLACE_CONNECTOR_WRITEBACK_SECRET = "test-writeback-secret";
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp({ tenantId: "tenant-from-url" });
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: null },
      userId: 1,
      sub: "1",
      scopes: [],
    });

    const started = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start")
      .send({ provider: "shopee" });
    await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/complete")
      .send({ provider: "shopee", authorizationAttemptId: started.body.authorizationAttemptId });
    const tokenRes = await request(app)
      .post("/api/marketplace-connectors/shopee/writeback/token")
      .send({});
    await request(app)
      .post("/api/marketplace-connectors/shopee/revoke")
      .send({ provider: "shopee" });

    mockAuthorizeRequest.mockResolvedValue({ ok: false, error: "No browser session" });

    const res = await request(app)
      .post("/api/marketplace-connectors/shopee/writeback/search-snapshot")
      .set("authorization", `Bearer ${tokenRes.body.writeBackToken}`)
      .send({
        platform: "shopee",
        sourceProvider: "openai_hosted_shopee_mcp",
        keyword: "CGM",
        items: [{ title: "CGM", itemid: 1, shopid: 2, price: 100 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("connector_grant_not_active");
  });

  it("rejects OpenAI-hosted write-back payload when the user grant is not active", async () => {
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp({ tenantId: "tenant-from-url" });
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: null },
      userId: 1,
      sub: "1",
      scopes: [],
    });

    const res = await request(app)
      .post("/api/marketplace-connectors/shopee/writeback/search-snapshot")
      .send({
        platform: "shopee",
        sourceProvider: "openai_hosted_shopee_mcp",
        keyword: "CGM",
        items: [{ title: "CGM", itemid: 1, shopid: 2, price: 100 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("connector_grant_not_active");
  });

  it("runs a configured live connector probe after authorization", async () => {
    process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL = "https://example.test/shopee-app";
    mockGetMarketplaceConnectorTenantRuntimeConfig.mockResolvedValue({
      liveProbeUrl: "https://connector.example.test/shopee/probe",
      liveProbeToken: "",
      fixtureFallbackEnabled: false,
      activeGrantTtlDays: 90,
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      items: [
        {
          item_basic: {
            itemid: 987,
            shopid: 654,
            name: "Live notebook listing",
            shop_name: "Live Seller",
            brand: "LiveBrand",
            price: 1599000000,
            price_before_discount: 1899000000,
            raw_discount: 16,
            sold: 42,
            historical_sold: 420,
            rating_star: 4.8,
            rating_count: [12],
            shopee_verified: true,
            image: "live-image",
          },
        },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp();
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: "tenant-1" },
      userId: 1,
      tenantId: "tenant-1",
      sub: "1",
      scopes: [],
    });

    const started = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start")
      .send({ provider: "shopee" });
    await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/complete")
      .send({ provider: "shopee", authorizationAttemptId: started.body.authorizationAttemptId });

    const res = await request(app)
      .post("/api/marketplace-connectors/shopee/probe")
      .send({ keyword: "notebook", region: "TH", locale: "th-TH", limit: 10 });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://connector.example.test/shopee/probe", expect.objectContaining({
      method: "POST",
    }));
    expect(res.body.source).toBe("live_mcp");
    expect(res.body.keyword).toBe("notebook");
    expect(res.body.items[0]).toMatchObject({
      title: "Live notebook listing",
      sellerName: "Live Seller",
      brand: "LiveBrand",
      price: 15990,
      itemId: 987,
      shopId: 654,
    });
  });

  it("does not fall back to recorded data when an active grant has no live MCP execution attached", async () => {
    process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL = "https://example.test/shopee-app";
    mockGetMarketplaceConnectorTenantRuntimeConfig.mockResolvedValue({
      liveProbeUrl: "",
      liveProbeToken: "",
      fixtureFallbackEnabled: true,
      activeGrantTtlDays: 90,
    });
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp();
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: "tenant-1" },
      userId: 1,
      tenantId: "tenant-1",
      sub: "1",
      scopes: [],
    });

    const started = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start")
      .send({ provider: "shopee" });
    await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/complete")
      .send({ provider: "shopee", authorizationAttemptId: started.body.authorizationAttemptId });

    const res = await request(app)
      .post("/api/marketplace-connectors/shopee/probe")
      .send({ keyword: "CGM", region: "TH", locale: "th-TH", limit: 4, sourceMode: "live" });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("live_connector_not_configured");
    expect(res.body.error.message).toMatch(/MCP live execution is not attached/i);
  });

  it("returns not_connected before a user starts authorization", async () => {
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp();
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: "tenant-1" },
      userId: 1,
      tenantId: "tenant-1",
      sub: "1",
      scopes: [],
    });

    const res = await request(app).get("/api/marketplace-connectors/shopee/status");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("not_connected");
    expect(res.body.grantHashPrefix).toBeNull();
  });

  it("does not leak raw SQL when connector grant storage has not been migrated", async () => {
    process.env.DATABASE_URL = "postgres://example.test/smartspec";
    const schemaError = Object.assign(
      new Error('Failed query: select "id", "tenantId" from "marketplace_connector_grants"'),
      { code: "42P01" },
    );
    mockGetDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              throw schemaError;
            },
          }),
        }),
      }),
    });
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp();
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: "tenant-1" },
      userId: 1,
      tenantId: "tenant-1",
      sub: "1",
      scopes: [],
    });

    const res = await request(app).get("/api/marketplace-connectors/shopee/status");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("not_connected");
    expect(res.body.message).toContain("database migrations");
    expect(JSON.stringify(res.body)).not.toContain("Failed query");
    expect(JSON.stringify(res.body)).not.toContain("marketplace_connector_grants");
  });

  it("returns an actionable storage error instead of raw SQL when starting authorization before migrations", async () => {
    process.env.DATABASE_URL = "postgres://example.test/smartspec";
    process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL = "https://example.test/shopee-app";
    const schemaError = Object.assign(
      new Error('Failed query: insert into "marketplace_connector_grants"'),
      { code: "42P01" },
    );
    mockGetDb.mockReturnValue({
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: async () => {
            throw schemaError;
          },
        }),
      }),
    });
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp();
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: "tenant-1" },
      userId: 1,
      tenantId: "tenant-1",
      sub: "1",
      scopes: [],
    });

    const res = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start")
      .send({ provider: "shopee" });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("connector_grant_storage_unavailable");
    expect(res.body.error.message).toContain("database migrations");
    expect(JSON.stringify(res.body)).not.toContain("Failed query");
    expect(JSON.stringify(res.body)).not.toContain("marketplace_connector_grants");
  });

  it("completes and revokes the browser grant without exposing stored secrets", async () => {
    process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL = "https://example.test/shopee-app";
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp();
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: "tenant-1" },
      userId: 1,
      tenantId: "tenant-1",
      sub: "1",
      scopes: [],
    });

    const started = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start")
      .send({ provider: "shopee" });
    const completed = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/complete")
      .send({ provider: "shopee", authorizationAttemptId: started.body.authorizationAttemptId });

    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("active");
    expect(completed.body.authorizationAttemptId).toBeNull();
    expect(completed.body.grantHashPrefix).toHaveLength(12);
    expect(Date.parse(completed.body.expiresAt) - Date.now()).toBeGreaterThan(80 * 24 * 60 * 60 * 1000);
    expect(JSON.stringify(completed.body)).not.toContain("mcg_");

    const events = await request(app).get("/api/marketplace-connectors/shopee/events");
    expect(events.status).toBe(200);
    expect(events.body.events.map((event: { type: string }) => event.type)).toContain("authorization_completed");

    const revoked = await request(app)
      .post("/api/marketplace-connectors/shopee/revoke")
      .send({ provider: "shopee" });
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe("revoked");
    expect(revoked.body.expiresAt).toBeNull();
  });

  it("completes a pending browser grant even when the refreshed page no longer has the raw attempt id", async () => {
    process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL = "https://example.test/shopee-app";
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp();
    registerMarketplaceConnectorAuthRoutes(app);
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: "tenant-1" },
      userId: 1,
      tenantId: "tenant-1",
      sub: "1",
      scopes: [],
    });

    await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start")
      .send({ provider: "shopee" });
    const completed = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/complete")
      .send({ provider: "shopee", authorizationAttemptId: null });

    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("active");
    expect(completed.body.grantHashPrefix).toHaveLength(12);
  });

  it("isolates grant state by tenant and user", async () => {
    process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL = "https://example.test/shopee-app";
    const { registerMarketplaceConnectorAuthRoutes } = await import("../marketplaceConnectorAuth");
    const app = makeApp();
    registerMarketplaceConnectorAuthRoutes(app);
    const authForUserOne = {
      ok: true,
      mode: "session",
      user: { id: 1, currentTenantId: "tenant-1" },
      userId: 1,
      tenantId: "tenant-1",
      sub: "1",
      scopes: [],
    };
    mockAuthorizeRequest.mockResolvedValue(authForUserOne);

    const started = await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/start")
      .send({ provider: "shopee" });
    await request(app)
      .post("/api/marketplace-connectors/shopee/authorize/complete")
      .send({ provider: "shopee", authorizationAttemptId: started.body.authorizationAttemptId });

    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 2, currentTenantId: "tenant-1" },
      userId: 2,
      tenantId: "tenant-1",
      sub: "2",
      scopes: [],
    });
    const otherUser = await request(app).get("/api/marketplace-connectors/shopee/status");
    expect(otherUser.body.status).toBe("not_connected");

    mockAuthorizeRequest.mockResolvedValue({
      ...authForUserOne,
      user: { id: 1, currentTenantId: "tenant-2" },
      tenantId: "tenant-2",
    });
    const otherTenant = await request(app).get("/api/marketplace-connectors/shopee/status");
    expect(otherTenant.body.status).toBe("not_connected");
  });
});
