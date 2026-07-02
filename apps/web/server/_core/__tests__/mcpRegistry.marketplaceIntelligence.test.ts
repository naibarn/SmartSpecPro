import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(async () => ({
    marketplaceIntelligenceMcpWritesEnabled: true,
    marketplaceIntelligenceImportsEnabled: true,
    marketplaceIntelligenceReportsEnabled: true,
    marketplaceIntelligenceWatchlistsEnabled: true,
  })),
}));

import {
  executeMcpToolByName,
  listMcpToolsForSession,
  type McpToolSession,
} from "../mcpRegistry";
import { clearMarketplaceIntelligenceStoreForTest } from "../../services/marketplaceIntelligenceService";
import {
  clearConnectorGrantStoreForTest,
  completeConnectorAuthorization,
  startConnectorAuthorization,
} from "../../services/marketplaceConnectorGrantService";
import { getTenantFeatureFlags } from "../../services/tenantFeatureFlagService";

const mockedGetTenantFeatureFlags = vi.mocked(getTenantFeatureFlags);

function restoreDatabaseUrl(value: string | undefined) {
  if (value === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = value;
  }
}

function session(scopes: string[]): McpToolSession {
  return {
    state: "ready",
    authMode: "session",
    tenantId: "tenant-1",
    userId: 1,
    apiKeyId: null,
    scopes,
    createdAt: new Date().toISOString(),
  };
}

