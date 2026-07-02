import { beforeEach, describe, expect, it } from "vitest";
import { createRecordedShopeeMcpProbe } from "../../../shared/marketplaceMcpProbeFixture";
import { buildShopeeProbeFromMarketplaceCandidateBatch } from "../marketplaceCaptureProbeAdapter";
import {
  clearMarketplaceIntelligenceStoreForTest,
  cleanupMarketplaceIntelligenceRetention,
  compareMarketplaceSnapshots,
  createKeywordDiscoveryFromSnapshot,
  createMarketplaceCaptureHandoff,
  createMarketplaceIntelligenceReport,
  createMarketplaceMonitorReport,
  createMarketplaceProductMetricEnrichment,
  createMarketplaceReportExport,
  createMarketplaceWatchlist,
  getMarketplaceFieldDictionary,
  getMarketplaceIntelligenceDiagnostics,
  getMarketplaceReport,
  getMarketplaceReportExport,
  getMarketplaceWatchlist,
  getMarketplaceKeywordDiscovery,
  listMarketplaceKeywordDiscoveries,
  listMarketplaceProductMetricEnrichments,
  listMarketplaceWatchlistEvents,
  listMarketplaceReportExports,
  listMarketplaceReports,
  listMarketplaceReportsBySnapshot,
  listMarketplaceSnapshots,
  listMarketplaceWatchlists,
  recordMarketplaceWatchlistEvent,
  saveMarketplaceConnectorFieldSample,
  saveMarketplaceProbeSnapshot,
} from "../marketplaceIntelligenceService";

const actor = { tenantId: "tenant-1", userId: 1 };

