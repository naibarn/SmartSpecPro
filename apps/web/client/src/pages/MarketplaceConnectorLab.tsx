import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  FileJson,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { trpc } from "@/lib/trpc";
import {
  createRecordedShopeeMcpProbe,
  type MarketplaceProbeResult,
} from "../../../shared/marketplaceMcpProbeFixture";

type ConnectorMode = "fixture" | "live";
type GrantStatus = "not_connected" | "pending" | "active" | "expired" | "revoked" | "scope_missing" | "provider_unavailable";

type GrantStatusResponse = {
  status: GrantStatus;
  scopes?: string[];
  expiresAt?: string | null;
  grantHashPrefix?: string | null;
  error?: {
    message?: string;
  };
};

type WriteBackPackageResponse = {
  ok?: boolean;
  endpointUrl?: string;
  writeBackToken?: string;
  expiresAt?: string;
  prompt?: string;
  headers?: Record<string, string>;
  error?: {
    message?: string;
  };
};

type FixtureItem = {
  rank: number;
  title: string;
  sellerName: string;
  brand: string;
  price: number;
  currency: string;
  soldCount: number;
  rating: number;
  reviewCount: number;
  officialStore: boolean;
  badges: string[];
  sourceUrl: string;
  raw: Record<string, unknown>;
};

type SearchFixture = {
  keyword: string;
  locale: string;
  region: string;
  connectorCapabilityVersion: string;
  capturedAt: string;
  items: FixtureItem[];
};

type FieldCoverageRow = {
  field: string;
  label: string;
  covered: number;
  total: number;
  percent: number;
};

const EXPECTED_FIELD_PATHS = [
  "title",
  "sellerName",
  "brand",
  "price",
  "currency",
  "soldCount",
  "rating",
  "reviewCount",
  "officialStore",
  "badges",
  "sourceUrl",
];

const SAMPLE_FIXTURE: SearchFixture = {
  keyword: "CGM",
  locale: "th-TH",
  region: "TH",
  connectorCapabilityVersion: "shopee-search.v0.fixture",
  capturedAt: "2026-07-01T09:00:00.000Z",
  items: [
    {
      rank: 1,
      title: "CGM Starter Kit Official Store",
      sellerName: "HealthPlus Official",
      brand: "HealthPlus",
      price: 1890,
      currency: "THB",
      soldCount: 5320,
      rating: 4.9,
      reviewCount: 1480,
      officialStore: true,
      badges: ["Mall", "Free shipping", "Voucher"],
      sourceUrl: "https://shopee.co.th/sample-cgm-starter-kit",
      raw: {
        itemid: "100001",
        shopid: "200001",
        campaign_label: "mid_year_health",
        service_level: "preferred_plus",
      },
    },
    {
      rank: 2,
      title: "CGM Sensor Pack 2 ชิ้น พร้อมส่ง",
      sellerName: "Care Supply TH",
      brand: "Care Supply",
      price: 1650,
      currency: "THB",
      soldCount: 3110,
      rating: 4.7,
      reviewCount: 820,
      officialStore: false,
      badges: ["Preferred", "Voucher"],
      sourceUrl: "https://shopee.co.th/sample-cgm-sensor-pack",
      raw: {
        itemid: "100002",
        shopid: "200002",
        flash_sale_stock: 38,
        fulfillment_hint: "same_day",
      },
    },
    {
      rank: 3,
      title: "ชุดตรวจน้ำตาลต่อเนื่อง CGM รุ่นประหยัด",
      sellerName: "Med Gadget Center",
      brand: "MGC",
      price: 1290,
      currency: "THB",
      soldCount: 940,
      rating: 4.4,
      reviewCount: 218,
      officialStore: false,
      badges: ["Lowest price"],
      sourceUrl: "https://shopee.co.th/sample-cgm-budget",
      raw: {
        itemid: "100003",
        shopid: "200003",
        estimated_delivery_days: 3,
      },
    },
  ],
};

