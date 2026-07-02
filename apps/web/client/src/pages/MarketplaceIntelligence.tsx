import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { BarChart3, Bell, Database, FileImage, type LucideIcon, Microscope, Play, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";

const navItems = [
  { href: "/marketplace-capture/intelligence", label: "Overview" },
  { href: "/marketplace-capture/intelligence/discovery", label: "Discovery" },
  { href: "/marketplace-capture/intelligence/snapshots", label: "Snapshots" },
  { href: "/marketplace-capture/intelligence/reports", label: "Reports" },
  { href: "/marketplace-capture/intelligence/watchlists", label: "Watchlists" },
  { href: "/marketplace-capture/intelligence/fields", label: "Fields" },
  { href: "/marketplace-capture/intelligence/diagnostics", label: "Diagnostics" },
  { href: "/marketplace-capture/intelligence/connector-lab", label: "Connector Lab" },
];

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US") : "-";
}

function errorMessage(error: unknown) {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message ?? "");
  return String(error);
}

function needsMcpBridgeConfig(detail?: string) {
  return Boolean(detail && /MCP live|live execution|live connector endpoint|connector authorization|Authorize|Settings/i.test(detail));
}

function routeId(location: string, section: "discovery" | "snapshots" | "reports" | "watchlists") {
  return location.match(new RegExp(`/marketplace-capture/intelligence/${section}/([^/?#]+)`))?.[1] ?? null;
}

