import crypto from "crypto";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import {
  marketplaceIntelligenceWatchlists,
  marketplaceIntelligenceWatchlistEvents,
  marketplaceSearchReportExports,
  marketplaceKeywordDiscoveries,
  marketplaceKeywordDiscoveryClusters,
  marketplaceSearchReports,
  marketplaceSearchSnapshotProductLinks,
  marketplaceConnectorFieldSamples,
  marketplaceProductMetricConnectorSnapshots,
  marketplaceProducts,
  marketplaceSearchSnapshotItems,
  marketplaceSearchSnapshots,
} from "../../drizzle/schema";
import {
  MARKETPLACE_USEFUL_FIELD_DICTIONARY,
  type MarketplaceFieldCoverage,
  type MarketplaceProbeResult,
} from "../../shared/marketplaceMcpProbeFixture";
import type {
  MarketplaceConnectorProvider,
  MarketplaceIntelligenceReport,
  MarketplaceIntelligenceReportType,
  MarketplaceIntelligenceSnapshot,
  MarketplaceIntelligenceSnapshotItem,
  MarketplaceIntelligenceSnapshotMetrics,
  MarketplaceIntelligenceWatchlist,
  MarketplaceKeywordDiscovery,
  MarketplaceReportAspectRatio,
} from "../../shared/marketplaceIntelligence";
import { getDb, type DrizzleDB } from "../db";
import { auditLogger } from "./auditLogger";
import { saveMarketplaceCandidateBatch } from "./marketplaceCaptureService";

type Actor = {
  tenantId: string;
  userId: number;
};

type SnapshotInput = Actor & {
  probe: MarketplaceProbeResult;
};

type ReportInput = Actor & {
  snapshotId: string;
  reportType: MarketplaceIntelligenceReportType;
  aspectRatio?: MarketplaceReportAspectRatio;
  imageModel?: string;
};

type WatchlistInput = Actor & {
  keyword: string;
  provider?: MarketplaceConnectorProvider;
  region?: string;
  cadence?: MarketplaceIntelligenceWatchlist["cadence"];
  alertRules?: MarketplaceIntelligenceWatchlist["alertRules"];
};

type MarketplaceReportExportRecord = {
  id: string;
  reportId: string;
  exportType: "image_prompt" | "image_png" | "image_jpeg" | "json" | "csv" | "pdf";
  templateKey: string;
  aspectRatio: MarketplaceReportAspectRatio;
  status: string;
  providerModel: string;
  promptHash: string;
  payloadHash: string;
  sourceSummary: Record<string, unknown>;
  promptPayload?: MarketplaceIntelligenceReport["promptPayload"];
  createdAt: string;
};

type MarketplaceConnectorFieldSampleRecord = {
  id: string;
  tenantId: string;
  userId: number;
  provider: MarketplaceConnectorProvider;
  sourceMode: MarketplaceProbeResult["source"];
  keyword: string;
  region: string;
  locale: string;
  capabilityVersion: string;
  payloadHash: string;
  shapeHash: string;
  fieldCoverage: MarketplaceFieldCoverage[];
  capabilitySummary: MarketplaceProbeResult["capabilitySummary"];
  redactionState: "raw_not_stored" | "raw_redacted";
  rawPayloadStored: false;
  createdAt: string;
};

type MarketplaceIntelligenceAuditAction =
  | "field_sample_saved"
  | "snapshot_created"
  | "keyword_discovery_created"
  | "report_created"
  | "monitor_report_created"
  | "report_export_created"
  | "watchlist_created"
  | "watchlist_event_recorded"
  | "capture_handoff_created"
  | "candidate_batch_created"
  | "product_metric_enrichment_confirmed"
  | "retention_cleanup_run";

type MarketplaceIntelligenceAuditEvent = Actor & {
  id: string;
  action: MarketplaceIntelligenceAuditAction;
  provider: MarketplaceConnectorProvider;
  keyword: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type MarketplaceUsageAction = "live_run" | "snapshot_write" | "report_write" | "image_export_write" | "watchlist_write" | "field_sample_write" | "product_metric_write";

type MarketplaceUsageBucket = Actor & {
  key: string;
  action: MarketplaceUsageAction;
  connector: MarketplaceConnectorProvider;
  keyword: string | null;
  windowStartedAt: number;
  count: number;
  limit: number;
  resetAt: number;
  lastAt: string;
};

type MarketplaceSnapshotComparison = {
  baselineSnapshotId: string;
  latestSnapshotId: string;
  keyword: string;
  dateRange: { baselineCapturedAt: string; latestCapturedAt: string };
  metricDeltas: {
    itemCount: number;
    totalMonthlySold: number;
    medianPrice: number | null;
    officialLikeShare: number;
  };
  exactItemMatches: Array<{
    key: string;
    title: string;
    baselineRank: number;
    latestRank: number;
    rankDelta: number;
    baselinePrice: number;
    latestPrice: number;
    priceDelta: number;
    baselineMonthlySold: number | null;
    latestMonthlySold: number | null;
    monthlySoldDelta: number | null;
  }>;
  newEntrants: MarketplaceIntelligenceSnapshotItem[];
  missingItems: MarketplaceIntelligenceSnapshotItem[];
};

type MarketplaceProductMetricEnrichment = {
  id: string;
  productId: string;
  snapshotId: string;
  snapshotItemId: string;
  keyword: string;
  confidence: number;
  reviewState: "confirmed";
  capturedAt: string;
  metrics: {
    price: number;
    monthlySoldCount: number | null;
    historicalSoldCount: number | null;
    rating: number | null;
    reviewCount: number | null;
    rank: number;
  };
  provenance: {
    provider: MarketplaceConnectorProvider;
    sourceMode: MarketplaceProbeResult["source"];
    keyword: string;
    itemId: number;
    shopId: number;
    title: string;
    sellerName: string;
  };
};

const snapshots = new Map<string, MarketplaceIntelligenceSnapshot>();
const discoveries = new Map<string, MarketplaceKeywordDiscovery>();
const reports = new Map<string, MarketplaceIntelligenceReport>();
const watchlists = new Map<string, MarketplaceIntelligenceWatchlist>();
const reportExports = new Map<string, MarketplaceReportExportRecord>();
const watchlistEvents = new Map<string, Array<Record<string, unknown>>>();
const fieldSamples = new Map<string, MarketplaceConnectorFieldSampleRecord>();
const productMetricEnrichments = new Map<string, MarketplaceProductMetricEnrichment>();
const auditEvents = new Map<string, MarketplaceIntelligenceAuditEvent>();
const usageBuckets = new Map<string, MarketplaceUsageBucket>();
const retentionRuns = new Map<string, { lastRunAt: string; rawFieldSamplesRedacted: number; rawSnapshotsMarkedRedacted: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MARKETPLACE_USAGE_LIMITS: Record<MarketplaceUsageAction, number> = {
  live_run: 60,
  snapshot_write: 120,
  report_write: 120,
  image_export_write: 80,
  watchlist_write: 120,
  field_sample_write: 180,
  product_metric_write: 180,
};

function getOptionalDb(): DrizzleDB | null {
  if (!process.env.DATABASE_URL) return null;
  return getDb();
}

function stableId(prefix: string, value: unknown): string {
  const hash = crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
  return `${prefix}_${hash}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function actorKey(actor: Actor): string {
  return `${actor.tenantId}:${actor.userId}`;
}

function recordMarketplaceIntelligenceAuditEvent(
  actor: Actor,
  action: MarketplaceIntelligenceAuditAction,
  metadata: Record<string, unknown> = {},
  options: { provider?: MarketplaceConnectorProvider; keyword?: string | null; targetId?: string | null } = {},
) {
  const event: MarketplaceIntelligenceAuditEvent = {
    id: `mia_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    tenantId: actor.tenantId,
    userId: actor.userId,
    action,
    provider: options.provider ?? "shopee",
    keyword: options.keyword ?? null,
    targetId: options.targetId ?? null,
    metadata,
    createdAt: nowIso(),
  };
  auditEvents.set(event.id, event);
  auditLogger.log({
    eventType: "mcp_tool_call",
    userId: actor.userId,
    tenantId: actor.tenantId,
    requestType: "marketplace_intelligence",
    metadata: {
      marketplaceIntelligenceAction: action,
      provider: event.provider,
      keyword: event.keyword,
      targetId: event.targetId,
      ...metadata,
    },
  });
  return event;
}

function trackMarketplaceUsage(
  actor: Actor,
  action: MarketplaceUsageAction,
  options: { connector?: MarketplaceConnectorProvider; keyword?: string | null; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const windowStartedAt = Math.floor(now.getTime() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
  const connector = options.connector ?? "shopee";
  const keyword = options.keyword?.trim().toLowerCase() || "-";
  const limit = MARKETPLACE_USAGE_LIMITS[action];
  const key = `${actorKey(actor)}:${connector}:${keyword}:${action}:${windowStartedAt}`;
  const bucket = usageBuckets.get(key) ?? {
    key,
    tenantId: actor.tenantId,
    userId: actor.userId,
    action,
    connector,
    keyword: keyword === "-" ? null : keyword,
    windowStartedAt,
    count: 0,
    limit,
    resetAt: windowStartedAt + RATE_LIMIT_WINDOW_MS,
    lastAt: now.toISOString(),
  };
  bucket.count += 1;
  bucket.lastAt = now.toISOString();
  usageBuckets.set(key, bucket);
  if (bucket.count > bucket.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now.getTime()) / 1000));
    throw new Error(`Marketplace intelligence rate limit exceeded for ${action}. Retry after ${retryAfterSeconds} seconds.`);
  }
  return bucket;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 100) / 100;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function shareRows<T extends string>(values: T[], key: string): Array<Record<string, string | number>> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      [key]: value,
      count,
      share: values.length ? Math.round((count / values.length) * 1000) / 1000 : 0,
    }));
}