function copyFor(language: string) {
  const th = language.startsWith("th");
  return {
    title: th ? "Marketplace Connector Lab" : "Marketplace Connector Lab",
    subtitle: th
      ? "ทดสอบ grant สำหรับ write-back และตรวจ field coverage จาก fixture หรือ payload ที่บันทึกกลับมา"
      : "Test write-back grants and inspect field coverage from fixtures or saved connector payloads.",
    connect: th ? "สถานะการเชื่อมต่อ" : "Connection status",
    connectCta: th ? "เปิดหน้าขอสิทธิ์" : "Open authorization",
    statusNotConnected: th ? "ยังไม่ได้เชื่อมต่อ" : "Not connected",
    statusPending: th ? "กำลังรอยืนยันสิทธิ์" : "Authorization pending",
    statusActive: th ? "Grant active" : "Grant active",
    statusExpired: th ? "สิทธิ์หมดอายุ" : "Grant expired",
    statusRevoked: th ? "ยกเลิกสิทธิ์แล้ว" : "Grant revoked",
    statusScopeMissing: th ? "สิทธิ์ไม่ครบ" : "Scope missing",
    statusUnavailable: th ? "ผู้ให้บริการไม่พร้อมใช้งาน" : "Provider unavailable",
    refreshStatus: th ? "Refresh status" : "Refresh status",
    scopes: th ? "Scopes" : "Scopes",
    expiresAt: th ? "หมดอายุ" : "Expires",
    grantHash: th ? "Grant hash" : "Grant hash",
    fixtureReady: th ? "Fixture replay พร้อมใช้" : "Fixture replay ready",
    sourceFixtureBadge: th ? "Fixture data, not live" : "Fixture data, not live",
    sourceRecordedMcpBadge: th ? "Recorded MCP sample" : "Recorded MCP sample",
    sourceTitle: th ? "แหล่งข้อมูลผลลัพธ์" : "Result data source",
    sourceFixtureNote: th
      ? "ตารางและ raw response ด้านล่างเป็นข้อมูล fixture สำหรับทดสอบ schema/field coverage ไม่ใช่ข้อมูลสดจาก Shopee"
      : "The table and raw response below are fixture data for schema and field coverage testing, not live Shopee data.",
    sourceLiveNote: th
      ? "ข้อมูลสดต้องถูกดึงโดย OpenAI-hosted Shopee app แล้ว write-back กลับมาเป็น snapshot ใน SmartSpecPro"
      : "Live data must be fetched by the OpenAI-hosted Shopee app and written back as a SmartSpecPro snapshot.",
    grantOnly: th
      ? "Grant active หมายถึงยืนยันสิทธิ์พร้อมใช้แล้ว แต่ยังไม่ได้รัน live data fetch ในหน้านี้"
      : "An active grant means permission is ready, but this page has not run a live data fetch.",
    mcpFieldDiscovery: th ? "MCP field discovery" : "MCP field discovery",
    capabilitySummary: th ? "Capability summary" : "Capability summary",
    coverage: th ? "Coverage" : "Coverage",
    field: th ? "Field" : "Field",
    type: th ? "Type" : "Type",
    sample: th ? "Sample" : "Sample",
    use: th ? "Use" : "Use",
    keep: th ? "Storage" : "Storage",
    probeMeta: th ? "Probe evidence" : "Probe evidence",
    capturedAt: th ? "Captured at" : "Captured at",
    sourceCapturedAt: th ? "Source captured at" : "Source captured at",
    latency: th ? "Latency" : "Latency",
    mode: th ? "โหมดทดสอบ" : "Run mode",
    fixture: th ? "Fixture replay" : "Fixture replay",
    live: th ? "Write-back live" : "Write-back live",
    keyword: th ? "Keyword" : "Keyword",
    region: th ? "ภูมิภาค" : "Region",
    locale: th ? "ภาษา" : "Locale",
    limit: th ? "จำนวนผลลัพธ์" : "Result limit",
    run: th ? "Run fixture / show write-back note" : "Run fixture / show write-back note",
    saveFixture: th ? "Save fixture" : "Save fixture",
    createSnapshot: th ? "Create snapshot" : "Create snapshot",
    saveWriteback: th ? "Save write-back payload" : "Save write-back payload",
    generateWritebackPackage: th ? "Generate write-back package" : "Generate write-back package",
    copyWritebackPrompt: th ? "Copy write-back prompt" : "Copy write-back prompt",
    writebackPackageReady: th ? "สร้าง write-back package แล้ว" : "Write-back package generated",
    writebackEndpoint: th ? "Write-back endpoint" : "Write-back endpoint",
    writebackTokenExpires: th ? "Token expires" : "Token expires",
    writebackPayload: th ? "Write-back payload JSON" : "Write-back payload JSON",
    writebackPayloadHelp: th
      ? "กดสร้าง package แล้วนำ prompt/token ไปใช้กับ OpenAI-hosted Shopee app เพื่อให้ write-back ผลค้นหาจริงกลับมา หรือวาง JSON ที่ได้แล้วกดบันทึกเพื่อสร้าง snapshot จริงใน SmartSpecPro"
      : "Generate the package and use its prompt/token with the OpenAI-hosted Shopee app, or paste returned JSON and save it as a real SmartSpecPro snapshot.",
    writebackSaved: th ? "บันทึก write-back snapshot แล้ว" : "Write-back snapshot saved",
    normalized: th ? "Normalized preview" : "Normalized preview",
    diagnostics: th ? "Diagnostics" : "Diagnostics",
    raw: th ? "Raw response" : "Raw response",
    fieldCoverage: th ? "Field coverage" : "Field coverage",
    unknownFields: th ? "Unknown fields" : "Unknown fields",
    shapeHash: th ? "Payload shape hash" : "Payload shape hash",
    saved: th ? "บันทึก fixture แล้ว" : "Fixture saved",
    snapshotCreated: th ? "สร้าง snapshot draft แล้ว" : "Snapshot draft created",
    liveBlocked: th
      ? "Live connector ต้องใช้ grant ที่ active ก่อน ตอนนี้ใช้ fixture replay เพื่อทดสอบ UI และ schema ได้"
      : "Live connector requires an active grant. Fixture replay remains available for UI and schema testing.",
    liveNotImplemented: th
      ? "Grant active แล้ว ข้อมูลสดต้องมาจาก OpenAI-hosted Shopee app แล้ว write-back ผ่าน SmartSpecPro MCP/API"
      : "Grant is active. Live data must come from the OpenAI-hosted Shopee app and write back through SmartSpecPro MCP/API.",
    executor: th ? "Write-back readiness" : "Write-back readiness",
    executorReady: th ? "พร้อมทดสอบ" : "Ready to test",
    executorNeedsGrant: th ? "ต้อง authorize ก่อน" : "Authorize first",
    openUserSettings: th ? "เปิด User settings" : "Open user settings",
    ownerOnly: th ? "Raw payload แสดงแบบ redacted สำหรับเจ้าของ/admin เท่านั้น" : "Raw payload is redacted and owner/admin only.",
    disabledTitle: th ? "Connector Lab ยังไม่เปิดใช้งาน" : "Connector Lab is not enabled",
    disabledBody: th
      ? "เปิด marketplaceConnectorLabEnabled ใน Tenant Feature Flags เพื่อทดสอบหน้านี้"
      : "Enable marketplaceConnectorLabEnabled in Tenant Feature Flags to test this surface.",
  };
}

