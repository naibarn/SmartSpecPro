import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: vi.fn((ctxTenantId: unknown, userTenantId: unknown) => ctxTenantId || userTenantId || null),
}));

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(async () => ({
    marketplaceIntelligenceImportsEnabled: true,
    marketplaceKeywordDiscoveryEnabled: true,
    marketplaceIntelligenceReportsEnabled: true,
    marketplaceReportImageSkillsEnabled: true,
    marketplaceIntelligenceShareableImageEnabled: true,
    marketplaceIntelligenceWatchlistsEnabled: true,
  })),
}));

import type { TrpcContext } from "../../_core/context";
import { getTenantFeatureFlags } from "../../services/tenantFeatureFlagService";
import { clearMarketplaceIntelligenceStoreForTest } from "../../services/marketplaceIntelligenceService";
import { marketplaceIntelligenceRouter } from "../marketplaceIntelligence";

const mockedGetTenantFeatureFlags = vi.mocked(getTenantFeatureFlags);

function restoreDatabaseUrl(value: string | undefined) {
  if (value === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = value;
  }
}

function ctx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "user-1",
      email: "user@example.com",
      name: "User",
      loginMethod: "email",
      role: "user",
      currentTenantId: "tenant-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any,
    req: { ip: "127.0.0.1", headers: {}, protocol: "https" } as any,
    res: { clearCookie: vi.fn() } as any,
    userToken: null,
    tenantId: "tenant-1",
    publicUrl: null,
    ...overrides,
  };
}