function snapshotItems(items: MarketplaceProbeResult["items"]): MarketplaceIntelligenceSnapshotItem[] {
  return items.map((item) => ({
    rank: item.rank,
    title: item.title,
    sellerName: item.sellerName,
    brand: item.brand,
    price: item.price,
    originalPrice: item.originalPrice,
    discount: item.discount,
    monthlySoldCount: item.monthlySoldCount,
    historicalSoldCount: item.historicalSoldCount,
    rating: item.rating,
    reviewCount: item.reviewCount,
    shopeeVerified: item.shopeeVerified,
    estimatedDeliveryTimeText: item.estimatedDeliveryTimeText,
    image: item.image,
    itemId: item.itemId,
    shopId: item.shopId,
  }));
}

export function buildMarketplaceSnapshotMetrics(items: MarketplaceIntelligenceSnapshotItem[]): MarketplaceIntelligenceSnapshotMetrics {
  const prices = items.map((item) => item.price).filter((value) => Number.isFinite(value) && value > 0);
  const ratings = items.map((item) => item.rating).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const monthlySold = items
    .map((item) => item.monthlySoldCount)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  const officialLikeCount = items.filter((item) => item.shopeeVerified || /official|mall/i.test(item.sellerName)).length;

  return {
    itemCount: items.length,
    officialLikeCount,
    officialLikeShare: items.length ? Math.round((officialLikeCount / items.length) * 1000) / 1000 : 0,
    averagePrice: average(prices),
    medianPrice: median(prices),
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    totalMonthlySold: monthlySold.reduce((sum, value) => sum + value, 0),
    averageRating: average(ratings),
    shareOfShelfByBrand: shareRows(items.map((item) => item.brand || "Unknown"), "brand") as MarketplaceIntelligenceSnapshotMetrics["shareOfShelfByBrand"],
    shareOfShelfBySeller: shareRows(items.map((item) => item.sellerName || "Unknown"), "sellerName") as MarketplaceIntelligenceSnapshotMetrics["shareOfShelfBySeller"],
  };
}

function averageCoverage(fieldCoverage: MarketplaceFieldCoverage[]): number {
  if (!fieldCoverage.length) return 0;
  return Math.round(fieldCoverage.reduce((sum, field) => sum + field.percent, 0) / fieldCoverage.length);
}

function isoToDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateToIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function payloadHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildSnapshot(input: SnapshotInput): MarketplaceIntelligenceSnapshot {
  const items = snapshotItems(input.probe.items);
  const id = stableId("mss", {
    tenantId: input.tenantId,
    userId: input.userId,
    provider: input.probe.provider,
    keyword: input.probe.keyword,
    capturedAt: input.probe.capturedAt,
    itemIds: items.map((item) => `${item.shopId}:${item.itemId}`),
  });
  const snapshot: MarketplaceIntelligenceSnapshot = {
    id,
    tenantId: input.tenantId,
    userId: input.userId,
    provider: input.probe.provider,
    source: input.probe.source,
    keyword: input.probe.keyword,
    region: input.probe.region,
    locale: input.probe.locale,
    capturedAt: input.probe.capturedAt,
    sourceCapturedAt: input.probe.sourceCapturedAt,
    capabilityVersion: input.probe.capabilityVersion,
    status: input.probe.itemCount > 0 ? "ready" : "partial",
    itemCount: items.length,
    fieldCoveragePercent: averageCoverage(input.probe.fieldCoverage),
    unknownFieldCount: input.probe.fieldCoverage.filter((field) => field.type === "missing").length,
    items,
    metrics: buildMarketplaceSnapshotMetrics(items),
  };
  return snapshot;
}

function toDbSnapshot(snapshot: MarketplaceIntelligenceSnapshot) {
  return {
    id: snapshot.id,
    tenantId: snapshot.tenantId,
    userId: snapshot.userId,
    provider: snapshot.provider,
    sourceMode: snapshot.source,
    keyword: snapshot.keyword,
    region: snapshot.region,
    locale: snapshot.locale,
    status: snapshot.status,
    capabilityVersion: snapshot.capabilityVersion,
    itemCount: snapshot.itemCount,
    fieldCoveragePercent: snapshot.fieldCoveragePercent,
    unknownFieldCount: snapshot.unknownFieldCount,
    metricsJson: snapshot.metrics,
    payloadHash: payloadHash({ snapshot, items: snapshot.items }),
    idempotencyKey: payloadHash({
      tenantId: snapshot.tenantId,
      userId: snapshot.userId,
      provider: snapshot.provider,
      keyword: snapshot.keyword,
      capturedAt: snapshot.capturedAt,
      itemIds: snapshot.items.map((item) => `${item.shopId}:${item.itemId}`),
    }),
    sourceCapturedAt: isoToDate(snapshot.sourceCapturedAt),
    capturedAt: isoToDate(snapshot.capturedAt) ?? new Date(),
    rawPayloadExpiresAt: null,
    rawPayloadRedactedAt: null,
  };
}

function toDbItem(snapshot: MarketplaceIntelligenceSnapshot, item: MarketplaceIntelligenceSnapshotItem) {
  return {
    id: stableId("mssi", { snapshotId: snapshot.id, rank: item.rank, itemId: item.itemId, shopId: item.shopId }),
    snapshotId: snapshot.id,
    tenantId: snapshot.tenantId,
    userId: snapshot.userId,
    provider: snapshot.provider,
    rank: item.rank,
    title: item.title,
    sellerName: item.sellerName,
    brand: item.brand,
    price: String(item.price),
    originalPrice: item.originalPrice == null ? null : String(item.originalPrice),
    discount: item.discount,
    monthlySoldCount: item.monthlySoldCount,
    historicalSoldCount: item.historicalSoldCount,
    rating: item.rating == null ? null : String(item.rating),
    reviewCount: item.reviewCount,
    shopeeVerified: item.shopeeVerified,
    estimatedDeliveryTimeText: item.estimatedDeliveryTimeText,
    image: item.image,
    externalProductId: String(item.itemId || ""),
    externalShopId: String(item.shopId || ""),
    externalModelId: null,
    itemType: null,
    matchedKeywordsJson: [],
    normalizedJson: item,
    rawDiagnosticJson: {},
  };
}

async function loadSnapshotItems(db: DrizzleDB, snapshotIds: string[]) {
  if (!snapshotIds.length) return new Map<string, MarketplaceIntelligenceSnapshotItem[]>();
  const rows = await db
    .select()
    .from(marketplaceSearchSnapshotItems)
    .where(inArray(marketplaceSearchSnapshotItems.snapshotId, snapshotIds));
  const bySnapshot = new Map<string, MarketplaceIntelligenceSnapshotItem[]>();
  for (const row of rows) {
    const item: MarketplaceIntelligenceSnapshotItem = {
      rank: row.rank,
      title: row.title,
      sellerName: row.sellerName ?? "",
      brand: row.brand ?? null,
      price: asNumber(row.price) ?? 0,
      originalPrice: asNumber(row.originalPrice),
      discount: row.discount,
      monthlySoldCount: row.monthlySoldCount,
      historicalSoldCount: row.historicalSoldCount,
      rating: asNumber(row.rating),
      reviewCount: row.reviewCount,
      shopeeVerified: Boolean(row.shopeeVerified),
      estimatedDeliveryTimeText: row.estimatedDeliveryTimeText,
      image: row.image,
      itemId: Number(row.externalProductId || 0),
      shopId: Number(row.externalShopId || 0),
    };
    bySnapshot.set(row.snapshotId, [...(bySnapshot.get(row.snapshotId) ?? []), item]);
  }
  for (const items of bySnapshot.values()) items.sort((a, b) => a.rank - b.rank);
  return bySnapshot;
}

function rowToSnapshot(row: typeof marketplaceSearchSnapshots.$inferSelect, items: MarketplaceIntelligenceSnapshotItem[]): MarketplaceIntelligenceSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    provider: row.provider as MarketplaceConnectorProvider,
    source: row.sourceMode as MarketplaceProbeResult["source"],
    keyword: row.keyword,
    region: row.region,
    locale: row.locale,
    capturedAt: dateToIso(row.capturedAt) ?? new Date().toISOString(),
    sourceCapturedAt: dateToIso(row.sourceCapturedAt),
    capabilityVersion: row.capabilityVersion,
    status: row.status as MarketplaceIntelligenceSnapshot["status"],
    itemCount: row.itemCount,
    fieldCoveragePercent: row.fieldCoveragePercent,
    unknownFieldCount: row.unknownFieldCount,
    items,
    metrics: row.metricsJson as MarketplaceIntelligenceSnapshotMetrics,
  };
}

