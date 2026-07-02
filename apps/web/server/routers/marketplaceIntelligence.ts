import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import type { AuthResult } from "../_core/authz";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import type { TenantFeatureFlagKey } from "../../shared/featureFlags";
import {
  marketplaceConnectorProviderSchema,
  marketplaceIntelligenceReportTypeSchema,
  marketplaceReportAspectRatioSchema,
} from "../../shared/marketplaceIntelligence";
import { getConnectorGrantStatus } from "../services/marketplaceConnectorGrantService";
import {
  fetchShopeeSearchProbe,
  isShopeeLiveConnectorConfigured,
  ShopeeLiveConnectorError,
} from "../services/marketplaceShopeeLiveConnector";
import { getMarketplaceConnectorTenantRuntimeConfig } from "../services/marketplaceConnectorTenantConfigService";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import {
  compareMarketplaceSnapshots,
  cleanupMarketplaceIntelligenceRetention,
  createKeywordDiscoveryFromSnapshot,
  createMarketplaceCaptureCandidateBatchFromSnapshot,
  createMarketplaceCaptureHandoff,
  createMarketplaceIntelligenceReport,
  createMarketplaceMonitorReport,
  createMarketplaceProductMetricEnrichment,
  createMarketplaceReportExport,
  createMarketplaceWatchlist,
  getMarketplaceKeywordDiscovery,
  getMarketplaceFieldDictionary,
  getMarketplaceIntelligenceDiagnostics,
  getMarketplaceReport,
  getMarketplaceReportExport,
  getMarketplaceSnapshot,
  getMarketplaceWatchlist,
  listMarketplaceWatchlistEvents,
  listMarketplaceProductMetricEnrichments,
  listMarketplaceKeywordDiscoveries,
  listMarketplaceReportExports,
  listMarketplaceReports,
  listMarketplaceReportsBySnapshot,
  listMarketplaceSnapshots,
  listMarketplaceWatchlists,
  recordMarketplaceWatchlistEvent,
  saveMarketplaceConnectorFieldSample,
  saveMarketplaceProbeSnapshot,
} from "../services/marketplaceIntelligenceService";

function actorFromContext(ctx: { tenantId?: string | number | null; user: { id: number; currentTenantId?: string | number | null } }) {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
  if (!tenantId) throw new Error("Tenant is required for marketplace intelligence.");
  return { tenantId, userId: ctx.user.id };
}

function sessionAuthFromContext(ctx: {
  tenantId?: string | number | null;
  user: { id: number; currentTenantId?: string | number | null };
}): Extract<AuthResult, { ok: true; mode: "session" }> {
  const actor = actorFromContext(ctx);
  return {
    ok: true,
    mode: "session",
    user: ctx.user,
    sub: `user:${actor.userId}`,
    scopes: [],
    tenantId: actor.tenantId,
    userId: actor.userId,
  };
}