describe("marketplaceIntelligenceRouter", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    clearMarketplaceIntelligenceStoreForTest();
    restoreDatabaseUrl(originalDatabaseUrl);
    mockedGetTenantFeatureFlags.mockResolvedValue({
      marketplaceIntelligenceImportsEnabled: true,
      marketplaceKeywordDiscoveryEnabled: true,
      marketplaceIntelligenceReportsEnabled: true,
      marketplaceReportImageSkillsEnabled: true,
      marketplaceIntelligenceShareableImageEnabled: true,
      marketplaceIntelligenceWatchlistsEnabled: true,
    } as any);
  });

  afterEach(() => {
    restoreDatabaseUrl(originalDatabaseUrl);
  });

  it("requires auth", async () => {
    const caller = marketplaceIntelligenceRouter.createCaller(ctx({ user: null }));
    await expect(caller.listSnapshots()).rejects.toThrow(/login/i);
  });

  it("creates a snapshot, discovery, report, watchlist, and diagnostics", async () => {
    const caller = marketplaceIntelligenceRouter.createCaller(ctx());
    const connectorStatus = await caller.getConnectorStatus({ provider: "shopee" });
    const dryRun = await caller.dryRunConnectorSearch({ keyword: "CGM", region: "TH", locale: "th-TH", limit: 2 });
    const fieldSample = await caller.saveFieldSample({ keyword: "CGM", region: "TH", locale: "th-TH", limit: 2 });
    const fieldDictionary = await caller.fieldDictionary();
    const { snapshot } = await caller.createSnapshotFromProbe({ keyword: "CGM", region: "TH", locale: "th-TH", limit: 4 });
    const { snapshot: aliasSnapshot } = await caller.saveSearchSnapshot({ keyword: "CGM", region: "TH", locale: "th-TH", limit: 3 });
    const listAliases = await caller.listSearchSnapshots();
    const snapshotAliasDetail = await caller.getSearchSnapshot({ snapshotId: snapshot.id });
    const discovery = await caller.createDiscovery({ snapshotId: snapshot.id });
    const keywordDiscovery = await caller.createKeywordDiscovery({ snapshotId: snapshot.id });
    const discoveries = await caller.listKeywordDiscoveries();
    const discoveryDetail = await caller.getKeywordDiscovery({ discoveryId: keywordDiscovery.id });
    const refreshedDiscovery = await caller.refreshKeywordDiscoveryFromSnapshot({ snapshotId: snapshot.id });
    const report = await caller.createReport({ snapshotId: snapshot.id, reportType: "executive_image_summary", aspectRatio: "1:1" });
    const generatedReport = await caller.generateSearchReport({ snapshotId: snapshot.id, reportType: "executive_image_summary", aspectRatio: "1:1" });
    const reportDetail = await caller.getReport({ reportId: report.id });
    const reportAliasDetail = await caller.getSearchReport({ reportId: report.id });
    const reportsBySnapshot = await caller.listReportsBySnapshot({ snapshotId: snapshot.id });
    const reportExport = await caller.createReportExport({ snapshotId: snapshot.id, reportType: "executive_image_summary", aspectRatio: "1:1" });
    const bitmapExport = await caller.createReportExport({ snapshotId: snapshot.id, reportType: "shareable_image_summary", aspectRatio: "4:5", exportType: "image_png" });
    const reportExports = await caller.listReportExports({ reportId: reportExport.reportId });
    const reportExportDetail = await caller.getReportExport({ exportId: reportExport.id });
    const watchlist = await caller.createWatchlist({ keyword: "CGM", region: "TH", cadence: "daily" });
    const watchlistDetail = await caller.getWatchlist({ watchlistId: watchlist.id });
    const upsertedWatchlist = await caller.upsertWatchlist({ keyword: "CGM", region: "TH", cadence: "weekly" });
    const watchlistEvent = await caller.recordWatchlistEvent({
      watchlistId: watchlist.id,
      eventType: "hero_sku_change",
      summary: "Hero SKU changed in latest keyword snapshot.",
      latestSnapshotId: snapshot.id,
    });
    const watchlistEvents = await caller.listWatchlistEvents({ watchlistId: watchlist.id });
    const comparison = await caller.compareSnapshots({ baselineSnapshotId: snapshot.id, latestSnapshotId: aliasSnapshot.id });
    const monitorReport = await caller.createMonitorReport({ baselineSnapshotId: snapshot.id, latestSnapshotId: aliasSnapshot.id, aspectRatio: "16:9" });
    const metricEnrichment = await caller.createProductMetricEnrichment({
      productId: "mpp_1",
      snapshotId: snapshot.id,
      itemId: snapshot.items[0].itemId,
    });
    const metricEnrichments = await caller.listProductMetricEnrichments({ productId: "mpp_1" });
    const cleanup = await caller.runRetentionCleanup();
    const diagnostics = await caller.diagnostics();
    const diagnosticsAlias = await caller.getDiagnostics();

    expect(connectorStatus.status).toBe("not_connected");
    expect(dryRun.dryRun).toBe(true);
    expect(fieldSample.fieldSample.rawPayloadStored).toBe(false);
    expect(fieldSample.fieldSample.fieldCoverage.length).toBeGreaterThan(0);
    expect(fieldDictionary.fields.some((field: any) => field.latestSampleId === fieldSample.fieldSample.id && typeof field.percent === "number")).toBe(true);
    expect(snapshot.metrics.shareOfShelfByBrand.length).toBeGreaterThan(0);
    expect(aliasSnapshot.itemCount).toBe(3);
    expect(listAliases.snapshots.length).toBeGreaterThanOrEqual(2);
    expect(snapshotAliasDetail.id).toBe(snapshot.id);
    expect(discovery.productFamilies.length).toBeGreaterThan(0);
    expect(discoveries.discoveries.map((item) => item.id)).toContain(keywordDiscovery.id);
    expect(discoveryDetail.id).toBe(keywordDiscovery.id);
    expect(refreshedDiscovery.snapshotId).toBe(snapshot.id);
    expect(report.promptPayload.model).toBe("gpt-image-2");
    expect(generatedReport.snapshotId).toBe(snapshot.id);
    expect(reportDetail.id).toBe(report.id);
    expect(reportAliasDetail.id).toBe(report.id);
    expect(reportsBySnapshot.reports.map((item) => item.id)).toContain(report.id);
    expect(reportExport.exportType).toBe("image_prompt");
    expect(bitmapExport).toMatchObject({ exportType: "image_png", aspectRatio: "4:5", status: "provider_required" });
    expect(reportExports.exports.map((item) => item.id)).toContain(reportExport.id);
    expect(reportExportDetail.id).toBe(reportExport.id);
    expect(watchlist.keyword).toBe("CGM");
    expect(watchlistDetail.id).toBe(watchlist.id);
    expect(upsertedWatchlist.cadence).toBe("weekly");
    expect(watchlistEvent.eventType).toBe("hero_sku_change");
    expect(watchlistEvents).toHaveLength(1);
    expect(comparison.latestSnapshotId).toBe(aliasSnapshot.id);
    expect(monitorReport.reportType).toBe("multi_day_sku_monitor");
    expect(metricEnrichment.reviewState).toBe("confirmed");
    expect(metricEnrichments).toHaveLength(1);
    expect(cleanup.normalizedSnapshotsPreserved).toBe(true);
    expect(diagnostics.snapshotCount).toBeGreaterThanOrEqual(2);
    expect(diagnostics.fieldSampleCount).toBeGreaterThanOrEqual(1);
    expect(diagnostics.audit.eventCount).toBeGreaterThan(0);
    expect(diagnostics.rateLimits.activeBuckets.length).toBeGreaterThan(0);
    expect(diagnosticsAlias.reportCount).toBe(diagnostics.reportCount);
  });

  it("fails closed for write actions when marketplace intelligence import flag is disabled", async () => {
    process.env.DATABASE_URL = "postgres://example.invalid/test";
    mockedGetTenantFeatureFlags.mockResolvedValue({
      marketplaceIntelligenceImportsEnabled: false,
    } as any);
    const caller = marketplaceIntelligenceRouter.createCaller(ctx());

    await expect(caller.saveFieldSample({ keyword: "CGM" })).rejects.toThrow(/marketplaceIntelligenceImportsEnabled/);
  });
});