export async function saveMarketplaceConnectorFieldSample(input: SnapshotInput): Promise<MarketplaceConnectorFieldSampleRecord> {
  trackMarketplaceUsage(input, "field_sample_write", { connector: input.probe.provider, keyword: input.probe.keyword });
  const sample: MarketplaceConnectorFieldSampleRecord = {
    id: stableId("mcfs", {
      tenantId: input.tenantId,
      userId: input.userId,
      provider: input.probe.provider,
      capturedAt: input.probe.capturedAt,
      keyword: input.probe.keyword,
    }),
    tenantId: input.tenantId,
    userId: input.userId,
    provider: input.probe.provider,
    sourceMode: input.probe.source,
    keyword: input.probe.keyword,
    region: input.probe.region,
    locale: input.probe.locale,
    capabilityVersion: input.probe.capabilityVersion,
    payloadHash: payloadHash(input.probe.items.map((item) => item.raw)),
    shapeHash: payloadHash(input.probe.fieldCoverage.map((field) => ({ path: field.path, type: field.type }))),
    fieldCoverage: input.probe.fieldCoverage,
    capabilitySummary: input.probe.capabilitySummary,
    redactionState: "raw_not_stored",
    rawPayloadStored: false,
    createdAt: input.probe.capturedAt,
  };
  fieldSamples.set(sample.id, sample);

  const db = getOptionalDb();
  if (db) {
    await db.insert(marketplaceConnectorFieldSamples)
      .values({
        id: sample.id,
        tenantId: sample.tenantId,
        userId: sample.userId,
        provider: sample.provider,
        sourceMode: sample.sourceMode,
        keyword: sample.keyword,
        region: sample.region,
        locale: sample.locale,
        capabilityVersion: sample.capabilityVersion,
        payloadHash: sample.payloadHash,
        shapeHash: sample.shapeHash,
        fieldCoverageJson: sample.fieldCoverage,
        capabilitySummaryJson: sample.capabilitySummary,
        redactionState: sample.redactionState,
        rawPayloadExpiresAt: null,
      })
      .onConflictDoNothing();
  }

  recordMarketplaceIntelligenceAuditEvent(input, "field_sample_saved", {
    sourceMode: sample.sourceMode,
    fieldCoverageCount: sample.fieldCoverage.length,
    rawPayloadStored: sample.rawPayloadStored,
    payloadHash: sample.payloadHash,
    shapeHash: sample.shapeHash,
  }, { provider: sample.provider, keyword: sample.keyword, targetId: sample.id });

  return sample;
}

export async function saveMarketplaceProbeSnapshot(input: SnapshotInput): Promise<MarketplaceIntelligenceSnapshot> {
  trackMarketplaceUsage(input, "snapshot_write", { connector: input.probe.provider, keyword: input.probe.keyword });
  const snapshot = buildSnapshot(input);
  snapshots.set(snapshot.id, snapshot);
  await saveMarketplaceConnectorFieldSample(input);
  recordMarketplaceIntelligenceAuditEvent(input, "snapshot_created", {
    sourceMode: snapshot.source,
    itemCount: snapshot.itemCount,
    fieldCoveragePercent: snapshot.fieldCoveragePercent,
    unknownFieldCount: snapshot.unknownFieldCount,
    rawPayloadStored: false,
  }, { provider: snapshot.provider, keyword: snapshot.keyword, targetId: snapshot.id });

  const db = getOptionalDb();
  if (!db) return snapshot;

  await db.insert(marketplaceSearchSnapshots)
    .values(toDbSnapshot(snapshot))
    .onConflictDoNothing();

  await db.insert(marketplaceSearchSnapshotItems)
    .values(snapshot.items.map((item) => toDbItem(snapshot, item)))
    .onConflictDoNothing();

  return snapshot;
}

export async function listMarketplaceSnapshots(actor: Actor): Promise<MarketplaceIntelligenceSnapshot[]> {
  const db = getOptionalDb();
  if (!db) {
    return [...snapshots.values()]
    .filter((snapshot) => snapshot.tenantId === actor.tenantId && snapshot.userId === actor.userId)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
  }

  const rows = await db.select()
    .from(marketplaceSearchSnapshots)
    .where(and(eq(marketplaceSearchSnapshots.tenantId, actor.tenantId), eq(marketplaceSearchSnapshots.userId, actor.userId)))
    .orderBy(desc(marketplaceSearchSnapshots.capturedAt));
  const items = await loadSnapshotItems(db, rows.map((row) => row.id));
  return rows.map((row) => rowToSnapshot(row, items.get(row.id) ?? []));
}

export async function getMarketplaceSnapshot(actor: Actor, snapshotId: string): Promise<MarketplaceIntelligenceSnapshot> {
  const db = getOptionalDb();
  if (db) {
    const [row] = await db.select()
      .from(marketplaceSearchSnapshots)
      .where(and(
        eq(marketplaceSearchSnapshots.id, snapshotId),
        eq(marketplaceSearchSnapshots.tenantId, actor.tenantId),
        eq(marketplaceSearchSnapshots.userId, actor.userId),
      ))
      .limit(1);
    if (!row) throw new Error("Marketplace intelligence snapshot not found.");
    const items = await loadSnapshotItems(db, [row.id]);
    return rowToSnapshot(row, items.get(row.id) ?? []);
  }

  const snapshot = snapshots.get(snapshotId);
  if (!snapshot || snapshot.tenantId !== actor.tenantId || snapshot.userId !== actor.userId) {
    throw new Error("Marketplace intelligence snapshot not found.");
  }
  return snapshot;
}

function snapshotItemKey(item: MarketplaceIntelligenceSnapshotItem): string {
  return `${item.shopId}:${item.itemId}`;
}

export async function compareMarketplaceSnapshots(actor: Actor, baselineSnapshotId: string, latestSnapshotId: string): Promise<MarketplaceSnapshotComparison> {
  const baseline = await getMarketplaceSnapshot(actor, baselineSnapshotId);
  const latest = await getMarketplaceSnapshot(actor, latestSnapshotId);
  const baselineItems = new Map(baseline.items.map((item) => [snapshotItemKey(item), item]));
  const latestItems = new Map(latest.items.map((item) => [snapshotItemKey(item), item]));
  const exactItemMatches: MarketplaceSnapshotComparison["exactItemMatches"] = [];
  const newEntrants: MarketplaceIntelligenceSnapshotItem[] = [];
  const missingItems: MarketplaceIntelligenceSnapshotItem[] = [];

  for (const [key, latestItem] of latestItems.entries()) {
    const baselineItem = baselineItems.get(key);
    if (!baselineItem) {
      newEntrants.push(latestItem);
      continue;
    }
    exactItemMatches.push({
      key,
      title: latestItem.title,
      baselineRank: baselineItem.rank,
      latestRank: latestItem.rank,
      rankDelta: latestItem.rank - baselineItem.rank,
      baselinePrice: baselineItem.price,
      latestPrice: latestItem.price,
      priceDelta: Math.round((latestItem.price - baselineItem.price) * 100) / 100,
      baselineMonthlySold: baselineItem.monthlySoldCount,
      latestMonthlySold: latestItem.monthlySoldCount,
      monthlySoldDelta: baselineItem.monthlySoldCount == null || latestItem.monthlySoldCount == null
        ? null
        : latestItem.monthlySoldCount - baselineItem.monthlySoldCount,
    });
  }

  for (const [key, baselineItem] of baselineItems.entries()) {
    if (!latestItems.has(key)) missingItems.push(baselineItem);
  }

  return {
    baselineSnapshotId: baseline.id,
    latestSnapshotId: latest.id,
    keyword: latest.keyword,
    dateRange: {
      baselineCapturedAt: baseline.capturedAt,
      latestCapturedAt: latest.capturedAt,
    },
    metricDeltas: {
      itemCount: latest.itemCount - baseline.itemCount,
      totalMonthlySold: latest.metrics.totalMonthlySold - baseline.metrics.totalMonthlySold,
      medianPrice: latest.metrics.medianPrice == null || baseline.metrics.medianPrice == null
        ? null
        : Math.round((latest.metrics.medianPrice - baseline.metrics.medianPrice) * 100) / 100,
      officialLikeShare: Math.round((latest.metrics.officialLikeShare - baseline.metrics.officialLikeShare) * 1000) / 1000,
    },
    exactItemMatches,
    newEntrants,
    missingItems,
  };
}

