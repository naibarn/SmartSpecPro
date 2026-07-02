import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

function getBatchId(pathname: string) {
  return pathname.match(/\/marketplace-capture\/candidates\/([^/]+)/)?.[1] ?? "";
}

function parseNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function parseSold(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/,/g, "");
  const compact = text.replace(/\s+/g, "");
  const withUnit = compact.match(/(\d+(?:\.\d+)?)(m|k|ล้าน|พัน|หมื่น)(?![a-z])/);
  const numeric = withUnit ?? compact.match(/(\d+(?:\.\d+)?)/);
  if (!numeric) return null;
  const value = Number(numeric[1]);
  const unit = withUnit?.[2] ?? "";
  if (unit === "m" || unit === "ล้าน") return Math.round(value * 1_000_000);
  if (unit === "k" || unit === "พัน") return Math.round(value * 1_000);
  if (unit === "หมื่น") return Math.round(value * 10_000);
  return Math.round(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function marketplaceSnapshotId(batch: any, items: any[]): string | null {
  const filters = asRecord(batch?.filtersJson);
  const fromFilters = stringValue(filters.snapshotId);
  if (fromFilters) return fromFilters;
  for (const item of items) {
    const raw = asRecord(item.rawJson);
    const platformRaw = asRecord(raw.platformRawJson);
    const fromItem = stringValue(platformRaw.marketplaceIntelligenceSnapshotId);
    if (fromItem) return fromItem;
  }
  return null;
}

export default function MarketplaceCaptureCandidateBatch() {
  const [location] = useLocation();
  const batchId = getBatchId(location);
  const query = trpc.marketplaceCapture.getCandidateBatch.useQuery({ batchId }, { enabled: Boolean(batchId) });
  const [keyword, setKeyword] = useState("");
  const [minScore, setMinScore] = useState("50");
  const [minSold, setMinSold] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [mallOnly, setMallOnly] = useState(false);

  const batch = query.data?.batch as any;
  const items = (query.data?.items as any[] | undefined) ?? [];
  const snapshotId = marketplaceSnapshotId(batch, items);
  const filters = asRecord(batch?.filtersJson);
  const sourceCapturedAt = stringValue(filters.capturedAt) ?? stringValue(asRecord(asRecord(items[0]?.rawJson).platformRawJson).sourceCapturedAt);
  const batchKeyword = stringValue(batch?.categoryName) ?? stringValue(filters.keyword) ?? "";
  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const score = Number(minScore) || 0;
    const sold = Number(minSold) || 0;
    const price = Number(maxPrice) || 0;
    return items
      .filter((item) => item.score >= score)
      .filter((item) => !q || String(item.title ?? "").toLowerCase().includes(q))
      .filter((item) => !sold || (parseSold(item.soldCountText) ?? 0) >= sold)
      .filter((item) => !price || (parseNumber(item.priceText) ?? Number.POSITIVE_INFINITY) <= price)
      .filter((item) => !mallOnly || (item.badgesJson ?? []).some((badge: string) => /mall|official/i.test(badge)))
      .sort((a, b) => b.score - a.score);
  }, [items, keyword, maxPrice, minScore, minSold, mallOnly]);
  const intelligenceSummary = useMemo(() => {
    const prices = items.map((item) => parseNumber(item.priceText)).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const soldSignals = items.map((item) => parseSold(item.soldCountText)).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const medianPrice = sortedPrices.length ? sortedPrices[Math.floor(sortedPrices.length / 2)] : null;
    const officialLikeCount = items.filter((item) => (item.badgesJson ?? []).some((badge: string) => /mall|official|verified/i.test(badge))).length;
    const sellers = new Map<string, number>();
    for (const item of items) {
      const raw = asRecord(item.rawJson);
      const sellerName = stringValue(asRecord(raw.platformRawJson).sellerName) ?? "Unknown seller";
      sellers.set(sellerName, (sellers.get(sellerName) ?? 0) + 1);
    }
    const topSeller = [...sellers.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    return {
      medianPrice,
      soldTotal: soldSignals.reduce((sum, value) => sum + value, 0),
      officialLikeCount,
      topSeller,
    };
  }, [items]);

  function exportBatch(format: "json" | "csv") {
    if (format === "json") {
      const blob = new Blob([JSON.stringify({ batch, items: filtered }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `marketplace-candidates-${batchId}.json`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    const headers = ["id", "platform", "title", "sourceUrl", "affiliateUrl", "priceText", "soldCountText", "discountText", "score"];
    const csv = [
      headers.join(","),
      ...filtered.map((row) => headers.map((header) => JSON.stringify(row[header] ?? "")).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `marketplace-candidates-${batchId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function itemAffiliateUrl(item: any) {
    return item.affiliateUrl ?? item.rawJson?.affiliateUrl ?? null;
  }

  if (query.isLoading) return <main className="p-8">Loading candidate batch...</main>;
  if (!batch) return <main className="p-8">Candidate batch not found</main>;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">{batch.platform} | {batch.count} candidates | {new Date(batch.createdAt).toLocaleString()}</p>
            <h1 className="text-3xl font-semibold">Marketplace Candidate Batch</h1>
            <a className="mt-2 inline-block text-sm text-blue-700 underline" href={batch.sourceUrl} target="_blank" rel="noreferrer">
              {batch.sourceUrl}
            </a>
          </div>
          <a className="w-full rounded-md border bg-white px-3 py-2 text-center text-sm sm:w-auto" href="/marketplace-capture">Back to captures</a>
        </header>

        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-5">
            <input className="rounded-md border px-3 py-2 text-sm" placeholder="Keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <input className="rounded-md border px-3 py-2 text-sm" placeholder="Min score" value={minScore} onChange={(e) => setMinScore(e.target.value)} />
            <input className="rounded-md border px-3 py-2 text-sm" placeholder="Min sold" value={minSold} onChange={(e) => setMinSold(e.target.value)} />
            <input className="rounded-md border px-3 py-2 text-sm" placeholder="Max price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={mallOnly} onChange={(e) => setMallOnly(e.target.checked)} />
              Mall / official
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-md border bg-white px-3 py-2 text-sm" onClick={() => exportBatch("csv")}>Export CSV</button>
            <button className="rounded-md border bg-white px-3 py-2 text-sm" onClick={() => exportBatch("json")}>Export JSON</button>
          </div>
        </section>

        <section aria-label="Marketplace Intelligence handoff" className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                Marketplace Intelligence
              </div>
              <h2 className="text-lg font-semibold">
                {snapshotId ? "Candidate batch created from keyword snapshot" : "Manual candidate batch"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                {snapshotId
                  ? "ชุด candidate นี้เก็บ provenance จาก keyword search snapshot เพื่อใช้ตรวจสอบ share of shelf, seller visibility, pricing band และต่อยอดเป็น report หรือ exact SKU monitor ได้"
                  : "ชุด candidate นี้ยังไม่ได้ผูกกับ keyword snapshot โดยตรง สามารถสร้าง snapshot จาก Marketplace Intelligence เพื่อเก็บ field coverage และ evidence สำหรับวิเคราะห์ต่อได้"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {snapshotId ? (
                <>
                  <a className="rounded-md border bg-white px-3 py-2 text-center text-sm" href={`/marketplace-capture/intelligence/snapshots/${encodeURIComponent(snapshotId)}`}>Open snapshot</a>
                  <a className="rounded-md border bg-white px-3 py-2 text-center text-sm" href="/marketplace-capture/intelligence/reports">Create report</a>
                  <a className="rounded-md border bg-white px-3 py-2 text-center text-sm" href={`/marketplace-capture/intelligence/discovery?keyword=${encodeURIComponent(batchKeyword)}`}>Discovery map</a>
                </>
              ) : (
                <a className="rounded-md border bg-white px-3 py-2 text-center text-sm" href="/marketplace-capture/intelligence/discovery">Open Discovery</a>
              )}
              <a className="rounded-md bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white" href="/marketplace-capture/intelligence/connector-lab">Connector Lab</a>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <InfoTile label="Snapshot" value={snapshotId ?? "-"} />
            <InfoTile label="Captured at" value={sourceCapturedAt ? new Date(sourceCapturedAt).toLocaleString() : "-"} />
            <InfoTile label="Median price" value={intelligenceSummary.medianPrice == null ? "-" : `${intelligenceSummary.medianPrice.toLocaleString()} THB`} />
            <InfoTile label="Sold signal" value={intelligenceSummary.soldTotal ? intelligenceSummary.soldTotal.toLocaleString() : "-"} />
            <InfoTile label="Official-like" value={`${intelligenceSummary.officialLikeCount}/${items.length}`} />
          </div>
          {intelligenceSummary.topSeller ? (
            <p className="mt-3 text-sm text-slate-600">
              Top seller visibility: <span className="font-medium text-slate-900">{intelligenceSummary.topSeller[0]}</span> ({intelligenceSummary.topSeller[1]} listings).
            </p>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <article key={item.id} className="rounded-lg border bg-white p-4 shadow-sm">
              {(() => {
                const affiliateUrl = itemAffiliateUrl(item);
                return affiliateUrl ? (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 p-2 text-xs">
                    <a className="max-w-full truncate text-emerald-700 underline" href={affiliateUrl} target="_blank" rel="noreferrer">
                      {affiliateUrl}
                    </a>
                    <button className="rounded border bg-white px-2 py-1 text-emerald-700" type="button" onClick={() => navigator.clipboard?.writeText(affiliateUrl)}>
                      Copy affiliate
                    </button>
                  </div>
                ) : null;
              })()}
              <div className="flex gap-3">
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-24 w-24 rounded-md object-contain" /> : <div className="h-24 w-24 rounded-md bg-slate-100" />}
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-3 font-medium">{item.title}</div>
                  <div className="mt-1 text-sm text-slate-500">{item.priceText ?? "-"} | {item.soldCountText ?? "-"}</div>
                  <div className="mt-1 inline-flex rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">score {item.score}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(item.badgesJson ?? []).map((badge: string) => <span key={badge} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{badge}</span>)}
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
                {(item.scoreReasonsJson ?? []).map((reason: string) => <li key={reason}>{reason}</li>)}
              </ul>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <a className="rounded-md bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white" href={item.sourceUrl} target="_blank" rel="noreferrer">Open source</a>
                {itemAffiliateUrl(item) ? (
                  <button className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" type="button" onClick={() => navigator.clipboard?.writeText(itemAffiliateUrl(item))}>
                    Copy affiliate
                  </button>
                ) : null}
                <a className="rounded-md border bg-white px-3 py-2 text-center text-sm" href={`/marketplace-capture?candidate=${encodeURIComponent(item.id)}`}>Keep for later</a>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-950" title={value}>{value}</div>
    </div>
  );
}