async function assertMarketplaceFeatureEnabled(
  ctx: { tenantId?: string | number | null; user: { id: number; currentTenantId?: string | number | null } },
  flag: TenantFeatureFlagKey,
) {
  const actor = actorFromContext(ctx);
  if (!process.env.DATABASE_URL) return actor;
  const flags = await getTenantFeatureFlags(actor.tenantId);
  if (!flags[flag]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Feature '${flag}' is not enabled for this tenant`,
    });
  }
  return actor;
}

function recordedFallbackEnabled(): boolean {
  return process.env.NODE_ENV === "test";
}

async function createShopeeProbeFromConnector(
  ctx: { tenantId?: string | number | null; user: { id: number; currentTenantId?: string | number | null } },
  input: { keyword: string; region: string; locale: string; limit: number; sourceMode?: "live" | "recorded_sample" },
  options: { allowRecordedFallback?: boolean } = {},
) {
  const actor = actorFromContext(ctx);
  const config = await getMarketplaceConnectorTenantRuntimeConfig(actor.tenantId);
  const allowRecordedFallback = options.allowRecordedFallback ?? (
    input.sourceMode === "recorded_sample"
      || recordedFallbackEnabled()
  );
  if (!allowRecordedFallback && !isShopeeLiveConnectorConfigured(config)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Shopee MCP live execution is not available for this user connection. Open Settings > Integrations, reconnect the Shopee connector, then verify a live test in Connector Lab before running keyword analysis.",
    });
  }
  if (!allowRecordedFallback) {
    const grant = await getConnectorGrantStatus(sessionAuthFromContext(ctx), "shopee", { requestTenantId: actor.tenantId });
    if (grant.status !== "active") {
      const message = grant.status === "pending"
        ? "Shopee connector authorization is pending. Open Connection settings and click confirm authorization before running live keyword search."
        : "Please authorize the Shopee connector before running live keyword search.";
      throw new TRPCError({
        code: "FORBIDDEN",
        message,
      });
    }
  }
  try {
    return await fetchShopeeSearchProbe(input, { allowRecordedFallback, config });
  } catch (error) {
    if (error instanceof ShopeeLiveConnectorError) {
      throw new TRPCError({
        code: error.statusCode >= 500 ? "SERVICE_UNAVAILABLE" : "BAD_REQUEST",
        message: error.message,
      });
    }
    throw error;
  }
}

export const marketplaceIntelligenceRouter = router({
  getConnectorStatus: protectedProcedure
    .input(z.object({ provider: marketplaceConnectorProviderSchema.default("shopee") }).default({}))
    .query(({ ctx, input }) => {
      const actor = actorFromContext(ctx);
      return getConnectorGrantStatus(sessionAuthFromContext(ctx), input.provider, { requestTenantId: actor.tenantId });
    }),

  fieldDictionary: protectedProcedure.query(({ ctx }) => ({
    fields: getMarketplaceFieldDictionary(actorFromContext(ctx)),
  })),

  createSnapshotFromProbe: protectedProcedure
    .input(z.object({
      keyword: z.string().trim().min(1).max(120).default("CGM"),
      region: z.string().trim().min(2).max(10).default("TH"),
      locale: z.string().trim().min(2).max(20).default("th-TH"),
      limit: z.number().int().min(1).max(25).default(10),
      sourceMode: z.enum(["live", "recorded_sample"]).default("live"),
    }))
    .mutation(async ({ ctx, input }) => {
      const actor = await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceImportsEnabled");
      const probe = await createShopeeProbeFromConnector(ctx, input);
      const snapshot = await saveMarketplaceProbeSnapshot({ ...actor, probe });
      return { snapshot, probe };
    }),

  dryRunConnectorSearch: protectedProcedure
    .input(z.object({
      keyword: z.string().trim().min(1).max(120).default("CGM"),
      region: z.string().trim().min(2).max(10).default("TH"),
      locale: z.string().trim().min(2).max(20).default("th-TH"),
      limit: z.number().int().min(1).max(25).default(10),
      sourceMode: z.enum(["live", "recorded_sample"]).default("live"),
    }))
    .query(async ({ ctx, input }) => {
      const probe = await createShopeeProbeFromConnector(ctx, input);
      return {
        probe,
        sourceMode: probe.source,
        dryRun: probe.source !== "live_mcp",
        rawPayloadStored: false,
      };
    }),

  saveFieldSample: protectedProcedure
    .input(z.object({
      keyword: z.string().trim().min(1).max(120).default("CGM"),
      region: z.string().trim().min(2).max(10).default("TH"),
      locale: z.string().trim().min(2).max(20).default("th-TH"),
      limit: z.number().int().min(1).max(25).default(10),
      sourceMode: z.enum(["live", "recorded_sample"]).default("live"),
    }))
    .mutation(async ({ ctx, input }) => {
      const actor = await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceImportsEnabled");
      const probe = await createShopeeProbeFromConnector(ctx, input);
      const fieldSample = await saveMarketplaceConnectorFieldSample({ ...actor, probe });
      return {
        fieldSample,
        probe,
        rawPayloadStored: fieldSample.rawPayloadStored,
      };
    }),

  saveSearchSnapshot: protectedProcedure
    .input(z.object({
      keyword: z.string().trim().min(1).max(120).default("CGM"),
      region: z.string().trim().min(2).max(10).default("TH"),
      locale: z.string().trim().min(2).max(20).default("th-TH"),
      limit: z.number().int().min(1).max(25).default(10),
      sourceMode: z.enum(["live", "recorded_sample"]).default("live"),
    }))
    .mutation(async ({ ctx, input }) => {
      const actor = await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceImportsEnabled");
      const probe = await createShopeeProbeFromConnector(ctx, input);
      const snapshot = await saveMarketplaceProbeSnapshot({ ...actor, probe });
      return { snapshot, probe };
    }),

  listSnapshots: protectedProcedure.query(async ({ ctx }) => ({
    snapshots: await listMarketplaceSnapshots(actorFromContext(ctx)),
  })),

  listSearchSnapshots: protectedProcedure.query(async ({ ctx }) => ({
    snapshots: await listMarketplaceSnapshots(actorFromContext(ctx)),
  })),

  getSnapshot: protectedProcedure
    .input(z.object({ snapshotId: z.string().min(1) }))
    .query(({ ctx, input }) => getMarketplaceSnapshot(actorFromContext(ctx), input.snapshotId)),

  getSearchSnapshot: protectedProcedure
    .input(z.object({ snapshotId: z.string().min(1) }))
    .query(({ ctx, input }) => getMarketplaceSnapshot(actorFromContext(ctx), input.snapshotId)),

  createDiscovery: protectedProcedure
    .input(z.object({ snapshotId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => createKeywordDiscoveryFromSnapshot(
      await assertMarketplaceFeatureEnabled(ctx, "marketplaceKeywordDiscoveryEnabled"),
      input.snapshotId,
    )),

  createKeywordDiscovery: protectedProcedure
    .input(z.object({ snapshotId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => createKeywordDiscoveryFromSnapshot(
      await assertMarketplaceFeatureEnabled(ctx, "marketplaceKeywordDiscoveryEnabled"),
      input.snapshotId,
    )),

  listKeywordDiscoveries: protectedProcedure.query(async ({ ctx }) => ({
    discoveries: await listMarketplaceKeywordDiscoveries(actorFromContext(ctx)),
  })),

  getKeywordDiscovery: protectedProcedure
    .input(z.object({ discoveryId: z.string().min(1) }))
    .query(({ ctx, input }) => getMarketplaceKeywordDiscovery(actorFromContext(ctx), input.discoveryId)),

  refreshKeywordDiscoveryFromSnapshot: protectedProcedure
    .input(z.object({ snapshotId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => createKeywordDiscoveryFromSnapshot(
      await assertMarketplaceFeatureEnabled(ctx, "marketplaceKeywordDiscoveryEnabled"),
      input.snapshotId,
    )),

  createReport: protectedProcedure
    .input(z.object({
      snapshotId: z.string().min(1),
      reportType: marketplaceIntelligenceReportTypeSchema.default("executive_image_summary"),
      aspectRatio: marketplaceReportAspectRatioSchema.default("1:1"),
      imageModel: z.string().trim().min(1).max(80).default("gpt-image-2"),
    }))
    .mutation(async ({ ctx, input }) => createMarketplaceIntelligenceReport({
      ...await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceReportsEnabled"),
      snapshotId: input.snapshotId,
      reportType: input.reportType,
      aspectRatio: input.aspectRatio,
      imageModel: input.imageModel,
    })),

  generateSearchReport: protectedProcedure
    .input(z.object({
      snapshotId: z.string().min(1),
      reportType: marketplaceIntelligenceReportTypeSchema.default("executive_image_summary"),
      aspectRatio: marketplaceReportAspectRatioSchema.default("1:1"),
      imageModel: z.string().trim().min(1).max(80).default("gpt-image-2"),
    }))
    .mutation(async ({ ctx, input }) => createMarketplaceIntelligenceReport({
      ...await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceReportsEnabled"),
      snapshotId: input.snapshotId,
      reportType: input.reportType,
      aspectRatio: input.aspectRatio,
      imageModel: input.imageModel,
    })),

  createReportExport: protectedProcedure
    .input(z.object({
      snapshotId: z.string().min(1),
      reportType: marketplaceIntelligenceReportTypeSchema.default("executive_image_summary"),
      aspectRatio: marketplaceReportAspectRatioSchema.default("1:1"),
      imageModel: z.string().trim().min(1).max(80).default("gpt-image-2"),
      exportType: z.enum(["image_prompt", "image_png", "image_jpeg", "json", "csv", "pdf"]).default("image_prompt"),
      templateKey: z.string().trim().min(1).max(120).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceReportsEnabled");
      if (input.exportType === "image_prompt" || input.exportType === "image_png" || input.exportType === "image_jpeg") {
        await assertMarketplaceFeatureEnabled(ctx, "marketplaceReportImageSkillsEnabled");
        await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceShareableImageEnabled");
      }
      return createMarketplaceReportExport({
        ...actorFromContext(ctx),
        snapshotId: input.snapshotId,
        reportType: input.reportType,
        aspectRatio: input.aspectRatio,
        imageModel: input.imageModel,
        exportType: input.exportType,
        templateKey: input.templateKey,
      });
    }),

  listReports: protectedProcedure.query(async ({ ctx }) => ({
    reports: await listMarketplaceReports(actorFromContext(ctx)),
  })),

  getReport: protectedProcedure
    .input(z.object({ reportId: z.string().min(1) }))
    .query(({ ctx, input }) => getMarketplaceReport(actorFromContext(ctx), input.reportId)),

  getSearchReport: protectedProcedure
    .input(z.object({ reportId: z.string().min(1) }))
    .query(({ ctx, input }) => getMarketplaceReport(actorFromContext(ctx), input.reportId)),

  listReportsBySnapshot: protectedProcedure
    .input(z.object({ snapshotId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ({
      reports: await listMarketplaceReportsBySnapshot(actorFromContext(ctx), input.snapshotId),
    })),

  listReportExports: protectedProcedure
    .input(z.object({ reportId: z.string().min(1).optional() }).default({}))
    .query(async ({ ctx, input }) => ({
      exports: await listMarketplaceReportExports(actorFromContext(ctx), input.reportId),
    })),

  getReportExport: protectedProcedure
    .input(z.object({ exportId: z.string().min(1) }))
    .query(({ ctx, input }) => getMarketplaceReportExport(actorFromContext(ctx), input.exportId)),

  createWatchlist: protectedProcedure
    .input(z.object({
      keyword: z.string().trim().min(1).max(120),
      region: z.string().trim().min(2).max(10).default("TH"),
      cadence: z.enum(["daily", "weekly", "manual"]).default("daily"),
    }))
    .mutation(async ({ ctx, input }) => createMarketplaceWatchlist({
      ...await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceWatchlistsEnabled"),
      keyword: input.keyword,
      region: input.region,
      cadence: input.cadence,
    })),

  listWatchlists: protectedProcedure.query(async ({ ctx }) => ({
    watchlists: await listMarketplaceWatchlists(actorFromContext(ctx)),
  })),

  getWatchlist: protectedProcedure
    .input(z.object({ watchlistId: z.string().min(1) }))
    .query(({ ctx, input }) => getMarketplaceWatchlist(actorFromContext(ctx), input.watchlistId)),

  upsertWatchlist: protectedProcedure
    .input(z.object({
      keyword: z.string().trim().min(1).max(120),
      region: z.string().trim().min(2).max(10).default("TH"),
      cadence: z.enum(["daily", "weekly", "manual"]).default("daily"),
    }))
    .mutation(async ({ ctx, input }) => createMarketplaceWatchlist({
      ...await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceWatchlistsEnabled"),
      keyword: input.keyword,
      region: input.region,
      cadence: input.cadence,
    })),

  recordWatchlistEvent: protectedProcedure
    .input(z.object({
      watchlistId: z.string().min(1),
      eventType: z.enum(["rank_change", "price_change", "new_competitor", "hero_sku_change", "field_drift"]),
      summary: z.string().trim().min(1).max(500),
      severity: z.enum(["info", "low", "medium", "high"]).default("info"),
      latestSnapshotId: z.string().min(1).nullable().optional(),
      baselineSnapshotId: z.string().min(1).nullable().optional(),
      evidence: z.record(z.unknown()).default({}),
    }))
    .mutation(async ({ ctx, input }) => recordMarketplaceWatchlistEvent({
      ...await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceWatchlistsEnabled"),
      watchlistId: input.watchlistId,
      eventType: input.eventType,
      summary: input.summary,
      severity: input.severity,
      latestSnapshotId: input.latestSnapshotId,
      baselineSnapshotId: input.baselineSnapshotId,
      evidence: input.evidence,
    })),

  listWatchlistEvents: protectedProcedure
    .input(z.object({ watchlistId: z.string().min(1) }))
    .query(({ ctx, input }) => listMarketplaceWatchlistEvents(actorFromContext(ctx), input.watchlistId)),

  compareSnapshots: protectedProcedure
    .input(z.object({
      baselineSnapshotId: z.string().min(1),
      latestSnapshotId: z.string().min(1),
    }))
    .query(({ ctx, input }) => compareMarketplaceSnapshots(actorFromContext(ctx), input.baselineSnapshotId, input.latestSnapshotId)),

  createMonitorReport: protectedProcedure
    .input(z.object({
      baselineSnapshotId: z.string().min(1),
      latestSnapshotId: z.string().min(1),
      aspectRatio: marketplaceReportAspectRatioSchema.default("16:9"),
      imageModel: z.string().trim().min(1).max(80).default("gpt-image-2"),
    }))
    .mutation(async ({ ctx, input }) => createMarketplaceMonitorReport(
      await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceReportsEnabled"),
      input,
    )),

  createCaptureHandoff: protectedProcedure
    .input(z.object({
      snapshotId: z.string().min(1),
      itemId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => createMarketplaceCaptureHandoff(
      await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceImportsEnabled"),
      input.snapshotId,
      input.itemId,
    )),

  createCaptureCandidateBatch: protectedProcedure
    .input(z.object({ snapshotId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => createMarketplaceCaptureCandidateBatchFromSnapshot(
      await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceImportsEnabled"),
      input.snapshotId,
    )),

  createProductMetricEnrichment: protectedProcedure
    .input(z.object({
      productId: z.string().min(1),
      snapshotId: z.string().min(1),
      itemId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => createMarketplaceProductMetricEnrichment(
      await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceImportsEnabled"),
      input,
    )),

  listProductMetricEnrichments: protectedProcedure
    .input(z.object({ productId: z.string().min(1) }))
    .query(({ ctx, input }) => listMarketplaceProductMetricEnrichments(actorFromContext(ctx), input.productId)),

  diagnostics: protectedProcedure.query(({ ctx }) => getMarketplaceIntelligenceDiagnostics(actorFromContext(ctx))),

  getDiagnostics: protectedProcedure.query(({ ctx }) => getMarketplaceIntelligenceDiagnostics(actorFromContext(ctx))),

  runRetentionCleanup: protectedProcedure
    .mutation(async ({ ctx }) => cleanupMarketplaceIntelligenceRetention(
      await assertMarketplaceFeatureEnabled(ctx, "marketplaceIntelligenceImportsEnabled"),
    )),
});