export async function createMarketplaceProductMetricEnrichment(
  actor: Actor,
  input: { productId: string; snapshotId: string; itemId: number },
): Promise<MarketplaceProductMetricEnrichment> {
  const snapshot = await getMarketplaceSnapshot(actor, input.snapshotId);
  trackMarketplaceUsage(actor, "product_metric_write", { connector: snapshot.provider, keyword: snapshot.keyword });
  const item = snapshot.items.find((candidate) => candidate.itemId === input.itemId);
  if (!item) throw new Error("Marketplace snapshot item not found.");

  const db = getOptionalDb();
  if (db) {
    const [product] = await db.select({ id: marketplaceProducts.id })
      .from(marketplaceProducts)
      .where(and(
        eq(marketplaceProducts.id, input.productId),
        eq(marketplaceProducts.userId, actor.userId),
      ))
      .limit(1);
    if (!product) throw new Error("Marketplace product not found for current user.");
  }

  const snapshotItemId = stableId("mssi", { snapshotId: snapshot.id, rank: item.rank, itemId: item.itemId, shopId: item.shopId });
  const enrichmentId = stableId("mpmcs", { productId: input.productId, snapshotItemId });
  const linkId = stableId("msspl", { snapshotItemId, productId: input.productId });
  const enrichment: MarketplaceProductMetricEnrichment = {
    id: enrichmentId,
    productId: input.productId,
    snapshotId: snapshot.id,
    snapshotItemId,
    keyword: snapshot.keyword,
    confidence: 0.9,
    reviewState: "confirmed",
    capturedAt: snapshot.capturedAt,
    metrics: {
      price: item.price,
      monthlySoldCount: item.monthlySoldCount,
      historicalSoldCount: item.historicalSoldCount,
      rating: item.rating,
      reviewCount: item.reviewCount,
      rank: item.rank,
    },
    provenance: {
      provider: snapshot.provider,
      sourceMode: snapshot.source,
      keyword: snapshot.keyword,
      itemId: item.itemId,
      shopId: item.shopId,
      title: item.title,
      sellerName: item.sellerName,
    },
  };
  productMetricEnrichments.set(enrichment.id, enrichment);

  if (db) {
    await db.insert(marketplaceSearchSnapshotProductLinks)
      .values({
        id: linkId,
        snapshotId: snapshot.id,
        snapshotItemId,
        productId: input.productId,
        candidateItemId: null,
        tenantId: actor.tenantId,
        userId: actor.userId,
        confidence: "0.9000",
        linkBasis: "user_confirmed_product_metric_enrichment",
        reviewState: "confirmed",
        evidenceJson: enrichment.provenance,
      })
      .onConflictDoNothing();
    await db.insert(marketplaceProductMetricConnectorSnapshots)
      .values({
        id: enrichment.id,
        productId: input.productId,
        snapshotId: snapshot.id,
        snapshotItemId,
        tenantId: actor.tenantId,
        userId: actor.userId,
        provider: snapshot.provider,
        capturedAt: isoToDate(snapshot.capturedAt) ?? new Date(),
        price: String(item.price),
        monthlySoldCount: item.monthlySoldCount,
        historicalSoldCount: item.historicalSoldCount,
        rating: item.rating == null ? null : String(item.rating),
        reviewCount: item.reviewCount,
        rank: item.rank,
        confidence: "0.9000",
        provenanceJson: enrichment.provenance,
      })
      .onConflictDoNothing();
  }

  recordMarketplaceIntelligenceAuditEvent(actor, "product_metric_enrichment_confirmed", {
    productId: input.productId,
    snapshotId: input.snapshotId,
    itemId: input.itemId,
    confidence: enrichment.confidence,
  }, { provider: snapshot.provider, keyword: snapshot.keyword, targetId: enrichment.id });

  return enrichment;
}

export async function listMarketplaceProductMetricEnrichments(actor: Actor, productId: string): Promise<MarketplaceProductMetricEnrichment[]> {
  const db = getOptionalDb();
  if (db) {
    const rows = await db.select()
      .from(marketplaceProductMetricConnectorSnapshots)
      .where(and(
        eq(marketplaceProductMetricConnectorSnapshots.productId, productId),
        eq(marketplaceProductMetricConnectorSnapshots.tenantId, actor.tenantId),
        eq(marketplaceProductMetricConnectorSnapshots.userId, actor.userId),
      ))
      .orderBy(desc(marketplaceProductMetricConnectorSnapshots.capturedAt));
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      snapshotId: row.snapshotId,
      snapshotItemId: row.snapshotItemId,
      keyword: String((row.provenanceJson as Record<string, unknown> | null)?.keyword ?? ""),
      confidence: Number(row.confidence),
      reviewState: "confirmed" as const,
      capturedAt: dateToIso(row.capturedAt) ?? new Date().toISOString(),
      metrics: {
        price: Number(row.price ?? 0),
        monthlySoldCount: row.monthlySoldCount,
        historicalSoldCount: row.historicalSoldCount,
        rating: row.rating == null ? null : Number(row.rating),
        reviewCount: row.reviewCount,
        rank: row.rank ?? 0,
      },
      provenance: row.provenanceJson as MarketplaceProductMetricEnrichment["provenance"],
    }));
  }

  return [...productMetricEnrichments.values()]
    .filter((entry) => entry.productId === productId)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
}

function titleFamily(title: string): string {
  const normalized = title.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const parts = normalized.split(" ").filter(Boolean);
  return parts.slice(0, Math.min(3, parts.length)).join(" ") || "Unknown product family";
}

export async function createKeywordDiscoveryFromSnapshot(actor: Actor, snapshotId: string): Promise<MarketplaceKeywordDiscovery> {
  const snapshot = await getMarketplaceSnapshot(actor, snapshotId);
  trackMarketplaceUsage(actor, "snapshot_write", { connector: snapshot.provider, keyword: snapshot.keyword });
  const byFamily = new Map<string, MarketplaceIntelligenceSnapshotItem[]>();
  for (const item of snapshot.items) {
    const key = item.brand || titleFamily(item.title);
    byFamily.set(key, [...(byFamily.get(key) ?? []), item]);
  }
  const productFamilies = [...byFamily.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, items]) => {
      const prices = items.map((item) => item.price).filter((value) => Number.isFinite(value) && value > 0);
      const top = [...items].sort((a, b) => a.rank - b.rank)[0];
      return {
        label,
        count: items.length,
        representativeTitle: top.title,
        brands: [...new Set(items.map((item) => item.brand).filter((brand): brand is string => Boolean(brand)))],
        priceBand: { min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null, median: median(prices) },
        useCaseHint: top.title.length > 80 ? top.title.slice(0, 80) : top.title,
      };
    });
  const cheapest = [...snapshot.items].sort((a, b) => a.price - b.price)[0];
  const topSold = [...snapshot.items].sort((a, b) => (b.monthlySoldCount ?? 0) - (a.monthlySoldCount ?? 0))[0];
  const opportunities: MarketplaceKeywordDiscovery["opportunities"] = [];
  if (cheapest) opportunities.push({ type: "price_gap", title: "Entry-price gap", evidence: `${cheapest.title} is the lowest observed price at ${cheapest.price} THB.`, severity: "medium" });
  if (topSold) opportunities.push({ type: "hero_sku", title: "Hero SKU candidate", evidence: `${topSold.title} has the strongest monthly sold signal (${topSold.monthlySoldCount ?? 0}).`, severity: "high" });
  if (snapshot.metrics.officialLikeShare < 0.5) opportunities.push({ type: "non_official_visibility", title: "Non-official sellers are visible", evidence: `Official-like share is ${Math.round(snapshot.metrics.officialLikeShare * 100)}%.`, severity: "medium" });
  const id = stableId("msd", { snapshotId, productFamilies, opportunities });
  const discovery: MarketplaceKeywordDiscovery = { id, snapshotId, keyword: snapshot.keyword, capturedAt: snapshot.capturedAt, productFamilies, opportunities };
  discoveries.set(id, discovery);
  const db = getOptionalDb();
  if (db) {
    await db.insert(marketplaceKeywordDiscoveries)
      .values({
        id: discovery.id,
        snapshotId: discovery.snapshotId,
        tenantId: actor.tenantId,
        userId: actor.userId,
        provider: snapshot.provider,
        keyword: discovery.keyword,
        status: "ready",
        opportunitiesJson: discovery.opportunities,
        summaryJson: { productFamilies: discovery.productFamilies },
        capturedAt: isoToDate(discovery.capturedAt) ?? new Date(),
      })
      .onConflictDoNothing();

    await db.insert(marketplaceKeywordDiscoveryClusters)
      .values(discovery.productFamilies.map((family, index) => ({
        id: stableId("msdc", { discoveryId: discovery.id, label: family.label, index }),
        discoveryId: discovery.id,
        snapshotId: discovery.snapshotId,
        tenantId: actor.tenantId,
        userId: actor.userId,
        clusterType: "brand_family",
        label: family.label,
        rank: index + 1,
        confidence: "0.7000",
        representativeSnapshotItemIdsJson: [],
        evidenceJson: family,
        metricsJson: { count: family.count, priceBand: family.priceBand },
      })))
      .onConflictDoNothing();
  }
  recordMarketplaceIntelligenceAuditEvent(actor, "keyword_discovery_created", {
    snapshotId,
    productFamilyCount: discovery.productFamilies.length,
    opportunityCount: discovery.opportunities.length,
  }, { provider: snapshot.provider, keyword: snapshot.keyword, targetId: discovery.id });
  return discovery;
}

export async function listMarketplaceKeywordDiscoveries(actor: Actor): Promise<MarketplaceKeywordDiscovery[]> {
  const db = getOptionalDb();
  if (db) {
    const rows = await db.select()
      .from(marketplaceKeywordDiscoveries)
      .where(and(eq(marketplaceKeywordDiscoveries.tenantId, actor.tenantId), eq(marketplaceKeywordDiscoveries.userId, actor.userId)))
      .orderBy(desc(marketplaceKeywordDiscoveries.capturedAt));
    return rows.map((row) => ({
      id: row.id,
      snapshotId: row.snapshotId,
      keyword: row.keyword,
      capturedAt: dateToIso(row.capturedAt) ?? new Date().toISOString(),
      productFamilies: ((row.summaryJson as Record<string, unknown> | null)?.productFamilies ?? []) as MarketplaceKeywordDiscovery["productFamilies"],
      opportunities: row.opportunitiesJson as MarketplaceKeywordDiscovery["opportunities"],
    }));
  }

  const ownedSnapshotIds = new Set((await listMarketplaceSnapshots(actor)).map((snapshot) => snapshot.id));
  return [...discoveries.values()]
    .filter((discovery) => ownedSnapshotIds.has(discovery.snapshotId))
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
}