function createWritebackExample(keyword: string, region: string, locale: string) {
  return JSON.stringify({
    platform: "shopee",
    sourceProvider: "openai_hosted_shopee_mcp",
    keyword,
    region,
    locale,
    sourceMetadata: {
      executionHost: "openai_chatgpt",
      upstreamAppId: "asdk_app_697080d6e3f08191925a46ec4917e27f",
      upstreamToolName: "shopee.search",
      sourceFreshness: "current_user_requested_search",
    },
    items: [
      {
        rank: 1,
        title: "ตัวอย่างสินค้าจาก Shopee app",
        itemid: 123456789,
        shopid: 987654321,
        shopName: "Example Shop",
        brandName: "Example Brand",
        price: 990,
        monthlySoldCount: 120,
        historicalSoldCount: 1200,
        ratingScore: 4.8,
        reviewCount: 321,
        shopeeVerified: true,
      },
    ],
  }, null, 2);
}

function getLanguage() {
  if (typeof navigator === "undefined") return "en";
  return navigator.language || "en";
}

function valueShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    const first = value.length > 0 ? valueShape(value[0]) : "empty[]";
    return [first];
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, valueShape(nested)]),
    );
  }
  if (value === null) return "null";
  return typeof value;
}

export function createPayloadShapeHash(payload: unknown): string {
  const shape = JSON.stringify(valueShape(payload));
  let hash = 2166136261;
  for (let index = 0; index < shape.length; index += 1) {
    hash ^= shape.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `psh_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function collectFieldPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectFieldPaths(item, prefix));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return [path, ...collectFieldPaths(nested, path)];
    }
    if (Array.isArray(nested)) {
      return [path, ...nested.flatMap((item) => collectFieldPaths(item, path))];
    }
    return [path];
  });
}

export function buildFieldCoverage(items: FixtureItem[]): FieldCoverageRow[] {
  return EXPECTED_FIELD_PATHS.map((field) => {
    const covered = items.filter((item) => {
      const value = item[field as keyof FixtureItem];
      return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "";
    }).length;
    return {
      field,
      label: field.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()),
      covered,
      total: items.length,
      percent: items.length ? Math.round((covered / items.length) * 100) : 0,
    };
  });
}

export function detectUnknownFieldPaths(fixture: SearchFixture): string[] {
  const normalized = new Set(EXPECTED_FIELD_PATHS);
  const paths = new Set<string>();
  fixture.items.forEach((item) => {
    collectFieldPaths(item.raw, "raw").forEach((path) => paths.add(path));
    collectFieldPaths(item).forEach((path) => {
      if (!normalized.has(path) && !path.startsWith("raw")) paths.add(path);
    });
  });
  return Array.from(paths).sort();
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function connectionStatusCopy(status: GrantStatus, copy: ReturnType<typeof copyFor>) {
  if (status === "pending") return copy.statusPending;
  if (status === "active") return copy.statusActive;
  if (status === "expired") return copy.statusExpired;
  if (status === "revoked") return copy.statusRevoked;
  if (status === "scope_missing") return copy.statusScopeMissing;
  if (status === "provider_unavailable") return copy.statusUnavailable;
  return copy.statusNotConnected;
}

function statusVariant(status: GrantStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "not_connected") return "secondary";
  if (status === "expired" || status === "revoked") return "destructive";
  return "outline";
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json().catch(() => ({})) as T;
}

export default function MarketplaceConnectorLab() {
  const copy = copyFor(getLanguage());
  const connectorLabEnabled = useTenantFeatureFlag("marketplaceConnectorLabEnabled");
  const [mode, setMode] = useState<ConnectorMode>("live");
  const [grantStatus, setGrantStatus] = useState<GrantStatus>("not_connected");
  const [grantScopes, setGrantScopes] = useState<string[]>([]);
  const [grantExpiresAt, setGrantExpiresAt] = useState<string | null>(null);
  const [grantHashPrefix, setGrantHashPrefix] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [keyword, setKeyword] = useState(SAMPLE_FIXTURE.keyword);
  const [region, setRegion] = useState(SAMPLE_FIXTURE.region);
  const [locale, setLocale] = useState(SAMPLE_FIXTURE.locale);
  const [limit, setLimit] = useState("10");
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [fixtureSaved, setFixtureSaved] = useState(false);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<MarketplaceProbeResult>(() => createRecordedShopeeMcpProbe({ limit: 4 }));
  const [writebackPayloadText, setWritebackPayloadText] = useState(() => createWritebackExample(SAMPLE_FIXTURE.keyword, SAMPLE_FIXTURE.region, SAMPLE_FIXTURE.locale));
  const [isSavingWriteback, setIsSavingWriteback] = useState(false);
  const [writeBackPackage, setWriteBackPackage] = useState<WriteBackPackageResponse | null>(null);
  const [isGeneratingWriteBackPackage, setIsGeneratingWriteBackPackage] = useState(false);
  const saveFieldSample = trpc.marketplaceIntelligence.saveFieldSample.useMutation({
    onSuccess: (data) => {
      setFixtureSaved(true);
      toast.success(`${copy.saved}: ${data.fieldSample.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const createSnapshotMutation = trpc.marketplaceIntelligence.createSnapshotFromProbe.useMutation({
    onSuccess: (data) => {
      setSnapshotId(data.snapshot.id);
      toast.success(`${copy.snapshotCreated}: ${data.snapshot.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const showingWritebackMode = mode === "live";
  const resultSourceIsLive = probeResult.source === "live_mcp" || probeResult.source === "openai_hosted_shopee_mcp";
  const sourceBadge = showingWritebackMode ? copy.live : resultSourceIsLive ? copy.live : copy.sourceRecordedMcpBadge;
  const sourceNote = showingWritebackMode ? copy.sourceLiveNote : resultSourceIsLive ? copy.sourceLiveNote : copy.sourceFixtureNote;
  const legacyFixture = useMemo<SearchFixture>(() => ({
    ...SAMPLE_FIXTURE,
    keyword,
    region,
    locale,
    items: probeResult.items.map((item) => ({
      rank: item.rank,
      title: item.title,
      sellerName: item.sellerName,
      brand: item.brand ?? "",
      price: item.price,
      currency: "THB",
      soldCount: item.monthlySoldCount ?? item.historicalSoldCount ?? 0,
      rating: item.rating ?? 0,
      reviewCount: item.reviewCount ?? 0,
      officialStore: item.shopeeVerified,
      badges: item.shopeeVerified ? ["Verified"] : [],
      sourceUrl: `https://shopee.co.th/product/${item.shopId}/${item.itemId}`,
      raw: item.raw,
    })),
  }), [keyword, locale, probeResult.items, region]);

  const coverage = useMemo(() => buildFieldCoverage(legacyFixture.items), [legacyFixture.items]);
  const unknownFields = useMemo(() => detectUnknownFieldPaths(legacyFixture), [legacyFixture]);
  const shapeHash = useMemo(() => createPayloadShapeHash(probeResult), [probeResult]);
  const rawPreview = useMemo(() => JSON.stringify({
    ...probeResult,
    redaction: {
      rawPayloadVisible: false,
      note: copy.ownerOnly,
    },
  }, null, 2), [copy.ownerOnly, probeResult]);

  const canRunLive = grantStatus === "active";
  const liveBlocked = mode === "live" && !canRunLive;
  const liveBlockedCopy = grantStatus !== "active"
    ? copy.liveBlocked
    : copy.liveNotImplemented;

  async function refreshGrantStatus() {
    setIsLoadingStatus(true);
    try {
      const response = await fetch("/api/marketplace-connectors/shopee/status");
      const payload = await readJson<GrantStatusResponse>(response);
      if (!response.ok) throw new Error(payload.error?.message || "Could not load connector status");
      setGrantStatus(payload.status);
      setGrantScopes(Array.isArray(payload.scopes) ? payload.scopes : []);
      setGrantExpiresAt(payload.expiresAt ?? null);
      setGrantHashPrefix(payload.grantHashPrefix ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load connector status");
    } finally {
      setIsLoadingStatus(false);
    }
  }

  useEffect(() => {
    if (connectorLabEnabled) void refreshGrantStatus();
  }, [connectorLabEnabled]);

  if (!connectorLabEnabled) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl rounded-lg border bg-white p-6 shadow-sm">
          <Badge variant="secondary">marketplaceConnectorLabEnabled</Badge>
          <h1 className="mt-4 text-2xl font-semibold tracking-normal">{copy.disabledTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{copy.disabledBody}</p>
        </section>
      </main>
    );
  }

  async function runSearch() {
    if (liveBlocked) {
      toast.error(liveBlockedCopy);
      return;
    }
    if (mode === "live") {
      toast.info("Use the OpenAI-hosted Shopee app to fetch live results, then write them back to SmartSpecPro MCP/API. Connector Lab no longer calls Shopee directly.");
      return;
    }
    setIsRunning(true);
    try {
      const response = await fetch("/api/marketplace-connectors/shopee/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          keyword,
          region,
          locale,
          limit,
          sourceMode: mode === "fixture" ? "recorded_sample" : "live",
        }),
      });
      const payload = await readJson<MarketplaceProbeResult & { error?: { message?: string } }>(response);
      if (!response.ok) throw new Error(payload.error?.message || "Could not run connector probe");
      setProbeResult(payload);
      setHasRun(true);
      toast.success(mode === "fixture" ? copy.fixtureReady : copy.statusActive);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run connector probe");
    } finally {
      setIsRunning(false);
    }
  }

  async function saveWritebackPayload() {
    setIsSavingWriteback(true);
    try {
      const payload = JSON.parse(writebackPayloadText);
      const response = await fetch("/api/marketplace-connectors/shopee/writeback/search-snapshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJson<{ snapshotId?: string; snapshot?: { id?: string }; error?: { message?: string } }>(response);
      if (!response.ok) throw new Error(result.error?.message || "Could not save write-back payload");
      const nextSnapshotId = result.snapshotId ?? result.snapshot?.id ?? null;
      setSnapshotId(nextSnapshotId);
      toast.success(nextSnapshotId ? `${copy.writebackSaved}: ${nextSnapshotId}` : copy.writebackSaved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid write-back payload JSON");
    } finally {
      setIsSavingWriteback(false);
    }
  }

  async function generateWriteBackPackage() {
    setIsGeneratingWriteBackPackage(true);
    try {
      const response = await fetch("/api/marketplace-connectors/shopee/writeback/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword, region, locale }),
      });
      const payload = await readJson<WriteBackPackageResponse>(response);
      if (!response.ok) throw new Error(payload.error?.message || "Could not generate write-back package");
      setWriteBackPackage(payload);
      toast.success(copy.writebackPackageReady);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate write-back package");
    } finally {
      setIsGeneratingWriteBackPackage(false);
    }
  }

  async function copyWriteBackPrompt() {
    const text = writeBackPackage?.prompt || "";
    if (!text) return;
    await navigator.clipboard?.writeText(text);
    toast.success(copy.copyWritebackPrompt);
  }

  function saveFixture() {
    saveFieldSample.mutate({
      keyword,
      region,
      locale,
      limit: Math.max(1, Math.min(25, Number(limit) || 10)),
      sourceMode: mode === "fixture" ? "recorded_sample" : "live",
    });
  }

  function createSnapshot() {
    createSnapshotMutation.mutate({
      keyword,
      region,
      locale,
      limit: Math.max(1, Math.min(25, Number(limit) || 10)),
      sourceMode: mode === "fixture" ? "recorded_sample" : "live",
    });
  }

  async function copyHash() {
    await navigator.clipboard?.writeText(shapeHash);
    toast.success(shapeHash);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 rounded-lg border bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
          <section className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Shopee</Badge>
              <Badge variant={resultSourceIsLive ? "default" : "secondary"}>{sourceBadge}</Badge>
              {fixtureSaved ? <Badge variant="default">{copy.saved}</Badge> : null}
              {snapshotId ? <Badge variant="default">{snapshotId}</Badge> : null}
            </div>
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">{copy.title}</h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">{copy.subtitle}</p>
          </section>
          <nav className="flex flex-wrap gap-2" aria-label="Marketplace intelligence navigation">
            <Button asChild variant="outline">
              <Link href="/marketplace-capture/intelligence/connect/shopee">
                <KeyRound className="mr-2 h-4 w-4" />
                {copy.connectCta}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/marketplace-capture">
                <ExternalLink className="mr-2 h-4 w-4" />
                Marketplace Capture
              </Link>
            </Button>
          </nav>
        </header>

        <section className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4" />
                  {copy.connect}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">Shopee</span>
                  <Badge variant={statusVariant(grantStatus)}>{connectionStatusCopy(grantStatus, copy)}</Badge>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={refreshGrantStatus} disabled={isLoadingStatus}>
                  {isLoadingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {copy.refreshStatus}
                </Button>
                <dl className="grid gap-2 rounded-md border bg-white p-3 text-xs text-slate-600">
                  <div>
                    <dt className="font-medium text-slate-900">{copy.scopes}</dt>
                    <dd className="mt-1">{grantScopes.length ? grantScopes.join(", ") : "-"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-900">{copy.expiresAt}</dt>
                    <dd className="mt-1">{grantExpiresAt ? new Date(grantExpiresAt).toLocaleString() : "-"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-900">{copy.grantHash}</dt>
                    <dd className="mt-1 font-mono">{grantHashPrefix ?? "-"}</dd>
                  </div>
                </dl>
                <dl className="grid gap-2 rounded-md border bg-white p-3 text-xs text-slate-600">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="font-medium text-slate-900">{copy.executor}</dt>
                    <dd>
                      <Badge variant={canRunLive ? "default" : "secondary"}>
                        {canRunLive ? copy.executorReady : copy.executorNeedsGrant}
                      </Badge>
                    </dd>
                  </div>
                </dl>
                {!canRunLive ? (
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/settings">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {copy.openUserSettings}
                    </Link>
                  </Button>
                ) : null}
                <p className="rounded-md bg-slate-100 p-3 text-xs leading-5 text-slate-600">
                  {resultSourceIsLive ? copy.sourceLiveNote : liveBlockedCopy}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Search className="h-4 w-4" />
                  Search test
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <fieldset className="grid grid-cols-2 gap-2" aria-label={copy.mode}>
                  <Button
                    type="button"
                    variant={mode === "fixture" ? "default" : "outline"}
                    onClick={() => setMode("fixture")}
                  >
                    <FileJson className="mr-2 h-4 w-4" />
                    {copy.fixture}
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "live" ? "default" : "outline"}
                    onClick={() => setMode("live")}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {copy.live}
                  </Button>
                </fieldset>
                {liveBlocked ? (
                  <p role="alert" className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {liveBlockedCopy}
                  </p>
                ) : null}
                <section className="space-y-2">
                  <Label htmlFor="marketplace-intelligence-keyword">{copy.keyword}</Label>
                  <Input
                    id="marketplace-intelligence-keyword"
                    value={keyword}
                    onChange={(event) => {
                      setKeyword(event.target.value);
                      if (mode === "live") setWritebackPayloadText(createWritebackExample(event.target.value, region, locale));
                    }}
                  />
                </section>
                <section className="grid grid-cols-2 gap-2">
                  <section className="space-y-2">
                    <Label htmlFor="marketplace-intelligence-region">{copy.region}</Label>
                    <Input id="marketplace-intelligence-region" value={region} onChange={(event) => {
                      setRegion(event.target.value);
                      if (mode === "live") setWritebackPayloadText(createWritebackExample(keyword, event.target.value, locale));
                    }} />
                  </section>
                  <section className="space-y-2">
                    <Label htmlFor="marketplace-intelligence-locale">{copy.locale}</Label>
                    <Input id="marketplace-intelligence-locale" value={locale} onChange={(event) => {
                      setLocale(event.target.value);
                      if (mode === "live") setWritebackPayloadText(createWritebackExample(keyword, region, event.target.value));
                    }} />
                  </section>
                </section>
                <section className="space-y-2">
                  <Label htmlFor="marketplace-intelligence-limit">{copy.limit}</Label>
                  <Select value={limit} onValueChange={setLimit}>
                    <SelectTrigger id="marketplace-intelligence-limit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                    </SelectContent>
                  </Select>
                </section>
                <Button type="button" className="w-full" onClick={runSearch} disabled={isRunning}>
                  {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  {copy.run}
                </Button>
              </CardContent>
            </Card>
          </aside>

          <section className="flex min-w-0 flex-col gap-4">
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{copy.sourceTitle}</Badge>
                <Badge variant={resultSourceIsLive ? "default" : "secondary"}>{sourceBadge}</Badge>
              </div>
              <p className="mt-2">{sourceNote}</p>
            </section>
            {showingWritebackMode ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Database className="h-4 w-4" />
                    {copy.writebackPayload}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="rounded-md bg-slate-100 p-3 text-sm leading-6 text-slate-700">{copy.writebackPayloadHelp}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={generateWriteBackPackage} disabled={isGeneratingWriteBackPackage || !canRunLive}>
                      {isGeneratingWriteBackPackage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                      {copy.generateWritebackPackage}
                    </Button>
                    <Button type="button" variant="outline" onClick={copyWriteBackPrompt} disabled={!writeBackPackage?.prompt}>
                      <Copy className="mr-2 h-4 w-4" />
                      {copy.copyWritebackPrompt}
                    </Button>
                  </div>
                  {writeBackPackage?.endpointUrl ? (
                    <section className="grid gap-2 rounded-md border bg-white p-3 text-xs text-slate-600">
                      <div>
                        <p className="font-medium text-slate-900">{copy.writebackEndpoint}</p>
                        <p className="mt-1 break-all font-mono">{writeBackPackage.endpointUrl}</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{copy.writebackTokenExpires}</p>
                        <p className="mt-1">{writeBackPackage.expiresAt ? new Date(writeBackPackage.expiresAt).toLocaleString() : "-"}</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Authorization</p>
                        <p className="mt-1 break-all font-mono">Bearer {writeBackPackage.writeBackToken}</p>
                      </div>
                    </section>
                  ) : null}
                  <Textarea
                    value={writebackPayloadText}
                    onChange={(event) => setWritebackPayloadText(event.target.value)}
                    aria-label={copy.writebackPayload}
                    className="min-h-[420px] font-mono text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={saveWritebackPayload} disabled={isSavingWriteback || !canRunLive}>
                      {isSavingWriteback ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                      {copy.saveWriteback}
                    </Button>
                    {snapshotId ? (
                      <Button asChild type="button" variant="outline">
                        <Link href={`/marketplace-capture/intelligence/snapshots/${encodeURIComponent(snapshotId)}`}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {snapshotId}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
            <section className="grid gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="space-y-1 p-4">
                  <p className="text-xs text-slate-500">{copy.shapeHash}</p>
                  <button type="button" onClick={copyHash} className="inline-flex max-w-full items-center gap-2 text-left font-mono text-sm text-slate-900">
                    <Copy className="h-4 w-4 shrink-0" />
                    <span className="truncate">{shapeHash}</span>
                  </button>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-1 p-4">
                  <p className="text-xs text-slate-500">{copy.fieldCoverage}</p>
                  <p className="text-2xl font-semibold">{Math.round(probeResult.fieldCoverage.reduce((sum, row) => sum + row.percent, 0) / probeResult.fieldCoverage.length)}%</p>
              </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-1 p-4">
                  <p className="text-xs text-slate-500">MCP fields</p>
                  <p className="text-2xl font-semibold">{probeResult.fieldCoverage.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-1 p-4">
                  <p className="text-xs text-slate-500">{copy.latency}</p>
                  <p className="text-2xl font-semibold">{probeResult.latencyMs}ms</p>
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{copy.mcpFieldDiscovery}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-xs sm:grid-cols-2">
                {probeResult.fieldCoverage.slice(0, 8).map((row) => (
                  <section key={row.path} className="rounded-md bg-slate-100 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono">{row.path}</span>
                      <span className="shrink-0 text-slate-500">{row.percent}%</span>
                    </div>
                    <p className="mt-1 text-slate-600">{row.analysisValue}</p>
                  </section>
                ))}
              </CardContent>
            </Card>

            <Tabs defaultValue="preview" className="min-w-0">
              <section className="flex flex-col gap-3 rounded-lg border bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <TabsList className="grid w-full grid-cols-3 sm:w-auto">
                  <TabsTrigger value="preview">{copy.normalized}</TabsTrigger>
                  <TabsTrigger value="diagnostics">{copy.diagnostics}</TabsTrigger>
                  <TabsTrigger value="raw">{copy.raw}</TabsTrigger>
                </TabsList>
                <section className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={saveFixture} disabled={saveFieldSample.isPending || !hasRun}>
                    {saveFieldSample.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {copy.saveFixture}
                  </Button>
                  <Button type="button" onClick={createSnapshot} disabled={!hasRun || createSnapshotMutation.isPending}>
                    {createSnapshotMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                    {copy.createSnapshot}
                  </Button>
                </section>
              </section>

              <TabsContent value="preview" className="mt-4">
                <Card>
                  <CardContent className="overflow-x-auto p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Seller</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Sold</TableHead>
                          <TableHead className="text-right">Rating</TableHead>
                          <TableHead>Signals</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {legacyFixture.items.map((item) => (
                          <TableRow key={item.sourceUrl}>
                            <TableCell className="font-medium">#{item.rank}</TableCell>
                            <TableCell className="min-w-[220px]">
                              <p className="font-medium">{item.title}</p>
                              <a href={item.sourceUrl} className="text-xs text-blue-700 underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                                {item.sourceUrl}
                              </a>
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-2">
                                <Store className="h-4 w-4 text-slate-500" />
                                {item.sellerName}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{formatNumber(item.price)} {item.currency}</TableCell>
                            <TableCell className="text-right">{formatNumber(item.soldCount)}</TableCell>
                            <TableCell className="text-right">{item.rating.toFixed(1)} ({formatNumber(item.reviewCount)})</TableCell>
                            <TableCell>
                              <section className="flex flex-wrap gap-1">
                                {item.officialStore ? <Badge variant="default">Official</Badge> : null}
                                {item.badges.map((badge) => <Badge key={badge} variant="secondary">{badge}</Badge>)}
                              </section>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="diagnostics" className="mt-4">
                <section className="grid gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{copy.probeMeta}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
                      <section>
                        <p className="text-xs text-slate-500">Source</p>
                        <p className="font-medium">{probeResult.source}</p>
                      </section>
                      <section>
                        <p className="text-xs text-slate-500">{copy.capturedAt}</p>
                        <p className="font-medium">{new Date(probeResult.capturedAt).toLocaleString()}</p>
                      </section>
                      <section>
                        <p className="text-xs text-slate-500">{copy.sourceCapturedAt}</p>
                        <p className="font-medium">{new Date(probeResult.sourceCapturedAt).toLocaleString()}</p>
                      </section>
                      <section>
                        <p className="text-xs text-slate-500">Items</p>
                        <p className="font-medium">{probeResult.itemCount}</p>
                      </section>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{copy.capabilitySummary}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-3">
                      {Object.entries(probeResult.capabilitySummary).map(([key, value]) => (
                        <section key={key} className="space-y-1 rounded-md bg-slate-100 p-3">
                          <section className="flex items-center justify-between gap-3 text-sm">
                            <span className="capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                            <span className="text-slate-500">{value}%</span>
                          </section>
                          <section aria-hidden className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <section className="h-full rounded-full bg-slate-900" style={{ width: `${value}%` }} />
                          </section>
                        </section>
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{copy.mcpFieldDiscovery}</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{copy.field}</TableHead>
                            <TableHead>{copy.coverage}</TableHead>
                            <TableHead>{copy.type}</TableHead>
                            <TableHead>{copy.sample}</TableHead>
                            <TableHead>{copy.use}</TableHead>
                            <TableHead>{copy.keep}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {probeResult.fieldCoverage.map((row) => (
                            <TableRow key={row.path}>
                              <TableCell className="min-w-[260px] font-mono text-xs">{row.path}</TableCell>
                              <TableCell>{row.covered}/{row.total} - {row.percent}%</TableCell>
                              <TableCell>{row.type}</TableCell>
                              <TableCell className="max-w-[160px] truncate">{String(row.sample ?? "-")}</TableCell>
                              <TableCell className="min-w-[240px]">{row.analysisValue}</TableCell>
                              <TableCell>{row.keep}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </section>
              </TabsContent>

              <TabsContent value="raw" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileJson className="h-4 w-4" />
                      {copy.raw}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="rounded-md bg-slate-100 p-3 text-xs leading-5 text-slate-600">{copy.ownerOnly}</p>
                    <Textarea value={rawPreview} readOnly aria-label="Redacted raw response" className="min-h-[360px] font-mono text-xs" />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
              </>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}