export default function MarketplaceIntelligence() {
  const [location] = useLocation();
  const initialKeyword = useMemo(() => {
    const query = new URLSearchParams(location.split("?")[1] ?? "");
    return query.get("keyword")?.trim() || "CGM";
  }, [location]);
  const queryParams = useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location]);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [latestHandoffUrl, setLatestHandoffUrl] = useState<string | null>(null);
  const [baselineSnapshotId, setBaselineSnapshotId] = useState<string>("");
  const [latestCompareSnapshotId, setLatestCompareSnapshotId] = useState<string>("");
  const [analysisStatus, setAnalysisStatus] = useState<{ tone: "info" | "success" | "error"; message: string; detail?: string } | null>(null);
  const autoAnalyzeStarted = useRef(false);
  const utils = trpc.useUtils();
  const routeSnapshotId = routeId(location, "snapshots");
  const routeDiscoveryId = routeId(location, "discovery");
  const routeReportId = routeId(location, "reports");
  const routeWatchlistId = routeId(location, "watchlists");
  const routeMode = location.includes("/fields")
    ? "fields"
    : location.includes("/reports")
      ? "reports"
      : location.includes("/watchlists")
        ? "watchlists"
        : location.includes("/diagnostics")
          ? "diagnostics"
          : location.includes("/snapshots")
            ? "snapshots"
          : location.includes("/discovery")
            ? "discovery"
            : "overview";
  const snapshotsQuery = trpc.marketplaceIntelligence.listSnapshots.useQuery();
  const discoveriesQuery = trpc.marketplaceIntelligence.listKeywordDiscoveries.useQuery();
  const reportsQuery = trpc.marketplaceIntelligence.listReports.useQuery();
  const watchlistsQuery = trpc.marketplaceIntelligence.listWatchlists.useQuery();
  const snapshotDetailQuery = trpc.marketplaceIntelligence.getSnapshot.useQuery(
    { snapshotId: routeSnapshotId ?? "" },
    { enabled: Boolean(routeSnapshotId) },
  );
  const discoveryDetailQuery = trpc.marketplaceIntelligence.getKeywordDiscovery.useQuery(
    { discoveryId: routeDiscoveryId ?? "" },
    { enabled: Boolean(routeDiscoveryId) },
  );
  const reportDetailQuery = trpc.marketplaceIntelligence.getReport.useQuery(
    { reportId: routeReportId ?? "" },
    { enabled: Boolean(routeReportId) },
  );
  const watchlistDetailQuery = trpc.marketplaceIntelligence.getWatchlist.useQuery(
    { watchlistId: routeWatchlistId ?? "" },
    { enabled: Boolean(routeWatchlistId) },
  );
  const watchlistEventsQuery = trpc.marketplaceIntelligence.listWatchlistEvents.useQuery(
    { watchlistId: routeWatchlistId ?? "" },
    { enabled: Boolean(routeWatchlistId) },
  );
  const comparisonQuery = trpc.marketplaceIntelligence.compareSnapshots.useQuery(
    { baselineSnapshotId, latestSnapshotId: latestCompareSnapshotId },
    { enabled: Boolean(baselineSnapshotId && latestCompareSnapshotId && baselineSnapshotId !== latestCompareSnapshotId) },
  );
  const reportExportsQuery = trpc.marketplaceIntelligence.listReportExports.useQuery(
    { reportId: routeReportId ?? undefined },
    { enabled: routeMode === "reports" },
  );
  const fieldsQuery = trpc.marketplaceIntelligence.fieldDictionary.useQuery();
  const diagnosticsQuery = trpc.marketplaceIntelligence.diagnostics.useQuery();
  const createSnapshot = trpc.marketplaceIntelligence.createSnapshotFromProbe.useMutation({
    onSuccess: async (data) => {
      setSelectedSnapshotId(data.snapshot.id);
      setAnalysisStatus({
        tone: "success",
        message: `สร้าง snapshot สำหรับ "${data.snapshot.keyword}" แล้ว`,
        detail: `${data.snapshot.itemCount} listings · ${data.snapshot.fieldCoveragePercent}% field coverage · ${data.snapshot.source}`,
      });
      await Promise.all([
        utils.marketplaceIntelligence.listSnapshots.invalidate(),
        utils.marketplaceIntelligence.diagnostics.invalidate(),
      ]);
    },
    onError: (error) => setAnalysisStatus({
      tone: "error",
      message: "สร้าง snapshot ไม่สำเร็จ",
      detail: errorMessage(error),
    }),
  });
  const createReport = trpc.marketplaceIntelligence.createReport.useMutation({
    onSuccess: async () => {
      setAnalysisStatus((current) => current ?? { tone: "success", message: "สร้าง report payload แล้ว" });
      await Promise.all([
        utils.marketplaceIntelligence.listReports.invalidate(),
        utils.marketplaceIntelligence.diagnostics.invalidate(),
      ]);
    },
    onError: (error) => setAnalysisStatus({
      tone: "error",
      message: "สร้าง report payload ไม่สำเร็จ",
      detail: errorMessage(error),
    }),
  });
  const createDiscovery = trpc.marketplaceIntelligence.createKeywordDiscovery.useMutation({
    onSuccess: async () => {
      setAnalysisStatus((current) => current ?? { tone: "success", message: "สร้าง discovery map แล้ว" });
      await Promise.all([
        utils.marketplaceIntelligence.listKeywordDiscoveries.invalidate(),
        utils.marketplaceIntelligence.diagnostics.invalidate(),
      ]);
    },
    onError: (error) => setAnalysisStatus({
      tone: "error",
      message: "สร้าง discovery map ไม่สำเร็จ",
      detail: errorMessage(error),
    }),
  });
  const createWatchlist = trpc.marketplaceIntelligence.createWatchlist.useMutation({
    onSuccess: async () => {
      setAnalysisStatus((current) => current ?? { tone: "success", message: "เพิ่ม keyword watchlist แล้ว" });
      await Promise.all([
        utils.marketplaceIntelligence.listWatchlists.invalidate(),
        utils.marketplaceIntelligence.diagnostics.invalidate(),
      ]);
    },
    onError: (error) => setAnalysisStatus({
      tone: "error",
      message: "สร้าง watchlist ไม่สำเร็จ",
      detail: errorMessage(error),
    }),
  });
  const createReportExport = trpc.marketplaceIntelligence.createReportExport.useMutation({
    onSuccess: async () => {
      await utils.marketplaceIntelligence.listReportExports.invalidate();
    },
  });
  const createMonitorReport = trpc.marketplaceIntelligence.createMonitorReport.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.marketplaceIntelligence.listReports.invalidate(),
        utils.marketplaceIntelligence.diagnostics.invalidate(),
      ]);
    },
  });
  const createCaptureCandidateBatch = trpc.marketplaceIntelligence.createCaptureCandidateBatch.useMutation({
    onSuccess: (data) => {
      setLatestHandoffUrl(`/marketplace-capture/candidates/${encodeURIComponent(data.marketplaceCaptureBatchId)}`);
    },
  });
  const recordWatchlistEvent = trpc.marketplaceIntelligence.recordWatchlistEvent.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.marketplaceIntelligence.listWatchlistEvents.invalidate(),
        utils.marketplaceIntelligence.diagnostics.invalidate(),
      ]);
    },
  });
  const runRetentionCleanup = trpc.marketplaceIntelligence.runRetentionCleanup.useMutation({
    onSuccess: async () => {
      await utils.marketplaceIntelligence.diagnostics.invalidate();
    },
  });

  const snapshots = snapshotsQuery.data?.snapshots ?? [];
  const discoveries = discoveriesQuery.data?.discoveries ?? [];
  const reports = reportsQuery.data?.reports ?? [];
  const watchlists = watchlistsQuery.data?.watchlists ?? [];
  const normalizedKeyword = keyword.trim().toLowerCase();
  const keywordSnapshots = useMemo(
    () => snapshots.filter((snapshot) => snapshot.keyword.trim().toLowerCase() === normalizedKeyword),
    [normalizedKeyword, snapshots],
  );
  const latestSnapshot = useMemo(
    () => snapshotDetailQuery.data
      ?? snapshots.find((snapshot) => snapshot.id === selectedSnapshotId)
      ?? keywordSnapshots[0]
      ?? null,
    [keywordSnapshots, selectedSnapshotId, snapshotDetailQuery.data, snapshots],
  );
  const defaultComparePair = useMemo(() => {
    if (snapshots.length < 2) return null;
    return {
      baseline: snapshots[1],
      latest: snapshots[0],
    };
  }, [snapshots]);
  useEffect(() => {
    if (!defaultComparePair) return;
    setBaselineSnapshotId((current) => current || defaultComparePair.baseline.id);
    setLatestCompareSnapshotId((current) => current || defaultComparePair.latest.id);
  }, [defaultComparePair]);
  const selectedReport = useMemo(
    () => reportDetailQuery.data ?? reports.find((report) => report.id === routeReportId) ?? reports[0] ?? null,
    [reportDetailQuery.data, reports, routeReportId],
  );
  const selectedDiscovery = useMemo(
    () => discoveryDetailQuery.data ?? discoveries.find((discovery) => discovery.id === routeDiscoveryId) ?? discoveries[0] ?? null,
    [discoveryDetailQuery.data, discoveries, routeDiscoveryId],
  );
  const selectedWatchlist = useMemo(
    () => watchlistDetailQuery.data ?? watchlists.find((watchlist) => watchlist.id === routeWatchlistId) ?? watchlists[0] ?? null,
    [routeWatchlistId, watchlistDetailQuery.data, watchlists],
  );
  const runSnapshot = () => {
    setAnalysisStatus({
      tone: "info",
      message: `รอข้อมูล write-back สำหรับ "${keyword.trim()}"`,
      detail: "ให้ใช้ OpenAI-hosted Shopee app ดึงผลค้นหา แล้วเรียก SmartSpecPro MCP tool/API เพื่อบันทึก snapshot ก่อน จากนั้นหน้านี้จะใช้ snapshot ที่บันทึกไว้สร้าง discovery/report ต่อ",
    });
  };

  const runKeywordAnalysis = async () => {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) return;
    const sourceSnapshot = keywordSnapshots[0] ?? null;
    if (!sourceSnapshot) {
      setAnalysisStatus({
        tone: "error",
        message: `ยังไม่มี snapshot จริงสำหรับ "${trimmedKeyword}"`,
        detail: "ต้องส่งผลค้นหาจาก OpenAI-hosted Shopee app กลับมาเก็บที่ SmartSpecPro ผ่าน MCP tool/API ก่อน ระบบจะไม่สร้างข้อมูลจาก fixture หรือยิง direct live probe แทน",
      });
      return;
    }
    setAnalysisStatus({
      tone: "info",
      message: `กำลังวิเคราะห์ keyword "${trimmedKeyword}" จาก snapshot ที่บันทึกแล้ว`,
      detail: `${sourceSnapshot.itemCount} listings · ${sourceSnapshot.fieldCoveragePercent}% field coverage · ${sourceSnapshot.source}`,
    });
    try {
      const snapshotId = sourceSnapshot.id;
      setSelectedSnapshotId(snapshotId);
      await createDiscovery.mutateAsync({ snapshotId });
      await createReport.mutateAsync({
        snapshotId,
        reportType: "executive_image_summary",
        aspectRatio: "1:1",
        imageModel: "gpt-image-2",
      });
      setAnalysisStatus({
        tone: "success",
        message: `วิเคราะห์ "${trimmedKeyword}" เสร็จแล้ว`,
        detail: `${sourceSnapshot.itemCount} listings · ใช้ snapshot จริงที่ write-back แล้วสร้าง discovery map และ report payload`,
      });
    } catch (error) {
      setAnalysisStatus({
        tone: "error",
        message: `วิเคราะห์ "${trimmedKeyword}" ไม่สำเร็จ`,
        detail: errorMessage(error) || "ตรวจสอบ snapshot ที่บันทึกไว้และ feature flag สำหรับ discovery/report",
      });
    }
  };

  const runReport = () => {
    if (!latestSnapshot) return;
    createReport.mutate({
      snapshotId: latestSnapshot.id,
      reportType: "executive_image_summary",
      aspectRatio: "1:1",
      imageModel: "gpt-image-2",
    });
  };

  useEffect(() => {
    if (autoAnalyzeStarted.current) return;
    if (queryParams.get("auto") !== "1") return;
    if (!keyword.trim()) return;
    autoAnalyzeStarted.current = true;
    void runKeywordAnalysis();
  }, [keyword, queryParams]);

  const runMonitorReport = () => {
    const baseline = baselineSnapshotId || defaultComparePair?.baseline.id || "";
    const latest = latestCompareSnapshotId || defaultComparePair?.latest.id || "";
    if (!baseline || !latest || baseline === latest) return;
    createMonitorReport.mutate({
      baselineSnapshotId: baseline,
      latestSnapshotId: latest,
      aspectRatio: "16:9",
      imageModel: "gpt-image-2",
    });
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                <span className="rounded-full border border-slate-200 px-2 py-0.5">Marketplace Capture</span>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">Keyword intelligence</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-normal">Marketplace Intelligence</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                วิเคราะห์สินค้าจาก keyword ก่อนเลือก SKU จริง เก็บ snapshot, field coverage, report evidence และ handoff กลับไป Marketplace Capture.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/settings?tab=integrations">
                <Button variant="outline" size="sm"><ShieldCheck className="mr-2 h-4 w-4" /> Connection settings</Button>
              </Link>
              <Link href="/marketplace-capture/intelligence/connector-lab">
                <Button variant="outline" size="sm"><Microscope className="mr-2 h-4 w-4" /> Connector Lab</Button>
              </Link>
            </div>
          </div>
          <nav className="mt-5 flex gap-2 overflow-x-auto rounded-lg bg-slate-100 p-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={classNames(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-slate-600",
                  (location === item.href || (item.href !== "/marketplace-capture/intelligence" && location.startsWith(`${item.href}/`))) && "bg-white text-slate-950 shadow-sm",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <section className="grid gap-4 md:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 font-medium"><Search className="h-4 w-4" /> Keyword test</div>
              <label className="text-xs font-medium text-slate-500" htmlFor="marketplace-keyword">Keyword</label>
              <input
                id="marketplace-keyword"
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setSelectedSnapshotId(null);
                }}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <Button
                className="mt-3 w-full"
                onClick={runKeywordAnalysis}
                disabled={createDiscovery.isPending || createReport.isPending || keyword.trim().length === 0}
              >
                <Sparkles className="mr-2 h-4 w-4" /> Analyze keyword
              </Button>
              <Button className="mt-2 w-full" variant="outline" onClick={runSnapshot} disabled={keyword.trim().length === 0}>
                <Play className="mr-2 h-4 w-4" /> How to create snapshot
              </Button>
              <Button className="mt-2 w-full" variant="outline" onClick={runReport} disabled={!latestSnapshot || createReport.isPending}>
                <FileImage className="mr-2 h-4 w-4" /> Create image report payload
              </Button>
              <Button
                className="mt-2 w-full"
                variant="outline"
                onClick={() => latestSnapshot && createDiscovery.mutate({ snapshotId: latestSnapshot.id })}
                disabled={!latestSnapshot || createDiscovery.isPending}
              >
                <Sparkles className="mr-2 h-4 w-4" /> Create discovery map
              </Button>
              <Button className="mt-2 w-full" variant="outline" onClick={() => createWatchlist.mutate({ keyword, region: "TH", cadence: "daily" })} disabled={createWatchlist.isPending || keyword.trim().length === 0}>
                <Bell className="mr-2 h-4 w-4" /> Watch keyword
              </Button>
              {analysisStatus ? (
                <div className={classNames(
                  "mt-3 rounded-lg border p-3 text-sm",
                  analysisStatus.tone === "error" && "border-red-200 bg-red-50 text-red-900",
                  analysisStatus.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
                  analysisStatus.tone === "info" && "border-sky-200 bg-sky-50 text-sky-900",
                )}>
                  <div className="font-medium">{analysisStatus.message}</div>
                  {analysisStatus.detail ? <div className="mt-1 text-xs opacity-80">{analysisStatus.detail}</div> : null}
                  {analysisStatus.tone === "error" && needsMcpBridgeConfig(analysisStatus.detail) ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <Link
                        className="inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-xs font-medium text-red-900 ring-1 ring-red-200 hover:bg-red-50"
                        href="/settings?tab=integrations"
                      >
                        เปิด User connection settings
                      </Link>
                      <Link
                        className="inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-xs font-medium text-red-900 ring-1 ring-red-200 hover:bg-red-50"
                        href="/marketplace-capture/intelligence/connector-lab"
                      >
                        เปิด Connector Lab เพื่อตรวจ live readiness
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Snapshot จริงต้องมาจาก OpenAI-hosted Shopee app ที่เรียก SmartSpecPro MCP tool/API เพื่อ write-back เข้าระบบ ไม่มีการสร้าง sample อัตโนมัติ.
                </div>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 font-medium"><Database className="h-4 w-4" /> Latest snapshot</div>
              {latestSnapshot ? (
                <div className="space-y-2 text-sm">
                  <div className="font-medium">{latestSnapshot.keyword}</div>
                  <div className="text-slate-500">{latestSnapshot.id}</div>
                  <div className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                    Source: {latestSnapshot.source}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-slate-50 p-2"><div className="text-xs text-slate-500">Listings</div><div className="font-semibold">{latestSnapshot.itemCount}</div></div>
                    <div className="rounded-md bg-slate-50 p-2"><div className="text-xs text-slate-500">Coverage</div><div className="font-semibold">{latestSnapshot.fieldCoveragePercent}%</div></div>
                    <div className="rounded-md bg-slate-50 p-2"><div className="text-xs text-slate-500">Median</div><div className="font-semibold">{formatNumber(latestSnapshot.metrics.medianPrice)}</div></div>
                    <div className="rounded-md bg-slate-50 p-2"><div className="text-xs text-slate-500">Monthly sold</div><div className="font-semibold">{formatNumber(latestSnapshot.metrics.totalMonthlySold)}</div></div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">ยังไม่มี snapshot สำหรับ keyword นี้ กด Analyze keyword เพื่อเริ่มสร้างข้อมูล</p>
              )}
            </div>
          </aside>

          <section className="space-y-4">
            {routeMode === "overview" && (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard icon={BarChart3} label="Snapshots" value={formatNumber(diagnosticsQuery.data?.snapshotCount)} />
                  <MetricCard icon={FileImage} label="Reports" value={formatNumber(diagnosticsQuery.data?.reportCount)} />
                  <MetricCard icon={Bell} label="Watchlists" value={formatNumber(diagnosticsQuery.data?.watchlistCount)} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <WorkflowCard
                    title="Explore keyword/category"
                    description="ใช้กับสินค้าที่ยังไม่รู้ SKU แน่ชัด เช่น notebook, กางเกงผ้าอ้อม หรือกระดาษทิชชู่ เพื่อดูแบรนด์ รุ่น ชนิด ราคา และ use-case ก่อนสร้าง product/candidate"
                    href="/marketplace-capture/intelligence/discovery"
                    action="Open Discovery"
                  />
                  <WorkflowCard
                    title="Track known product/SKU"
                    description="ใช้กับสินค้าที่มี shop_id + item_id หรือ product ใน Marketplace Capture แล้ว เพื่อตามราคา rank ยอดขาย และ metric delta แบบ evidence-backed"
                    href="/marketplace-capture"
                    action="Open Marketplace Capture"
                  />
                </div>
              </>
            )}

            {routeMode === "discovery" && (
              <>
                {selectedDiscovery ? (
                  <DetailPanel
                    title={`${selectedDiscovery.keyword} discovery map`}
                    subtitle={`Keyword-first product exploration · ${selectedDiscovery.capturedAt}`}
                    actions={(
                      <>
                        <Link href={`/marketplace-capture/intelligence/snapshots/${encodeURIComponent(selectedDiscovery.snapshotId)}`}>
                          <Button size="sm" variant="outline">Open source snapshot</Button>
                        </Link>
                        <Button size="sm" variant="outline" onClick={() => createWatchlist.mutate({ keyword: selectedDiscovery.keyword, region: "TH", cadence: "daily" })} disabled={createWatchlist.isPending}>
                          Watch keyword
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => createReport.mutate({ snapshotId: selectedDiscovery.snapshotId, reportType: "executive_image_summary", aspectRatio: "1:1", imageModel: "gpt-image-2" })} disabled={createReport.isPending}>
                          Create report payload
                        </Button>
                      </>
                    )}
                  >
                    <div className="grid gap-3 md:grid-cols-3">
                      <MetricPill label="Families" value={String(selectedDiscovery.productFamilies.length)} detail="brand/model/type clusters" />
                      <MetricPill label="Opportunities" value={String(selectedDiscovery.opportunities.length)} detail="evidence-backed signals" />
                      <MetricPill label="Handoff" value="Snapshot linked" detail={selectedDiscovery.snapshotId} />
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <section className="rounded-lg border border-slate-200 p-3">
                        <h3 className="mb-3 text-sm font-medium">Product families</h3>
                        <div className="space-y-3">
                          {selectedDiscovery.productFamilies.map((family) => (
                            <article key={family.label} className="rounded-lg bg-slate-50 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-medium">{family.label}</div>
                                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">{family.count} listings</span>
                              </div>
                              <p className="mt-1 text-sm text-slate-600">{family.representativeTitle}</p>
                              <div className="mt-2 text-xs text-slate-500">
                                Price {formatNumber(family.priceBand.min)}-{formatNumber(family.priceBand.max)} THB · median {formatNumber(family.priceBand.median)}
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                      <section className="rounded-lg border border-slate-200 p-3">
                        <h3 className="mb-3 text-sm font-medium">Opportunity signals</h3>
                        <div className="space-y-3">
                          {selectedDiscovery.opportunities.map((opportunity) => (
                            <article key={`${opportunity.type}-${opportunity.title}`} className="rounded-lg bg-slate-50 p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-medium">{opportunity.title}</div>
                                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">{opportunity.severity}</span>
                              </div>
                              <p className="mt-1 text-sm text-slate-600">{opportunity.evidence}</p>
                            </article>
                          ))}
                        </div>
                      </section>
                    </div>
                    <div className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
                      Discovery นี้ยังไม่บังคับสร้าง product จริง ผู้ใช้ควร review cluster ก่อนค่อย handoff ไป candidate batch, watchlist, report หรือ product detail.
                    </div>
                  </DetailPanel>
                ) : (
                  <DetailPanel
                    title="Keyword Product Discovery"
                    subtitle="เริ่มจาก broad keyword เพื่อหาแบรนด์ รุ่น ชนิดสินค้า use-case และช่องว่างตลาดก่อนระบุ SKU"
                    actions={latestSnapshot ? (
                      <Button size="sm" onClick={() => createDiscovery.mutate({ snapshotId: latestSnapshot.id })} disabled={createDiscovery.isPending}>
                        Create discovery from latest snapshot
                      </Button>
                    ) : null}
                  >
                    <p className="text-sm text-slate-600">
                      สร้าง snapshot ก่อน แล้วระบบจะจัดกลุ่ม product family, price tier, seller/trust mix และ opportunity signals เพื่อใช้วางแผนสินค้า/คอนเทนต์/รายงาน.
                    </p>
                  </DetailPanel>
                )}

                <ListPanel title="Saved keyword discoveries" empty="ยังไม่มี keyword discovery">
                  {discoveries.map((discovery) => (
                    <Link key={discovery.id} href={`/marketplace-capture/intelligence/discovery/${encodeURIComponent(discovery.id)}`} className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                      <div className="font-medium">{discovery.keyword}</div>
                      <div className="mt-1 text-sm text-slate-600">{discovery.productFamilies.length} families · {discovery.opportunities.length} opportunities · {discovery.capturedAt}</div>
                    </Link>
                  ))}
                </ListPanel>
              </>
            )}

            {(routeMode === "overview" || routeMode === "snapshots") && (
              <>
                {routeMode === "snapshots" && latestSnapshot && (
                  <DetailPanel
                    title={`${latestSnapshot.keyword} snapshot`}
                    subtitle={`${latestSnapshot.source} · ${latestSnapshot.capturedAt}`}
                    actions={(
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => createCaptureCandidateBatch.mutate({ snapshotId: latestSnapshot.id })}
                          disabled={createCaptureCandidateBatch.isPending}
                        >
                          Create Capture batch
                        </Button>
                        {latestHandoffUrl ? (
                          <Link href={latestHandoffUrl}>
                            <Button size="sm" variant="outline">Open batch</Button>
                          </Link>
                        ) : null}
                      </>
                    )}
                  >
                    <div className="grid gap-3 md:grid-cols-4">
                      <MetricPill label="Source" value={latestSnapshot.source} />
                      <MetricPill label="Field coverage" value={`${latestSnapshot.fieldCoveragePercent}%`} />
                      <MetricPill label="Official-like" value={`${Math.round(latestSnapshot.metrics.officialLikeShare * 100)}%`} />
                      <MetricPill label="Median price" value={`${formatNumber(latestSnapshot.metrics.medianPrice)} THB`} />
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <ShareList title="Brand share of shelf" rows={latestSnapshot.metrics.shareOfShelfByBrand} labelKey="brand" />
                      <ShareList title="Seller share of shelf" rows={latestSnapshot.metrics.shareOfShelfBySeller} labelKey="sellerName" />
                    </div>
                  </DetailPanel>
                )}

                <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-4 py-3 font-medium">Keyword search results snapshot</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr><th className="p-3">Rank</th><th className="p-3">Product</th><th className="p-3">Seller</th><th className="p-3">Brand</th><th className="p-3">Price</th><th className="p-3">Sold</th><th className="p-3">Rating</th></tr>
                      </thead>
                      <tbody>
                        {(latestSnapshot?.items ?? []).map((item) => (
                          <tr key={`${item.shopId}-${item.itemId}`} className="border-t border-slate-100">
                            <td className="p-3">#{item.rank}</td>
                            <td className="max-w-sm p-3 font-medium">{item.title}</td>
                            <td className="p-3">{item.sellerName}</td>
                            <td className="p-3">{item.brand ?? "-"}</td>
                            <td className="p-3">{formatNumber(item.price)} THB</td>
                            <td className="p-3">{formatNumber(item.monthlySoldCount)}</td>
                            <td className="p-3">{item.rating?.toFixed(2) ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {routeMode === "snapshots" && snapshots.length > 0 && (
                  <ListPanel title="Saved snapshots" empty="ยังไม่มี snapshot">
                    {snapshots.map((snapshot) => (
                      <Link key={snapshot.id} href={`/marketplace-capture/intelligence/snapshots/${encodeURIComponent(snapshot.id)}`} className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                        <div className="font-medium">{snapshot.keyword}</div>
                        <div className="mt-1 text-sm text-slate-600">{snapshot.itemCount} listings · {snapshot.fieldCoveragePercent}% coverage · {snapshot.source}</div>
                      </Link>
                    ))}
                  </ListPanel>
                )}
              </>
            )}

            {routeMode === "reports" && (
              <>
                <DetailPanel
                  title="Multi-day exact SKU monitor"
                  subtitle="เปรียบเทียบเฉพาะ seller/SKU ที่ match ด้วย shop_id + item_id และแยก new entrant เป็น baseline missing"
                  actions={(
                    <Button size="sm" variant="outline" onClick={runMonitorReport} disabled={snapshots.length < 2 || createMonitorReport.isPending}>
                      Create monitor report
                    </Button>
                  )}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      Baseline snapshot
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={baselineSnapshotId || defaultComparePair?.baseline.id || ""}
                        onChange={(event) => setBaselineSnapshotId(event.target.value)}
                      >
                        <option value="">Select baseline</option>
                        {snapshots.map((snapshot) => (
                          <option key={snapshot.id} value={snapshot.id}>{snapshot.keyword} · {snapshot.capturedAt}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Latest snapshot
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={latestCompareSnapshotId || defaultComparePair?.latest.id || ""}
                        onChange={(event) => setLatestCompareSnapshotId(event.target.value)}
                      >
                        <option value="">Select latest</option>
                        {snapshots.map((snapshot) => (
                          <option key={snapshot.id} value={snapshot.id}>{snapshot.keyword} · {snapshot.capturedAt}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {comparisonQuery.data ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <MetricPill label="Exact matches" value={String(comparisonQuery.data.exactItemMatches.length)} />
                      <MetricPill label="New entrants" value={String(comparisonQuery.data.newEntrants.length)} detail="baseline missing" />
                      <MetricPill label="Median delta" value={`${comparisonQuery.data.metricDeltas.medianPrice ?? "-"} THB`} />
                      <MetricPill label="Sold signal delta" value={formatNumber(comparisonQuery.data.metricDeltas.totalMonthlySold)} />
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">ต้องมี snapshot อย่างน้อย 2 ชุดเพื่อสร้าง monitor report.</p>
                  )}
                </DetailPanel>

                {selectedReport && (
                  <DetailPanel
                    title={selectedReport.title}
                    subtitle={`${selectedReport.reportType} · ${selectedReport.aspectRatio} · ${selectedReport.imageModel}`}
                    actions={(
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => createReportExport.mutate({
                            snapshotId: selectedReport.snapshotId,
                            reportType: selectedReport.reportType,
                            aspectRatio: selectedReport.aspectRatio,
                            imageModel: selectedReport.imageModel,
                            exportType: "image_prompt",
                          })}
                          disabled={createReportExport.isPending}
                        >
                          Save image prompt export
                        </Button>
                        <Link href={`/marketplace-capture/intelligence/snapshots/${encodeURIComponent(selectedReport.snapshotId)}`}>
                          <Button size="sm" variant="outline">Open source snapshot</Button>
                        </Link>
                      </>
                    )}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <SummaryList title="Executive summary" rows={selectedReport.executiveSummary} />
                      <SummaryList title="Recommendations" rows={selectedReport.recommendations} />
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {selectedReport.kpis.map((kpi) => (
                        <MetricPill key={kpi.label} label={kpi.label} value={kpi.value} detail={kpi.detail} />
                      ))}
                    </div>
                    <div className="mt-4 rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                      <div className="mb-2 font-medium text-white">Image prompt</div>
                      <pre className="whitespace-pre-wrap">{selectedReport.promptPayload.prompt}</pre>
                    </div>
                    <section className="mt-4 rounded-lg border border-sky-100 bg-sky-50 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-sky-950">Shareable image preview package</h3>
                          <p className="mt-1 text-sm text-sky-900">
                            Evidence-backed package พร้อมส่งต่อ image provider; default model คือ {selectedReport.imageModel}.
                          </p>
                        </div>
                        <div className="rounded-md bg-white px-3 py-2 text-sm font-medium text-sky-900">{selectedReport.aspectRatio}</div>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        <MetricPill label="Skill" value={selectedReport.promptPayload.skillKey} />
                        <MetricPill label="Source snapshot" value={selectedReport.snapshotId} />
                        <MetricPill label="Prompt hash ready" value="Export to persist" />
                      </div>
                    </section>
                    <section className="mt-4 rounded-lg border border-slate-200 p-3">
                      <h3 className="mb-3 text-sm font-medium">Report exports</h3>
                      <div className="space-y-2">
                        {(reportExportsQuery.data?.exports ?? []).length > 0 ? (reportExportsQuery.data?.exports ?? []).map((exportRecord) => (
                          <article key={exportRecord.id} className="border-t border-slate-100 pt-2 text-sm first:border-t-0 first:pt-0">
                            <div className="font-medium">{exportRecord.exportType} · {exportRecord.status}</div>
                            <div className="mt-1 break-all text-xs text-slate-500">prompt {exportRecord.promptHash}</div>
                          </article>
                        )) : <p className="text-sm text-slate-500">ยังไม่มี export record</p>}
                      </div>
                    </section>
                  </DetailPanel>
                )}

                <ListPanel title="Report image payloads" empty="ยังไม่มี report payload">
                  {reports.map((report) => (
                    <Link key={report.id} href={`/marketplace-capture/intelligence/reports/${encodeURIComponent(report.id)}`} className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                      <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-sky-600" /> {report.title}</div>
                      <p className="mt-1 text-sm text-slate-600">{report.executiveSummary[0]}</p>
                      <div className="mt-2 text-xs text-slate-500">{report.reportType} · {report.aspectRatio} · {report.imageModel}</div>
                    </Link>
                  ))}
                </ListPanel>
              </>
            )}

            {routeMode === "watchlists" && (
              <>
                {selectedWatchlist && (
                  <DetailPanel
                    title={`${selectedWatchlist.keyword} watchlist`}
                    subtitle={`${selectedWatchlist.region} · ${selectedWatchlist.cadence} · user-scoped`}
                    actions={(
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => recordWatchlistEvent.mutate({
                          watchlistId: selectedWatchlist.id,
                          eventType: "new_competitor",
                          summary: "Manual review marker from Marketplace Intelligence detail.",
                          latestSnapshotId: latestSnapshot?.id ?? null,
                          evidence: { source: "manual_ui_marker", snapshotId: latestSnapshot?.id ?? null },
                        })}
                        disabled={recordWatchlistEvent.isPending}
                      >
                        Add review marker
                      </Button>
                    )}
                  >
                    <div className="mb-4 grid gap-3 md:grid-cols-3">
                      <MetricPill label="Alerts" value={String(selectedWatchlist.alertRules.length)} detail={selectedWatchlist.alertRules.join(", ")} />
                      <MetricPill label="Created" value={new Date(selectedWatchlist.createdAt).toLocaleDateString()} />
                      <MetricPill label="Events" value={String((watchlistEventsQuery.data ?? []).length)} />
                    </div>
                    <section className="rounded-lg border border-slate-200 p-3">
                      <h3 className="mb-3 text-sm font-medium">Watchlist event timeline</h3>
                      <div className="space-y-3">
                        {(watchlistEventsQuery.data ?? []).length > 0 ? (watchlistEventsQuery.data ?? []).map((event) => (
                          <article key={String(event.id)} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                            <div className="flex flex-wrap items-center gap-2 font-medium">
                              <span>{String(event.eventType)}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{String(event.severity)}</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-600">{String(event.summary)}</p>
                            <div className="mt-1 text-xs text-slate-500">{String(event.createdAt)}</div>
                          </article>
                        )) : <p className="text-sm text-slate-500">ยังไม่มี event</p>}
                      </div>
                    </section>
                  </DetailPanel>
                )}

                <ListPanel title="Keyword watchlists" empty="ยังไม่มี watchlist">
                  {watchlists.map((watchlist) => (
                    <Link key={watchlist.id} href={`/marketplace-capture/intelligence/watchlists/${encodeURIComponent(watchlist.id)}`} className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                      <div className="font-medium">{watchlist.keyword}</div>
                      <div className="mt-1 text-sm text-slate-600">{watchlist.region} · {watchlist.cadence} · {watchlist.alertRules.join(", ")}</div>
                    </Link>
                  ))}
                </ListPanel>
              </>
            )}

            {routeMode === "fields" && (
              <ListPanel title="Useful fields discovered for analysis" empty="ยังไม่มี field dictionary">
                {(fieldsQuery.data?.fields ?? []).map((field: any) => (
                  <article key={field.path} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="font-medium">{field.label}</div>
                        <div className="mt-1 break-all text-xs text-slate-500">{field.path}</div>
                        <div className="mt-1 text-sm text-slate-600">{field.group} · {field.analysisValue}</div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{field.state ?? "dictionary"}</span>
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">{field.keep ?? "defer"}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-4">
                      <MetricPill label="Coverage" value={`${field.percent ?? 0}%`} detail={`${field.covered ?? 0}/${field.total ?? 0} observed`} />
                      <MetricPill label="Type" value={String(field.type ?? "unknown")} />
                      <MetricPill label="Sample" value={String(field.sample ?? "-")} />
                      <MetricPill label="Use" value={String(field.use ?? "-")} />
                    </div>
                  </article>
                ))}
              </ListPanel>
            )}

            {routeMode === "diagnostics" && (
              <DetailPanel
                title="Diagnostics and rollout safety"
                subtitle="Import health, schema drift, retention/redaction, rate-limit, and rollback/live-disabled state without exposing raw payloads."
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <MetricPill label="Import health" value={`${diagnosticsQuery.data?.snapshotCount ?? 0} snapshots`} detail={`${diagnosticsQuery.data?.fieldSampleCount ?? 0} field samples`} />
                  <MetricPill label="Schema drift" value={`${Object.keys(diagnosticsQuery.data?.fieldGroups ?? {}).length} field groups`} detail="Review unknown fields in Connector Lab" />
                  <MetricPill label="Reports" value={formatNumber(diagnosticsQuery.data?.reportCount)} detail={`${diagnosticsQuery.data?.watchlistCount ?? 0} watchlists`} />
                  <MetricPill label="Raw retention" value={`${diagnosticsQuery.data?.retention?.rawDiagnosticDays ?? "-"} raw days`} detail={diagnosticsQuery.data?.retention?.lastCleanupAt ? `Last cleanup ${diagnosticsQuery.data.retention.lastCleanupAt}` : "Cleanup not run"} />
                  <MetricPill label="Rate-limit metadata" value={`${diagnosticsQuery.data?.rateLimits?.activeBuckets?.length ?? 0} active buckets`} detail={`${diagnosticsQuery.data?.rateLimits?.windowSeconds ?? 3600}s window`} />
                  <MetricPill label="Audit events" value={formatNumber(diagnosticsQuery.data?.audit?.eventCount)} detail={diagnosticsQuery.data?.audit?.latestEvents?.[0]?.action ?? "No event yet"} />
                  <MetricPill label="Rollback/live status" value="Live disabled" detail="Fixture/read-only snapshot browsing remains available" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => runRetentionCleanup.mutate()}
                    disabled={runRetentionCleanup.isPending}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Run retention cleanup
                  </Button>
                  {runRetentionCleanup.data ? (
                    <span className="text-sm text-slate-600">
                      Redacted {runRetentionCleanup.data.rawFieldSamplesRedacted} field samples; preserved normalized snapshots.
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  Raw diagnostic payloads are hidden from this surface. Use retained hashes, shape summaries, and field coverage for troubleshooting.
                </div>
                <pre className="mt-4 overflow-auto rounded-lg border border-slate-200 bg-white p-4 text-xs shadow-sm">
                  {JSON.stringify(diagnosticsQuery.data ?? {}, null, 2)}
                </pre>
              </DetailPanel>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <Icon className="mb-3 h-5 w-5 text-sky-600" />
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function WorkflowCard({ title, description, href, action }: { title: string; description: string; href: string; action: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <Link href={href} className="mt-4 inline-flex rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50">
        {action}
      </Link>
    </section>
  );
}

function DetailPanel({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function MetricPill({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 break-words text-base font-semibold text-slate-950">{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}

function ShareList({ title, rows, labelKey }: { title: string; rows: Array<Record<string, unknown>>; labelKey: string }) {
  return (
    <section className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="space-y-2">
        {rows.slice(0, 5).map((row) => {
          const label = String(row[labelKey] ?? "Unknown");
          const share = typeof row.share === "number" ? Math.round(row.share * 100) : 0;
          return (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium">{label}</span>
                <span className="text-slate-500">{share}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(4, share)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SummaryList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <ul className="space-y-2 text-sm text-slate-600">
        {rows.map((row) => <li key={row}>{row}</li>)}
      </ul>
    </section>
  );
}

function ListPanel({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-medium">{title}</h2>
      <div className="space-y-3">{hasChildren ? children : <p className="text-sm text-slate-500">{empty}</p>}</div>
    </section>
  );
}