export async function getMarketplaceKeywordDiscovery(actor: Actor, discoveryId: string): Promise<MarketplaceKeywordDiscovery> {
  const db = getOptionalDb();
  if (db) {
    const [row] = await db.select()
      .from(marketplaceKeywordDiscoveries)
      .where(and(
        eq(marketplaceKeywordDiscoveries.id, discoveryId),
        eq(marketplaceKeywordDiscoveries.tenantId, actor.tenantId),
        eq(marketplaceKeywordDiscoveries.userId, actor.userId),
      ))
      .limit(1);
    if (!row) throw new Error("Marketplace keyword discovery not found.");
    return {
      id: row.id,
      snapshotId: row.snapshotId,
      keyword: row.keyword,
      capturedAt: dateToIso(row.capturedAt) ?? new Date().toISOString(),
      productFamilies: ((row.summaryJson as Record<string, unknown> | null)?.productFamilies ?? []) as MarketplaceKeywordDiscovery["productFamilies"],
      opportunities: row.opportunitiesJson as MarketplaceKeywordDiscovery["opportunities"],
    };
  }

  const discovery = discoveries.get(discoveryId);
  if (!discovery) throw new Error("Marketplace keyword discovery not found.");
  await getMarketplaceSnapshot(actor, discovery.snapshotId);
  return discovery;
}

function firstShareWinner(rows: Array<{ count: number } & Record<string, unknown>>, key: string): string {
  const first = rows[0];
  return first ? String(first[key] ?? "Unknown") : "Unknown";
}

export async function createMarketplaceIntelligenceReport(input: ReportInput): Promise<MarketplaceIntelligenceReport> {
  const snapshot = await getMarketplaceSnapshot(input, input.snapshotId);
  trackMarketplaceUsage(input, "report_write", { connector: snapshot.provider, keyword: snapshot.keyword });
  const discovery = await createKeywordDiscoveryFromSnapshot(input, input.snapshotId);
  const topBrand = firstShareWinner(snapshot.metrics.shareOfShelfByBrand, "brand");
  const topSeller = firstShareWinner(snapshot.metrics.shareOfShelfBySeller, "sellerName");
  const hero = [...snapshot.items].sort((a, b) => (b.monthlySoldCount ?? 0) - (a.monthlySoldCount ?? 0))[0];
  const report: MarketplaceIntelligenceReport = {
    id: stableId("msr", { snapshotId: snapshot.id, reportType: input.reportType, aspectRatio: input.aspectRatio ?? "1:1", createdAt: nowIso() }),
    snapshotId: snapshot.id,
    reportType: input.reportType,
    aspectRatio: input.aspectRatio ?? "1:1",
    imageModel: input.imageModel || "gpt-image-2",
    title: `${snapshot.keyword} Competitive Intelligence`,
    executiveSummary: [
      `${topBrand} leads brand visibility for this keyword snapshot.`,
      `${topSeller} has the strongest seller shelf presence.`,
      `Median observed price is ${snapshot.metrics.medianPrice ?? "-"} THB with ${snapshot.metrics.totalMonthlySold.toLocaleString("en-US")} monthly sold signal.`,
    ],
    kpis: [
      { label: "Listings", value: String(snapshot.itemCount), detail: "Search result items captured" },
      { label: "Official-like share", value: `${Math.round(snapshot.metrics.officialLikeShare * 100)}%`, detail: "Verified/Mall/official-like seller signal" },
      { label: "Median price", value: `${snapshot.metrics.medianPrice ?? "-"} THB`, detail: "Observed search-result median" },
      { label: "Monthly sold", value: snapshot.metrics.totalMonthlySold.toLocaleString("en-US"), detail: "Top-result aggregate signal" },
    ],
    winners: [
      { label: "Brand visibility", winner: topBrand, evidence: "Highest share of shelf by brand." },
      { label: "Seller visibility", winner: topSeller, evidence: "Highest share of shelf by seller." },
      { label: "Hero SKU", winner: hero?.title ?? "Unknown", evidence: "Highest monthly sold signal in the snapshot." },
    ],
    recommendations: discovery.opportunities.slice(0, 4).map((item) => `${item.title}: ${item.evidence}`),
    promptPayload: {
      skillKey: `marketplace_report.${input.reportType}`,
      model: input.imageModel || "gpt-image-2",
      prompt: [
        `Create a ${input.aspectRatio ?? "1:1"} e-commerce competitive intelligence image report.`,
        `Keyword: ${snapshot.keyword}. Region: ${snapshot.region}.`,
        "Use the evidence JSON only. Show top 10 listings, KPI cards, share-of-shelf, winners by KPI, key takeaways, and next actions.",
        "Keep numbers readable, include source/captured timestamp, and avoid unsupported claims.",
      ].join("\n"),
      evidence: {
        snapshot: {
          id: snapshot.id,
          keyword: snapshot.keyword,
          capturedAt: snapshot.capturedAt,
          metrics: snapshot.metrics,
          topItems: snapshot.items.slice(0, 10),
        },
        discovery,
      },
    },
    createdAt: nowIso(),
  };
  reports.set(report.id, report);
  const db = getOptionalDb();
  if (db) {
    await db.insert(marketplaceSearchReports)
      .values({
        id: report.id,
        tenantId: input.tenantId,
        userId: input.userId,
        provider: snapshot.provider,
        reportType: report.reportType,
        status: "ready",
        title: report.title,
        latestSnapshotId: report.snapshotId,
        baselineSnapshotId: null,
        intermediateSnapshotIdsJson: [],
        aspectRatio: report.aspectRatio,
        imageModel: report.imageModel,
        payloadHash: payloadHash(report.promptPayload.evidence),
        reportJson: report,
        promptPayloadJson: report.promptPayload,
        sourceSummaryJson: {
          sourceMode: snapshot.source,
          keyword: snapshot.keyword,
          capturedAt: snapshot.capturedAt,
          itemCount: snapshot.itemCount,
        },
      })
      .onConflictDoNothing();
  }
  recordMarketplaceIntelligenceAuditEvent(input, "report_created", {
    snapshotId: snapshot.id,
    reportType: report.reportType,
    aspectRatio: report.aspectRatio,
    imageModel: report.imageModel,
  }, { provider: snapshot.provider, keyword: snapshot.keyword, targetId: report.id });
  return report;
}

export async function createMarketplaceMonitorReport(
  actor: Actor,
  input: { baselineSnapshotId: string; latestSnapshotId: string; aspectRatio?: MarketplaceReportAspectRatio; imageModel?: string },
): Promise<MarketplaceIntelligenceReport> {
  const comparison = await compareMarketplaceSnapshots(actor, input.baselineSnapshotId, input.latestSnapshotId);
  const latest = await getMarketplaceSnapshot(actor, input.latestSnapshotId);
  trackMarketplaceUsage(actor, "report_write", { connector: latest.provider, keyword: latest.keyword });
  const strongestMover = [...comparison.exactItemMatches]
    .sort((a, b) => Math.abs(b.monthlySoldDelta ?? 0) - Math.abs(a.monthlySoldDelta ?? 0))[0] ?? null;
  const report: MarketplaceIntelligenceReport = {
    id: stableId("msr", { reportType: "multi_day_sku_monitor", baselineSnapshotId: input.baselineSnapshotId, latestSnapshotId: input.latestSnapshotId, createdAt: nowIso() }),
    snapshotId: latest.id,
    reportType: "multi_day_sku_monitor",
    aspectRatio: input.aspectRatio ?? "16:9",
    imageModel: input.imageModel || "gpt-image-2",
    title: `${comparison.keyword} Exact SKU Monitor`,
    executiveSummary: [
      `Compared ${comparison.exactItemMatches.length} exact seller/SKU matches between stored snapshots.`,
      `${comparison.newEntrants.length} new exact listings appeared without a baseline.`,
      `Median price delta is ${comparison.metricDeltas.medianPrice ?? "unavailable"} THB.`,
    ],
    kpis: [
      { label: "Exact matches", value: String(comparison.exactItemMatches.length), detail: "Compared by shop/item identity" },
      { label: "New entrants", value: String(comparison.newEntrants.length), detail: "Baseline missing, review separately" },
      { label: "Monthly sold delta", value: String(comparison.metricDeltas.totalMonthlySold), detail: "Captured public sold signal" },
    ],
    winners: strongestMover ? [{
      label: "Strongest sold mover",
      winner: strongestMover.title,
      evidence: `Monthly sold delta ${strongestMover.monthlySoldDelta ?? "unavailable"}; rank ${strongestMover.baselineRank} -> ${strongestMover.latestRank}.`,
    }] : [],
    recommendations: [
      "Review new entrants as baseline-missing competitors before comparing momentum.",
      "Use exact shop/item/model matching for any pricing or sold/day conclusion.",
      "Label sold/day estimates clearly when deriving them from cumulative sold deltas.",
    ],
    promptPayload: {
      skillKey: "marketplace_report.multi_day_sku_monitor_image",
      model: input.imageModel || "gpt-image-2",
      prompt: [
        `Create a ${input.aspectRatio ?? "16:9"} multi-day e-commerce SKU monitor image report.`,
        `Keyword: ${comparison.keyword}.`,
        "Use exact item matches only. Show monitor cards, new competitor watch, estimated sold/day section, marketing insight, and what to do next.",
        "Clearly label baseline-missing listings and estimated/captured public marketplace signals.",
      ].join("\n"),
      evidence: {
        comparison,
        latestSnapshot: {
          id: latest.id,
          sourceMode: latest.source,
          capturedAt: latest.capturedAt,
          itemCount: latest.itemCount,
        },
      },
    },
    createdAt: nowIso(),
  };
  reports.set(report.id, report);

  const db = getOptionalDb();
  if (db) {
    await db.insert(marketplaceSearchReports)
      .values({
        id: report.id,
        tenantId: actor.tenantId,
        userId: actor.userId,
        provider: latest.provider,
        reportType: report.reportType,
        status: "ready",
        title: report.title,
        latestSnapshotId: input.latestSnapshotId,
        baselineSnapshotId: input.baselineSnapshotId,
        intermediateSnapshotIdsJson: [],
        aspectRatio: report.aspectRatio,
        imageModel: report.imageModel,
        payloadHash: payloadHash(report.promptPayload.evidence),
        reportJson: report,
        promptPayloadJson: report.promptPayload,
        sourceSummaryJson: {
          sourceMode: latest.source,
          keyword: latest.keyword,
          baselineSnapshotId: input.baselineSnapshotId,
          latestSnapshotId: input.latestSnapshotId,
          capturedAt: latest.capturedAt,
          itemCount: latest.itemCount,
        },
      })
      .onConflictDoNothing();
  }

  recordMarketplaceIntelligenceAuditEvent(actor, "monitor_report_created", {
    baselineSnapshotId: input.baselineSnapshotId,
    latestSnapshotId: input.latestSnapshotId,
    aspectRatio: report.aspectRatio,
    exactMatchCount: comparison.exactItemMatches.length,
  }, { provider: latest.provider, keyword: latest.keyword, targetId: report.id });

  return report;
}

