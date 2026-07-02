/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MarketplaceIntelligence from "../MarketplaceIntelligence";

let currentLocation = "/marketplace-capture/intelligence";

const snapshot = {
  id: "mss_1",
  tenantId: "tenant-1",
  userId: 1,
  provider: "shopee",
  source: "recorded_mcp_sample",
  keyword: "CGM",
  region: "TH",
  locale: "th-TH",
  capturedAt: "2026-07-01T00:00:00.000Z",
  sourceCapturedAt: "2026-07-01T00:00:00.000Z",
  capabilityVersion: "test",
  status: "ready",
  itemCount: 1,
  fieldCoveragePercent: 95,
  unknownFieldCount: 1,
  metrics: {
    itemCount: 1,
    officialLikeCount: 1,
    officialLikeShare: 1,
    averagePrice: 1890,
    medianPrice: 1890,
    minPrice: 1890,
    maxPrice: 1890,
    totalMonthlySold: 5320,
    averageRating: 4.9,
    shareOfShelfByBrand: [{ brand: "Sinocare", count: 1, share: 1 }],
    shareOfShelfBySeller: [{ sellerName: "HealthPlus Official", count: 1, share: 1 }],
  },
  items: [{
    rank: 1,
    title: "CGM Starter Kit Official Store",
    sellerName: "HealthPlus Official",
    brand: "Sinocare",
    price: 1890,
    originalPrice: null,
    discount: null,
    monthlySoldCount: 5320,
    historicalSoldCount: 10000,
    rating: 4.9,
    reviewCount: 1480,
    shopeeVerified: true,
    estimatedDeliveryTimeText: "2 days",
    image: "https://example.test/cgm.jpg",
    itemId: 1001,
    shopId: 2001,
  }],
};

const secondSnapshot = {
  ...snapshot,
  id: "mss_0",
  capturedAt: "2026-06-30T00:00:00.000Z",
  itemCount: 1,
};

const report = {
  id: "msr_1",
  snapshotId: "mss_1",
  reportType: "executive_image_summary",
  aspectRatio: "1:1",
  imageModel: "gpt-image-2",
  title: "CGM Competitive Intelligence",
  executiveSummary: ["Sinocare leads brand visibility."],
  kpis: [{ label: "Listings", value: "1", detail: "Search result items captured" }],
  winners: [{ label: "Hero SKU", winner: "CGM Starter Kit", evidence: "Highest monthly sold." }],
  recommendations: ["Watch official store pricing."],
  promptPayload: {
    skillKey: "marketplace_report.executive_image_summary",
    model: "gpt-image-2",
    prompt: "Create a 1:1 e-commerce competitive intelligence image report.",
    evidence: { snapshot: { id: "mss_1" } },
  },
  createdAt: "2026-07-01T00:01:00.000Z",
};

const discovery = {
  id: "msd_1",
  snapshotId: "mss_1",
  keyword: "CGM",
  capturedAt: "2026-07-01T00:00:00.000Z",
  productFamilies: [{
    label: "Sinocare",
    count: 1,
    representativeTitle: "CGM Starter Kit Official Store",
    brands: ["Sinocare"],
    priceBand: { min: 1890, max: 1890, median: 1890 },
    useCaseHint: "starter kit",
  }],
  opportunities: [{
    type: "hero_sku",
    title: "Hero SKU candidate",
    evidence: "CGM Starter Kit has the strongest monthly sold signal.",
    severity: "high",
  }],
};

const watchlist = {
  id: "msw_1",
  tenantId: "tenant-1",
  userId: 1,
  keyword: "CGM",
  provider: "shopee",
  region: "TH",
  cadence: "daily",
  alertRules: ["rank_change", "new_competitor"],
  createdAt: "2026-07-01T00:02:00.000Z",
};

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
  useLocation: () => [currentLocation, vi.fn()],
}));

vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => ({ snapshot })), isPending: false, data: null });
  const invalidate = vi.fn();
  return {
    trpc: {
      useUtils: () => ({
        marketplaceIntelligence: {
          listSnapshots: { invalidate },
          listKeywordDiscoveries: { invalidate },
          listReports: { invalidate },
          listWatchlists: { invalidate },
          listWatchlistEvents: { invalidate },
          listReportExports: { invalidate },
          diagnostics: { invalidate },
        },
      }),
      marketplaceIntelligence: {
        listSnapshots: { useQuery: () => ({ data: { snapshots: [snapshot, secondSnapshot] } }) },
        listKeywordDiscoveries: { useQuery: () => ({ data: { discoveries: [discovery] } }) },
        listReports: { useQuery: () => ({ data: { reports: [report] } }) },
        listWatchlists: { useQuery: () => ({ data: { watchlists: [watchlist] } }) },
        getSnapshot: { useQuery: () => ({ data: snapshot }) },
        getKeywordDiscovery: { useQuery: () => ({ data: discovery }) },
        getReport: { useQuery: () => ({ data: report }) },
        getWatchlist: { useQuery: () => ({ data: watchlist }) },
        listWatchlistEvents: { useQuery: () => ({ data: [{
          id: "mswe_1",
          watchlistId: "msw_1",
          eventType: "new_competitor",
          severity: "medium",
          summary: "New seller entered first page.",
          createdAt: "2026-07-01T00:03:00.000Z",
        }] }) },
        compareSnapshots: { useQuery: () => ({ data: {
          baselineSnapshotId: "mss_0",
          latestSnapshotId: "mss_1",
          keyword: "CGM",
          dateRange: { baselineCapturedAt: "2026-06-30T00:00:00.000Z", latestCapturedAt: "2026-07-01T00:00:00.000Z" },
          metricDeltas: { itemCount: 0, totalMonthlySold: 120, medianPrice: -20, officialLikeShare: 0 },
          exactItemMatches: [{ key: "2001:1001", title: "CGM Starter Kit Official Store" }],
          newEntrants: [],
          missingItems: [],
        } }) },
        listReportExports: { useQuery: () => ({ data: { exports: [{
          id: "msre_1",
          reportId: "msr_1",
          exportType: "image_prompt",
          templateKey: "marketplace_report.executive_image_summary",
          aspectRatio: "1:1",
          status: "ready",
          providerModel: "gpt-image-2",
          promptHash: "a".repeat(64),
          payloadHash: "b".repeat(64),
          sourceSummary: { snapshotId: "mss_1" },
          createdAt: "2026-07-01T00:04:00.000Z",
        }] } }) },
        fieldDictionary: { useQuery: () => ({ data: { fields: [] } }) },
        diagnostics: { useQuery: () => ({ data: {
          snapshotCount: 1,
          reportCount: 1,
          watchlistCount: 1,
          fieldSampleCount: 1,
          fieldGroups: { Product: 4, Price: 3 },
          retention: { normalizedSnapshotDays: 365, rawDiagnosticDays: 14, rawPayloadStored: false, lastCleanupAt: "2026-07-01T00:05:00.000Z" },
          audit: { eventCount: 3, latestEvents: [{ action: "snapshot_created" }] },
          rateLimits: { windowSeconds: 3600, activeBuckets: [{ action: "snapshot_write", count: 1, limit: 120 }] },
        } }) },
        createSnapshotFromProbe: { useMutation: mutation },
        createKeywordDiscovery: { useMutation: mutation },
        createReport: { useMutation: mutation },
        createMonitorReport: { useMutation: mutation },
        createReportExport: { useMutation: mutation },
        createWatchlist: { useMutation: mutation },
        createCaptureCandidateBatch: { useMutation: mutation },
        recordWatchlistEvent: { useMutation: mutation },
        runRetentionCleanup: { useMutation: mutation },
      },
    },
  };
});

describe("MarketplaceIntelligence detail routes", () => {
  it("renders a keyword analysis action instead of a passive mock shell", () => {
    currentLocation = "/marketplace-capture/intelligence";
    render(<MarketplaceIntelligence />);

    expect(screen.getByRole("button", { name: "Analyze keyword" })).toBeInTheDocument();
    expect(screen.getByText(/Source: recorded_mcp_sample/)).toBeInTheDocument();
    expect(screen.getByText("Keyword search results snapshot")).toBeInTheDocument();
  });

  it("renders snapshot detail from deep link", () => {
    currentLocation = "/marketplace-capture/intelligence/snapshots/mss_1";
    render(<MarketplaceIntelligence />);

    expect(screen.getByRole("heading", { name: "CGM snapshot" })).toBeInTheDocument();
    expect(screen.getByText("Brand share of shelf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Capture batch" })).toBeInTheDocument();
  });

  it("renders keyword discovery detail from deep link", () => {
    currentLocation = "/marketplace-capture/intelligence/discovery/msd_1";
    render(<MarketplaceIntelligence />);

    expect(screen.getByRole("heading", { name: "CGM discovery map" })).toBeInTheDocument();
    expect(screen.getByText("Product families")).toBeInTheDocument();
    expect(screen.getByText("Opportunity signals")).toBeInTheDocument();
    expect(screen.getByText("Hero SKU candidate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create report payload" })).toBeInTheDocument();
  });

  it("renders report detail from deep link", () => {
    currentLocation = "/marketplace-capture/intelligence/reports/msr_1";
    render(<MarketplaceIntelligence />);

    expect(screen.getByRole("heading", { name: "CGM Competitive Intelligence" })).toBeInTheDocument();
    expect(screen.getByText("Image prompt")).toBeInTheDocument();
    expect(screen.getByText("Report exports")).toBeInTheDocument();
    expect(screen.getByText("Shareable image preview package")).toBeInTheDocument();
    expect(screen.getByText("Multi-day exact SKU monitor")).toBeInTheDocument();
    expect(screen.getByText(/image_prompt · ready/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open source snapshot" })).toBeInTheDocument();
  });

  it("renders watchlist detail and event timeline from deep link", () => {
    currentLocation = "/marketplace-capture/intelligence/watchlists/msw_1";
    render(<MarketplaceIntelligence />);

    expect(screen.getByRole("heading", { name: "CGM watchlist" })).toBeInTheDocument();
    expect(screen.getByText("Watchlist event timeline")).toBeInTheDocument();
    expect(screen.getByText("New seller entered first page.")).toBeInTheDocument();
  });

  it("renders diagnostics as rollout safety cards", () => {
    currentLocation = "/marketplace-capture/intelligence/diagnostics";
    render(<MarketplaceIntelligence />);

    expect(screen.getByRole("heading", { name: "Diagnostics and rollout safety" })).toBeInTheDocument();
    expect(screen.getByText("Import health")).toBeInTheDocument();
    expect(screen.getByText("Rate-limit metadata")).toBeInTheDocument();
    expect(screen.getByText("Audit events")).toBeInTheDocument();
    expect(screen.getByText("Rollback/live status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run retention cleanup" })).toBeInTheDocument();
  });
});