describe("marketplaceIntelligenceService", () => {
  beforeEach(() => {
    clearMarketplaceIntelligenceStoreForTest();
  });

  it("stores useful probe data as a reusable keyword snapshot", async () => {
    const probe = createRecordedShopeeMcpProbe({ keyword: "CGM", limit: 4 });
    const snapshot = await saveMarketplaceProbeSnapshot({ ...actor, probe });

    expect(snapshot.source).toBe("recorded_mcp_sample");
    expect(snapshot.itemCount).toBe(4);
    expect(snapshot.metrics.shareOfShelfByBrand[0]).toMatchObject({ brand: "Ottai", count: 2 });
    expect(snapshot.metrics.totalMonthlySold).toBeGreaterThan(3000);
    expect(snapshot.unknownFieldCount).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(snapshot)).not.toContain("search_item_tracking");
    await expect(listMarketplaceSnapshots(actor)).resolves.toHaveLength(1);
  });

  it("normalizes real Marketplace Capture candidate batches into extension capture probes", async () => {
    const probe = buildShopeeProbeFromMarketplaceCandidateBatch({
      keyword: "CGM",
      region: "TH",
      locale: "th-TH",
      limit: 10,
      batch: {
        id: "mcb_real",
        sourceUrl: "https://shopee.co.th/search?keyword=CGM",
        categoryName: "CGM",
        createdAt: new Date("2026-07-02T06:00:00.000Z"),
      },
      items: [
        {
          id: "mci_1",
          title: "CGM Starter Kit Official Store",
          sourceUrl: "https://shopee.co.th/product/2001/1001",
          externalProductId: "1001",
          externalShopId: "2001",
          priceText: "฿1,890",
          soldCountText: "ขายแล้ว 5.3พัน ชิ้น",
          discountText: "ลด 12%",
          imageUrl: "https://example.test/cgm.jpg",
          badgesJson: ["Official"],
          score: 92,
          position: 1,
          rawJson: {
            sellerName: "HealthPlus Official",
            brandName: "HealthPlus",
            ratingText: "4.9",
            reviewCountText: "1,480",
          },
        },
      ],
    });

    expect(probe.source).toBe("extension_capture");
    expect(probe.items[0]).toMatchObject({
      itemId: 1001,
      shopId: 2001,
      price: 1890,
      historicalSoldCount: 5300,
      rating: 4.9,
      shopeeVerified: true,
    });
    expect(probe.notes.join(" ")).toContain("not fixture data");
    expect(probe.fieldCoverage.some((field) => field.path === "item_card_displayed_asset.name" && field.percent === 100)).toBe(true);
  });

  it("builds keyword-first discovery before an exact product is selected", async () => {
    const snapshot = await saveMarketplaceProbeSnapshot({ ...actor, probe: createRecordedShopeeMcpProbe({ keyword: "CGM", limit: 4 }) });
    const discovery = await createKeywordDiscoveryFromSnapshot(actor, snapshot.id);

    expect(discovery.keyword).toBe("CGM");
    expect(discovery.productFamilies.length).toBeGreaterThan(1);
    expect(discovery.opportunities.map((item) => item.type)).toContain("hero_sku");
    await expect(listMarketplaceKeywordDiscoveries(actor)).resolves.toHaveLength(1);
    await expect(getMarketplaceKeywordDiscovery(actor, discovery.id)).resolves.toMatchObject({ id: discovery.id });
  });

  it("creates image-report skill payloads with evidence and recommendations", async () => {
    const snapshot = await saveMarketplaceProbeSnapshot({ ...actor, probe: createRecordedShopeeMcpProbe({ keyword: "notebook", limit: 4 }) });
    const report = await createMarketplaceIntelligenceReport({
      ...actor,
      snapshotId: snapshot.id,
      reportType: "executive_image_summary",
      aspectRatio: "1:1",
    });

    expect(report.imageModel).toBe("gpt-image-2");
    expect(report.promptPayload.skillKey).toBe("marketplace_report.executive_image_summary");
    expect(report.promptPayload.prompt).toContain("e-commerce competitive intelligence image report");
    expect(report.promptPayload.evidence).toHaveProperty("snapshot");
    expect(report.winners.some((winner) => winner.label === "Hero SKU")).toBe(true);
    await expect(listMarketplaceReports(actor)).resolves.toHaveLength(1);
    await expect(getMarketplaceReport(actor, report.id)).resolves.toMatchObject({ id: report.id });
    await expect(listMarketplaceReportsBySnapshot(actor, snapshot.id)).resolves.toHaveLength(1);
  });

  it("creates report exports and watchlist events for downstream automation", async () => {
    const snapshot = await saveMarketplaceProbeSnapshot({ ...actor, probe: createRecordedShopeeMcpProbe({ keyword: "notebook", limit: 4 }) });
    const exportRecord = await createMarketplaceReportExport({
      ...actor,
      snapshotId: snapshot.id,
      reportType: "executive_image_summary",
      aspectRatio: "16:9",
      exportType: "image_prompt",
    });
    const watchlist = await createMarketplaceWatchlist({ ...actor, keyword: "notebook" });
    const event = await recordMarketplaceWatchlistEvent({
      ...actor,
      watchlistId: watchlist.id,
      eventType: "new_competitor",
      severity: "medium",
      summary: "New high-rank seller entered the first page.",
      latestSnapshotId: snapshot.id,
      evidence: { snapshotId: snapshot.id },
    });

    expect(exportRecord).toMatchObject({ exportType: "image_prompt", aspectRatio: "16:9", status: "ready" });
    expect(String(exportRecord.promptHash)).toHaveLength(64);
    await expect(listMarketplaceReportExports(actor, exportRecord.reportId)).resolves.toHaveLength(1);
    await expect(getMarketplaceReportExport(actor, exportRecord.id)).resolves.toMatchObject({ id: exportRecord.id });
    expect(event.summary).toContain("New high-rank seller");
    await expect(getMarketplaceWatchlist(actor, watchlist.id)).resolves.toMatchObject({ id: watchlist.id });
    await expect(listMarketplaceWatchlistEvents(actor, watchlist.id)).resolves.toHaveLength(1);
  });

  it("creates watchlists and Marketplace Capture handoff payloads scoped by user", async () => {
    const snapshot = await saveMarketplaceProbeSnapshot({ ...actor, probe: createRecordedShopeeMcpProbe({ keyword: "CGM", limit: 2 }) });
    const watchlist = await createMarketplaceWatchlist({ ...actor, keyword: "CGM" });
    const handoff = await createMarketplaceCaptureHandoff(actor, snapshot.id, snapshot.items[0].itemId);
    const diagnostics = await getMarketplaceIntelligenceDiagnostics(actor);

    expect(watchlist.alertRules).toContain("new_competitor");
    await expect(listMarketplaceWatchlists(actor)).resolves.toHaveLength(1);
    expect(handoff.candidate.marketplaceItemId).toBe(snapshot.items[0].itemId);
    expect(handoff.linkReview).toMatchObject({ reviewState: "needs_review", confidence: 0.65 });
    expect(diagnostics.retention.rawPayloadStored).toBe(false);
    expect(getMarketplaceFieldDictionary().length).toBeGreaterThan(20);
  });

  it("promotes latest field sample coverage into the field dictionary", async () => {
    const probe = createRecordedShopeeMcpProbe({ keyword: "CGM", limit: 2 });
    const sample = await saveMarketplaceConnectorFieldSample({ ...actor, probe });
    const fields = getMarketplaceFieldDictionary(actor);

    expect(fields.some((field: any) => field.latestSampleId === sample.id && field.percent > 0)).toBe(true);
    expect(fields.some((field: any) => field.state === "promoted" || field.state === "raw_only")).toBe(true);
  });

  it("records audit, rate-limit metadata, and retention cleanup without dropping normalized snapshots", async () => {
    const oldProbe = createRecordedShopeeMcpProbe({
      keyword: "CGM",
      limit: 2,
      capturedAt: "2026-06-01T00:00:00.000Z",
    });
    const snapshot = await saveMarketplaceProbeSnapshot({ ...actor, probe: oldProbe });
    await createMarketplaceIntelligenceReport({ ...actor, snapshotId: snapshot.id, reportType: "executive_image_summary" });

    const cleanup = await cleanupMarketplaceIntelligenceRetention(actor, { now: new Date("2026-07-02T00:00:00.000Z") });
    const diagnostics = await getMarketplaceIntelligenceDiagnostics(actor);
    const snapshots = await listMarketplaceSnapshots(actor);

    expect(cleanup.normalizedSnapshotsPreserved).toBe(true);
    expect(cleanup.rawFieldSamplesRedacted).toBeGreaterThanOrEqual(1);
    expect(snapshots.map((item) => item.id)).toContain(snapshot.id);
    expect(diagnostics.audit.eventCount).toBeGreaterThanOrEqual(4);
    expect(diagnostics.audit.latestEvents.map((event: any) => event.action)).toContain("retention_cleanup_run");
    expect(diagnostics.rateLimits.activeBuckets.some((bucket: any) => bucket.action === "snapshot_write")).toBe(true);
    expect(diagnostics.retention.lastCleanupAt).toBe("2026-07-02T00:00:00.000Z");
  });

  it("compares two snapshots with exact item matching and entry deltas", async () => {
    const first = await saveMarketplaceProbeSnapshot({ ...actor, probe: createRecordedShopeeMcpProbe({ keyword: "CGM", limit: 2 }) });
    const second = await saveMarketplaceProbeSnapshot({ ...actor, probe: createRecordedShopeeMcpProbe({ keyword: "CGM", limit: 3, capturedAt: "2026-07-02T00:00:00.000Z" }) });
    const comparison = await compareMarketplaceSnapshots(actor, first.id, second.id);

    expect(comparison.metricDeltas.itemCount).toBe(1);
    expect(comparison.exactItemMatches.length).toBeGreaterThan(0);
    expect(comparison.newEntrants).toHaveLength(1);
    expect(comparison.missingItems).toHaveLength(0);

    const monitorReport = await createMarketplaceMonitorReport(actor, {
      baselineSnapshotId: first.id,
      latestSnapshotId: second.id,
      aspectRatio: "16:9",
    });
    expect(monitorReport.reportType).toBe("multi_day_sku_monitor");
    expect(monitorReport.promptPayload.skillKey).toBe("marketplace_report.multi_day_sku_monitor_image");
    expect(monitorReport.promptPayload.evidence).toHaveProperty("comparison");
  });

  it("confirms product metric enrichment from an exact snapshot item", async () => {
    const snapshot = await saveMarketplaceProbeSnapshot({ ...actor, probe: createRecordedShopeeMcpProbe({ keyword: "CGM", limit: 2 }) });
    const item = snapshot.items[0];
    const enrichment = await createMarketplaceProductMetricEnrichment(actor, {
      productId: "mpp_1",
      snapshotId: snapshot.id,
      itemId: item.itemId,
    });

    expect(enrichment).toMatchObject({
      productId: "mpp_1",
      snapshotId: snapshot.id,
      confidence: 0.9,
      reviewState: "confirmed",
    });
    expect(enrichment.metrics.rank).toBe(item.rank);
    await expect(listMarketplaceProductMetricEnrichments(actor, "mpp_1")).resolves.toHaveLength(1);
  });
});