export async function createMarketplaceReportExport(input: ReportInput & {
  exportType?: MarketplaceReportExportRecord["exportType"];
  templateKey?: string;
}): Promise<MarketplaceReportExportRecord> {
  const report = await createMarketplaceIntelligenceReport(input);
  trackMarketplaceUsage(input, input.exportType === "image_png" || input.exportType === "image_jpeg" || input.exportType === "image_prompt" ? "image_export_write" : "report_write", { keyword: null });
  const exportStatus = input.exportType === "image_png" || input.exportType === "image_jpeg" ? "provider_required" : "ready";
  const exportRecord: MarketplaceReportExportRecord = {
    id: stableId("msre", { reportId: report.id, exportType: input.exportType ?? "image_prompt", templateKey: input.templateKey ?? report.promptPayload.skillKey }),
    reportId: report.id,
    exportType: input.exportType ?? "image_prompt",
    templateKey: input.templateKey ?? report.promptPayload.skillKey,
    aspectRatio: report.aspectRatio,
    status: exportStatus,
    providerModel: report.imageModel,
    promptHash: payloadHash(report.promptPayload.prompt),
    payloadHash: payloadHash(report.promptPayload.evidence),
    sourceSummary: {
      snapshotId: report.snapshotId,
      reportType: report.reportType,
      createdAt: report.createdAt,
    },
    promptPayload: report.promptPayload,
    createdAt: nowIso(),
  };
  reportExports.set(String(exportRecord.id), exportRecord);

  const db = getOptionalDb();
  if (db) {
    await db.insert(marketplaceSearchReportExports)
      .values({
        id: String(exportRecord.id),
        reportId: report.id,
        tenantId: input.tenantId,
        userId: input.userId,
        exportType: String(exportRecord.exportType),
        templateKey: String(exportRecord.templateKey),
        aspectRatio: report.aspectRatio,
        status: exportStatus,
        providerModel: report.imageModel,
        promptHash: String(exportRecord.promptHash),
        payloadHash: String(exportRecord.payloadHash),
        sourceSummaryJson: exportRecord.sourceSummary,
      })
      .onConflictDoNothing();
  }

  recordMarketplaceIntelligenceAuditEvent(input, "report_export_created", {
    reportId: report.id,
    exportType: exportRecord.exportType,
    templateKey: exportRecord.templateKey,
    status: exportRecord.status,
  }, { keyword: null, targetId: exportRecord.id });

  return exportRecord;
}