describe("MCP marketplace intelligence registry tools", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    clearMarketplaceIntelligenceStoreForTest();
    clearConnectorGrantStoreForTest();
    restoreDatabaseUrl(originalDatabaseUrl);
    mockedGetTenantFeatureFlags.mockResolvedValue({
      marketplaceIntelligenceMcpWritesEnabled: true,
      marketplaceIntelligenceImportsEnabled: true,
      marketplaceIntelligenceReportsEnabled: true,
      marketplaceIntelligenceWatchlistsEnabled: true,
    } as any);
  });

  afterEach(() => {
    restoreDatabaseUrl(originalDatabaseUrl);
  });

  it("lists marketplace intelligence tools according to read/write scopes", async () => {
    const readOnly = await listMcpToolsForSession({
      session: session(["mcp:read"]),
      delegatedManifest: null,
      idempotencyKey: null,
    });
    const readWrite = await listMcpToolsForSession({
      session: session(["mcp:read", "mcp:write"]),
      delegatedManifest: null,
      idempotencyKey: null,
    });

    expect(readOnly.tools.map((tool) => tool.name)).toContain("smartspec.marketplace_intelligence.snapshots.list");
    expect(readOnly.tools.map((tool) => tool.name)).toContain("smartspec.marketplace_intelligence.watchlists.list");
    expect(readOnly.hidden.map((tool) => tool.name)).toContain("smartspec.marketplace_intelligence.search_snapshot.save");
    expect(readWrite.tools.map((tool) => tool.name)).toContain("smartspec.marketplace_intelligence.search_snapshot.save");
    expect(readWrite.tools.map((tool) => tool.name)).toContain("smartspec.marketplace_intelligence.report.generate");
    expect(readWrite.tools.map((tool) => tool.name)).toContain("smartspec.marketplace_intelligence.watchlist.upsert");
  });

  async function authorizeMarketplaceWritebackGrant() {
    const auth = {
      ok: true as const,
      mode: "session" as const,
      user: { id: 1, currentTenantId: "tenant-1" },
      userId: 1,
      tenantId: "tenant-1",
      sub: "1",
      scopes: [],
    };
    const started = await startConnectorAuthorization({
      auth,
      provider: "shopee",
      authorizationUrl: "/marketplace-capture/intelligence/connect/authorize?provider=shopee",
      context: { requestTenantId: "tenant-1" },
    });
    await completeConnectorAuthorization({
      auth,
      provider: "shopee",
      authorizationAttemptId: started.authorizationAttemptId,
      context: { requestTenantId: "tenant-1" },
    });
  }

  it("saves an OpenAI-hosted Shopee payload snapshot and generates an evidence-bound report", async () => {
    await authorizeMarketplaceWritebackGrant();
    const ctx = {
      session: session(["mcp:read", "mcp:write"]),
      delegatedManifest: null,
      idempotencyKey: "idem-marketplace-1",
    };
    const saved = await executeMcpToolByName("smartspec.marketplace_intelligence.search_snapshot.save", {
      keyword: "CGM",
      sourceProvider: "openai_hosted_shopee_mcp",
      sourceMetadata: {
        executionHost: "openai_chatgpt",
        upstreamAppId: "asdk_app_697080d6e3f08191925a46ec4917e27f",
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
          monthlySoldCount: 276,
          historicalSoldCount: 6467,
          ratingScore: 4.8,
          reviewCount: 1631,
          shopeeVerified: true,
        },
        {
          rank: 2,
          itemid: 26919549102,
          shopid: 1418373937,
          title: "Ottai M8 CGM",
          shopName: "Ottai Health Global",
          brandName: "Ottai",
          price: 990,
          monthlySoldCount: 1376,
          historicalSoldCount: 10153,
          ratingScore: 4.9,
          reviewCount: 1200,
          shopeeVerified: false,
        },
        {
          rank: 3,
          itemid: 48756732614,
          shopid: 1418373937,
          title: "Ottai M8 CGM 1 ครบชุด",
          shopName: "Ottai Health Global",
          brandName: "Ottai",
          price: 1080,
          monthlySoldCount: 1362,
          historicalSoldCount: 3838,
          ratingScore: 4.91,
          reviewCount: 1086,
          shopeeVerified: false,
        },
      ],
    }, ctx);
    const savedResult = saved.result as Record<string, any>;

    expect(savedResult.snapshotId).toMatch(/^mss_/);
    expect(savedResult.snapshotUrl).toContain(`/marketplace-capture/intelligence/snapshots/${savedResult.snapshotId}`);
    expect(savedResult.sourceMode).toBe("openai_hosted_shopee_mcp");
    expect(savedResult.itemCount).toBe(3);

    const report = await executeMcpToolByName("smartspec.marketplace_intelligence.report.generate", {
      snapshotId: savedResult.snapshotId,
      aspectRatio: "1:1",
    }, ctx);
    const reportResult = report.result as Record<string, any>;

    expect(reportResult.reportId).toMatch(/^msr_/);
    expect(reportResult.reportUrl).toContain(`/marketplace-capture/intelligence/reports/${reportResult.reportId}`);
    expect(reportResult.imageModel).toBe("gpt-image-2");
    expect(reportResult.imagePrompt).toContain("e-commerce competitive intelligence image report");
    expect(reportResult.promptPayload.evidence.snapshot.topItems).toHaveLength(3);
  });

  it("does not save a search snapshot from keyword-only MCP arguments", async () => {
    await authorizeMarketplaceWritebackGrant();
    const ctx = {
      session: session(["mcp:read", "mcp:write"]),
      delegatedManifest: null,
      idempotencyKey: "idem-marketplace-missing-items",
    };

    await expect(executeMcpToolByName("smartspec.marketplace_intelligence.search_snapshot.save", {
      keyword: "CGM",
    }, ctx)).rejects.toThrow();
  });

  it("upserts and lists user-scoped keyword watchlists through MCP", async () => {
    const ctx = {
      session: session(["mcp:read", "mcp:write"]),
      delegatedManifest: null,
      idempotencyKey: "idem-watchlist-1",
    };
    const upserted = await executeMcpToolByName("smartspec.marketplace_intelligence.watchlist.upsert", {
      keyword: "notebook",
      region: "TH",
      cadence: "weekly",
    }, ctx);
    const upsertedResult = upserted.result as Record<string, any>;

    expect(upsertedResult.watchlist.id).toMatch(/^msw_/);
    expect(upsertedResult.watchlist.keyword).toBe("notebook");
    expect(upsertedResult.watchlist.cadence).toBe("weekly");
    expect(upsertedResult.watchlistUrl).toContain(`/marketplace-capture/intelligence/watchlists/${upsertedResult.watchlist.id}`);

    const listed = await executeMcpToolByName("smartspec.marketplace_intelligence.watchlists.list", { limit: 10 }, ctx);
    const listedResult = listed.result as Record<string, any>;

    expect(listedResult.watchlists).toHaveLength(1);
    expect(listedResult.watchlists[0].id).toBe(upsertedResult.watchlist.id);
    expect(listedResult.watchlists[0].url).toContain(upsertedResult.watchlist.id);
  });

  it("blocks marketplace intelligence MCP writes when the tenant write flag is disabled", async () => {
    process.env.DATABASE_URL = "postgres://example.invalid/test";
    mockedGetTenantFeatureFlags.mockResolvedValue({
      marketplaceIntelligenceMcpWritesEnabled: false,
      marketplaceIntelligenceImportsEnabled: true,
    } as any);
    const ctx = {
      session: session(["mcp:read", "mcp:write"]),
      delegatedManifest: null,
      idempotencyKey: "idem-marketplace-denied",
    };

    await expect(executeMcpToolByName("smartspec.marketplace_intelligence.search_snapshot.save", {
      keyword: "CGM",
    }, ctx)).rejects.toThrow(/MCP writes are not enabled/);
  });
});