export async function listMarketplaceReportExports(actor: Actor, reportId?: string): Promise<MarketplaceReportExportRecord[]> {
  const db = getOptionalDb();
  if (db) {
    const rows = await db.select()
      .from(marketplaceSearchReportExports)
      .where(and(
        eq(marketplaceSearchReportExports.tenantId, actor.tenantId),
        eq(marketplaceSearchReportExports.userId, actor.userId),
        ...(reportId ? [eq(marketplaceSearchReportExports.reportId, reportId)] : []),
      ))
      .orderBy(desc(marketplaceSearchReportExports.createdAt));
    return rows.map((row) => ({
      id: row.id,
      reportId: row.reportId,
      exportType: row.exportType as MarketplaceReportExportRecord["exportType"],
      templateKey: row.templateKey,
      aspectRatio: row.aspectRatio as MarketplaceReportAspectRatio,
      status: row.status,
      providerModel: row.providerModel ?? "",
      promptHash: row.promptHash ?? "",
      payloadHash: row.payloadHash ?? "",
      sourceSummary: row.sourceSummaryJson as Record<string, unknown>,
      createdAt: dateToIso(row.createdAt) ?? new Date().toISOString(),
    }));
  }

  const ownedReportIds = new Set((await listMarketplaceReports(actor)).map((report) => report.id));
  return [...reportExports.values()]
    .filter((record) => ownedReportIds.has(record.reportId))
    .filter((record) => !reportId || record.reportId === reportId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getMarketplaceReportExport(actor: Actor, exportId: string): Promise<MarketplaceReportExportRecord> {
  const db = getOptionalDb();
  if (db) {
    const [row] = await db.select()
      .from(marketplaceSearchReportExports)
      .where(and(
        eq(marketplaceSearchReportExports.id, exportId),
        eq(marketplaceSearchReportExports.tenantId, actor.tenantId),
        eq(marketplaceSearchReportExports.userId, actor.userId),
      ))
      .limit(1);
    if (!row) throw new Error("Marketplace report export not found.");
    return {
      id: row.id,
      reportId: row.reportId,
      exportType: row.exportType as MarketplaceReportExportRecord["exportType"],
      templateKey: row.templateKey,
      aspectRatio: row.aspectRatio as MarketplaceReportAspectRatio,
      status: row.status,
      providerModel: row.providerModel ?? "",
      promptHash: row.promptHash ?? "",
      payloadHash: row.payloadHash ?? "",
      sourceSummary: row.sourceSummaryJson as Record<string, unknown>,
      createdAt: dateToIso(row.createdAt) ?? new Date().toISOString(),
    };
  }

  const record = reportExports.get(exportId);
  if (!record) throw new Error("Marketplace report export not found.");
  await getMarketplaceReport(actor, record.reportId);
  return record;
}

export async function listMarketplaceReports(actor: Actor): Promise<MarketplaceIntelligenceReport[]> {
  const db = getOptionalDb();
  if (db) {
    const rows = await db.select()
      .from(marketplaceSearchReports)
      .where(and(eq(marketplaceSearchReports.tenantId, actor.tenantId), eq(marketplaceSearchReports.userId, actor.userId)))
      .orderBy(desc(marketplaceSearchReports.createdAt));
    return rows.map((row) => row.reportJson as unknown as MarketplaceIntelligenceReport);
  }

  const ownedSnapshotIds = new Set((await listMarketplaceSnapshots(actor)).map((snapshot) => snapshot.id));
  return [...reports.values()].filter((report) => ownedSnapshotIds.has(report.snapshotId));
}

export async function getMarketplaceReport(actor: Actor, reportId: string): Promise<MarketplaceIntelligenceReport> {
  const db = getOptionalDb();
  if (db) {
    const [row] = await db.select()
      .from(marketplaceSearchReports)
      .where(and(
        eq(marketplaceSearchReports.id, reportId),
        eq(marketplaceSearchReports.tenantId, actor.tenantId),
        eq(marketplaceSearchReports.userId, actor.userId),
      ))
      .limit(1);
    if (!row) throw new Error("Marketplace intelligence report not found.");
    return row.reportJson as unknown as MarketplaceIntelligenceReport;
  }

  const report = reports.get(reportId);
  if (!report) throw new Error("Marketplace intelligence report not found.");
  await getMarketplaceSnapshot(actor, report.snapshotId);
  return report;
}

export async function listMarketplaceReportsBySnapshot(actor: Actor, snapshotId: string): Promise<MarketplaceIntelligenceReport[]> {
  await getMarketplaceSnapshot(actor, snapshotId);
  const allReports = await listMarketplaceReports(actor);
  return allReports.filter((report) => report.snapshotId === snapshotId);
}

export async function createMarketplaceWatchlist(input: WatchlistInput): Promise<MarketplaceIntelligenceWatchlist> {
  trackMarketplaceUsage(input, "watchlist_write", { connector: input.provider ?? "shopee", keyword: input.keyword });
  const watchlist: MarketplaceIntelligenceWatchlist = {
    id: stableId("msw", { tenantId: input.tenantId, userId: input.userId, keyword: input.keyword, region: input.region ?? "TH" }),
    tenantId: input.tenantId,
    userId: input.userId,
    keyword: input.keyword.trim(),
    provider: input.provider ?? "shopee",
    region: input.region ?? "TH",
    cadence: input.cadence ?? "daily",
    alertRules: input.alertRules ?? ["rank_change", "price_change", "new_competitor", "hero_sku_change"],
    createdAt: nowIso(),
  };
  watchlists.set(watchlist.id, watchlist);
  const db = getOptionalDb();
  if (db) {
    await db.insert(marketplaceIntelligenceWatchlists)
      .values({
        id: watchlist.id,
        tenantId: watchlist.tenantId,
        userId: watchlist.userId,
        provider: watchlist.provider,
        keyword: watchlist.keyword,
        region: watchlist.region,
        cadence: watchlist.cadence,
        status: "active",
        alertRulesJson: watchlist.alertRules,
      })
      .onConflictDoNothing();
  }
  recordMarketplaceIntelligenceAuditEvent(input, "watchlist_created", {
    cadence: watchlist.cadence,
    alertRules: watchlist.alertRules,
  }, { provider: watchlist.provider, keyword: watchlist.keyword, targetId: watchlist.id });
  return watchlist;
}

export async function getMarketplaceWatchlist(actor: Actor, watchlistId: string): Promise<MarketplaceIntelligenceWatchlist> {
  const db = getOptionalDb();
  if (db) {
    const [row] = await db.select()
      .from(marketplaceIntelligenceWatchlists)
      .where(and(
        eq(marketplaceIntelligenceWatchlists.id, watchlistId),
        eq(marketplaceIntelligenceWatchlists.tenantId, actor.tenantId),
        eq(marketplaceIntelligenceWatchlists.userId, actor.userId),
      ))
      .limit(1);
    if (!row) throw new Error("Marketplace intelligence watchlist not found.");
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      keyword: row.keyword,
      provider: row.provider as MarketplaceConnectorProvider,
      region: row.region,
      cadence: row.cadence as MarketplaceIntelligenceWatchlist["cadence"],
      alertRules: row.alertRulesJson as MarketplaceIntelligenceWatchlist["alertRules"],
      createdAt: dateToIso(row.createdAt) ?? new Date().toISOString(),
    };
  }

  const watchlist = watchlists.get(watchlistId);
  if (!watchlist || watchlist.tenantId !== actor.tenantId || watchlist.userId !== actor.userId) {
    throw new Error("Marketplace intelligence watchlist not found.");
  }
  return watchlist;
}

export async function recordMarketplaceWatchlistEvent(input: Actor & {
  watchlistId: string;
  eventType: "rank_change" | "price_change" | "new_competitor" | "hero_sku_change" | "field_drift";
  summary: string;
  severity?: "info" | "low" | "medium" | "high";
  latestSnapshotId?: string | null;
  baselineSnapshotId?: string | null;
  evidence?: Record<string, unknown>;
}) {
  trackMarketplaceUsage(input, "watchlist_write", { keyword: null });
  const event = {
    id: stableId("mswe", { watchlistId: input.watchlistId, eventType: input.eventType, summary: input.summary, latestSnapshotId: input.latestSnapshotId ?? null }),
    watchlistId: input.watchlistId,
    tenantId: input.tenantId,
    userId: input.userId,
    eventType: input.eventType,
    severity: input.severity ?? "info",
    summary: input.summary,
    baselineSnapshotId: input.baselineSnapshotId ?? null,
    latestSnapshotId: input.latestSnapshotId ?? null,
    evidence: input.evidence ?? {},
    createdAt: nowIso(),
  };
  watchlistEvents.set(input.watchlistId, [...(watchlistEvents.get(input.watchlistId) ?? []), event]);
  const db = getOptionalDb();
  if (db) {
    await db.insert(marketplaceIntelligenceWatchlistEvents)
      .values({
        id: String(event.id),
        watchlistId: input.watchlistId,
        tenantId: input.tenantId,
        userId: input.userId,
        eventType: input.eventType,
        severity: event.severity,
        baselineSnapshotId: input.baselineSnapshotId ?? null,
        latestSnapshotId: input.latestSnapshotId ?? null,
        summary: input.summary,
        evidenceJson: event.evidence,
      })
      .onConflictDoNothing();
  }
  recordMarketplaceIntelligenceAuditEvent(input, "watchlist_event_recorded", {
    watchlistId: input.watchlistId,
    eventType: input.eventType,
    severity: event.severity,
    latestSnapshotId: input.latestSnapshotId ?? null,
  }, { keyword: null, targetId: String(event.id) });
  return event;
}

export async function listMarketplaceWatchlistEvents(actor: Actor, watchlistId: string) {
  const db = getOptionalDb();
  if (db) {
    const rows = await db.select()
      .from(marketplaceIntelligenceWatchlistEvents)
      .where(and(
        eq(marketplaceIntelligenceWatchlistEvents.tenantId, actor.tenantId),
        eq(marketplaceIntelligenceWatchlistEvents.userId, actor.userId),
        eq(marketplaceIntelligenceWatchlistEvents.watchlistId, watchlistId),
      ))
      .orderBy(desc(marketplaceIntelligenceWatchlistEvents.createdAt));
    return rows.map((row) => ({
      id: row.id,
      watchlistId: row.watchlistId,
      eventType: row.eventType,
      severity: row.severity,
      summary: row.summary,
      baselineSnapshotId: row.baselineSnapshotId,
      latestSnapshotId: row.latestSnapshotId,
      evidence: row.evidenceJson,
      createdAt: dateToIso(row.createdAt) ?? new Date().toISOString(),
    }));
  }
  return (watchlistEvents.get(watchlistId) ?? []).filter((event) => event.tenantId === actor.tenantId && event.userId === actor.userId);
}

export async function listMarketplaceWatchlists(actor: Actor): Promise<MarketplaceIntelligenceWatchlist[]> {
  const db = getOptionalDb();
  if (db) {
    const rows = await db.select()
      .from(marketplaceIntelligenceWatchlists)
      .where(and(eq(marketplaceIntelligenceWatchlists.tenantId, actor.tenantId), eq(marketplaceIntelligenceWatchlists.userId, actor.userId)))
      .orderBy(desc(marketplaceIntelligenceWatchlists.createdAt));
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      keyword: row.keyword,
      provider: row.provider as MarketplaceConnectorProvider,
      region: row.region,
      cadence: row.cadence as MarketplaceIntelligenceWatchlist["cadence"],
      alertRules: row.alertRulesJson as MarketplaceIntelligenceWatchlist["alertRules"],
      createdAt: dateToIso(row.createdAt) ?? new Date().toISOString(),
    }));
  }
  return [...watchlists.values()].filter((watchlist) => watchlist.tenantId === actor.tenantId && watchlist.userId === actor.userId);
}

export async function createMarketplaceCaptureHandoff(actor: Actor, snapshotId: string, itemId: number) {
  const snapshot = await getMarketplaceSnapshot(actor, snapshotId);
  trackMarketplaceUsage(actor, "snapshot_write", { connector: snapshot.provider, keyword: snapshot.keyword });
  const item = snapshot.items.find((candidate) => candidate.itemId === itemId);
  if (!item) throw new Error("Marketplace snapshot item not found.");
  const snapshotItemId = stableId("mssi", { snapshotId: snapshot.id, rank: item.rank, itemId: item.itemId, shopId: item.shopId });
  const linkId = stableId("msspl", { snapshotItemId, itemId: item.itemId, shopId: item.shopId });
  const db = getOptionalDb();
  if (db) {
    await db.insert(marketplaceSearchSnapshotProductLinks)
      .values({
        id: linkId,
        snapshotId: snapshot.id,
        snapshotItemId,
        productId: null,
        candidateItemId: null,
        tenantId: actor.tenantId,
        userId: actor.userId,
        confidence: "0.6500",
        linkBasis: "snapshot_item_handoff",
        reviewState: "needs_review",
        evidenceJson: { itemId: item.itemId, shopId: item.shopId, title: item.title, sellerName: item.sellerName },
      })
      .onConflictDoNothing();
  }
  recordMarketplaceIntelligenceAuditEvent(actor, "capture_handoff_created", {
    snapshotId: snapshot.id,
    itemId,
    linkId,
  }, { provider: snapshot.provider, keyword: snapshot.keyword, targetId: linkId });
  return {
    handoffType: "candidate_batch" as const,
    snapshotId: snapshot.id,
    keyword: snapshot.keyword,
    candidate: {
      platform: snapshot.provider,
      marketplaceItemId: item.itemId,
      marketplaceShopId: item.shopId,
      title: item.title,
      sellerName: item.sellerName,
      brand: item.brand,
      price: item.price,
      image: item.image,
      sourceSnapshotCapturedAt: snapshot.capturedAt,
    },
    linkReview: {
      linkId,
      confidence: 0.65,
      reviewState: "needs_review",
      linkBasis: "snapshot_item_handoff",
    },
  };
}

export async function createMarketplaceCaptureCandidateBatchFromSnapshot(actor: Actor, snapshotId: string) {
  const snapshot = await getMarketplaceSnapshot(actor, snapshotId);
  trackMarketplaceUsage(actor, "snapshot_write", { connector: snapshot.provider, keyword: snapshot.keyword });
  const sourceUrl = `https://shopee.co.th/search?keyword=${encodeURIComponent(snapshot.keyword)}`;
  const batch = await saveMarketplaceCandidateBatch({
    platform: snapshot.provider,
    sourceUrl,
    categoryName: snapshot.keyword,
    sortMode: "marketplace_intelligence_rank",
    filters: {
      source: "marketplace_intelligence_snapshot",
      snapshotId: snapshot.id,
      capturedAt: snapshot.capturedAt,
      region: snapshot.region,
      locale: snapshot.locale,
    },
    candidates: snapshot.items.map((item) => {
      const productUrl = `https://shopee.co.th/product/${item.shopId}/${item.itemId}`;
      const badges = [
        item.shopeeVerified ? "verified_or_mall" : null,
        item.discount ? "discount" : null,
        item.estimatedDeliveryTimeText ? "delivery_signal" : null,
      ].filter((value): value is string => Boolean(value));
      const score = Math.max(0, Math.min(100, Math.round(
        100
        - (item.rank - 1) * 3
        + (item.shopeeVerified ? 8 : 0)
        + Math.min((item.monthlySoldCount ?? 0) / 500, 10)
        + Math.min((item.rating ?? 0) * 2, 10),
      )));
      return {
        platform: snapshot.provider,
        sourceUrl: productUrl,
        url: productUrl,
        externalProductId: String(item.itemId),
        externalShopId: String(item.shopId),
        title: item.title,
        priceText: `${item.price} THB`,
        originalPriceText: item.originalPrice == null ? null : `${item.originalPrice} THB`,
        discountText: item.discount,
        soldCountText: item.monthlySoldCount == null ? null : `${item.monthlySoldCount} monthly sold`,
        soldCountValue: item.monthlySoldCount,
        ratingText: item.rating == null ? null : String(item.rating),
        imageUrl: item.image,
        imageUrls: item.image ? [item.image] : [],
        badges,
        position: item.rank,
        score,
        scoreReasons: [
          `Rank #${item.rank} in keyword snapshot`,
          item.shopeeVerified ? "Verified/Mall-like seller signal" : "Marketplace seller signal",
          item.monthlySoldCount != null ? `Monthly sold signal ${item.monthlySoldCount}` : "No monthly sold signal",
        ],
        platformRawJson: {
          marketplaceIntelligenceSnapshotId: snapshot.id,
          sellerName: item.sellerName,
          brand: item.brand,
          historicalSoldCount: item.historicalSoldCount,
          reviewCount: item.reviewCount,
          estimatedDeliveryTimeText: item.estimatedDeliveryTimeText,
          sourceCapturedAt: snapshot.sourceCapturedAt,
        },
      };
    }),
  }, { userId: actor.userId, tenantId: actor.tenantId });

  recordMarketplaceIntelligenceAuditEvent(actor, "candidate_batch_created", {
    snapshotId: snapshot.id,
    candidateCount: snapshot.items.length,
    marketplaceCaptureBatchId: batch.candidateBatchId,
  }, { provider: snapshot.provider, keyword: snapshot.keyword, targetId: batch.candidateBatchId });

  return {
    handoffType: "candidate_batch" as const,
    snapshotId: snapshot.id,
    keyword: snapshot.keyword,
    marketplaceCaptureBatchId: batch.candidateBatchId,
    candidateCount: snapshot.items.length,
    sourceUrl,
  };
}

export function getMarketplaceFieldDictionary(actor?: Actor) {
  if (!actor) return MARKETPLACE_USEFUL_FIELD_DICTIONARY;
  const latestSample = [...fieldSamples.values()]
    .filter((sample) => sample.tenantId === actor.tenantId && sample.userId === actor.userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
  if (!latestSample) {
    return MARKETPLACE_USEFUL_FIELD_DICTIONARY.map((field) => ({
      ...field,
      state: field.keep === "normalized" ? "normalized" : field.keep === "raw_diagnostic" ? "raw_only" : "deferred",
      type: "unknown",
      covered: 0,
      total: 0,
      percent: 0,
      sample: null,
      capabilityVersion: null,
      latestSampleId: null,
    }));
  }
  return latestSample.fieldCoverage.map((field) => ({
    ...field,
    state: field.percent > 0
      ? field.keep === "normalized" ? "promoted" : field.keep === "raw_diagnostic" ? "raw_only" : "stable"
      : "missing_latest",
    capabilityVersion: latestSample.capabilityVersion,
    latestSampleId: latestSample.id,
  }));
}

export async function cleanupMarketplaceIntelligenceRetention(
  actor: Actor,
  options: { now?: Date; rawDiagnosticDays?: number } = {},
) {
  const now = options.now ?? new Date();
  const rawDiagnosticDays = options.rawDiagnosticDays ?? 14;
  const cutoff = new Date(now.getTime() - rawDiagnosticDays * 24 * 60 * 60 * 1000);
  let rawFieldSamplesRedacted = 0;
  let rawSnapshotsMarkedRedacted = 0;

  for (const sample of fieldSamples.values()) {
    if (
      sample.tenantId === actor.tenantId
      && sample.userId === actor.userId
      && sample.redactionState !== "raw_redacted"
      && Date.parse(sample.createdAt) < cutoff.getTime()
    ) {
      sample.redactionState = "raw_redacted";
      rawFieldSamplesRedacted += 1;
    }
  }

  const db = getOptionalDb();
  if (db) {
    const redactedFieldSamples = await db.update(marketplaceConnectorFieldSamples)
      .set({ redactionState: "raw_redacted" })
      .where(and(
        eq(marketplaceConnectorFieldSamples.tenantId, actor.tenantId),
        eq(marketplaceConnectorFieldSamples.userId, actor.userId),
        lt(marketplaceConnectorFieldSamples.createdAt, cutoff),
      ))
      .returning({ id: marketplaceConnectorFieldSamples.id });
    rawFieldSamplesRedacted = Math.max(rawFieldSamplesRedacted, redactedFieldSamples.length);

    const redactedSnapshots = await db.update(marketplaceSearchSnapshots)
      .set({ rawPayloadRedactedAt: now, updatedAt: now })
      .where(and(
        eq(marketplaceSearchSnapshots.tenantId, actor.tenantId),
        eq(marketplaceSearchSnapshots.userId, actor.userId),
        lt(marketplaceSearchSnapshots.rawPayloadExpiresAt, now),
        isNull(marketplaceSearchSnapshots.rawPayloadRedactedAt),
      ))
      .returning({ id: marketplaceSearchSnapshots.id });
    rawSnapshotsMarkedRedacted = redactedSnapshots.length;
  }

  const result = {
    lastRunAt: now.toISOString(),
    rawDiagnosticDays,
    rawFieldSamplesRedacted,
    rawSnapshotsMarkedRedacted,
    normalizedSnapshotsPreserved: true,
    rawPayloadStored: false,
  };
  retentionRuns.set(actorKey(actor), result);
  recordMarketplaceIntelligenceAuditEvent(actor, "retention_cleanup_run", result, { keyword: null, targetId: actorKey(actor) });
  return result;
}

export async function getMarketplaceIntelligenceDiagnostics(actor: Actor) {
  const ownedSnapshots = await listMarketplaceSnapshots(actor);
  const ownedFieldSamples = [...fieldSamples.values()].filter((sample) => sample.tenantId === actor.tenantId && sample.userId === actor.userId);
  const ownedAuditEvents = [...auditEvents.values()]
    .filter((event) => event.tenantId === actor.tenantId && event.userId === actor.userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const ownedUsageBuckets = [...usageBuckets.values()]
    .filter((bucket) => bucket.tenantId === actor.tenantId && bucket.userId === actor.userId)
    .sort((a, b) => b.resetAt - a.resetAt || b.count - a.count);
  const latestRetentionRun = retentionRuns.get(actorKey(actor)) ?? null;
  return {
    snapshotCount: ownedSnapshots.length,
    reportCount: (await listMarketplaceReports(actor)).length,
    watchlistCount: (await listMarketplaceWatchlists(actor)).length,
    fieldSampleCount: ownedFieldSamples.length,
    latestSnapshotAt: ownedSnapshots[0]?.capturedAt ?? null,
    fieldGroups: (await getMarketplaceFieldDictionary(actor)).reduce<Record<string, number>>((acc, field) => {
      acc[field.group] = (acc[field.group] ?? 0) + 1;
      return acc;
    }, {}),
    retention: {
      normalizedSnapshotDays: 365,
      rawDiagnosticDays: 14,
      rawPayloadStored: false,
      lastCleanupAt: latestRetentionRun?.lastRunAt ?? null,
      lastCleanup: latestRetentionRun,
    },
    audit: {
      eventCount: ownedAuditEvents.length,
      latestEvents: ownedAuditEvents.slice(0, 10).map((event) => ({
        id: event.id,
        action: event.action,
        provider: event.provider,
        keyword: event.keyword,
        targetId: event.targetId,
        createdAt: event.createdAt,
      })),
    },
    rateLimits: {
      windowSeconds: RATE_LIMIT_WINDOW_MS / 1000,
      configured: MARKETPLACE_USAGE_LIMITS,
      activeBuckets: ownedUsageBuckets.slice(0, 20).map((bucket) => ({
        action: bucket.action,
        connector: bucket.connector,
        keyword: bucket.keyword,
        count: bucket.count,
        limit: bucket.limit,
        remaining: Math.max(0, bucket.limit - bucket.count),
        resetAt: new Date(bucket.resetAt).toISOString(),
        lastAt: bucket.lastAt,
      })),
    },
  };
}

export function clearMarketplaceIntelligenceStoreForTest() {
  snapshots.clear();
  discoveries.clear();
  reports.clear();
  watchlists.clear();
  reportExports.clear();
  watchlistEvents.clear();
  fieldSamples.clear();
  productMetricEnrichments.clear();
  auditEvents.clear();
  usageBuckets.clear();
  retentionRuns.clear();
}
