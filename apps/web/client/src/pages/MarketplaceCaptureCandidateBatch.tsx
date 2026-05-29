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
  const text = raw.toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  const m = text.match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const value = Number(m[0]);
  if (/m|ล้าน/.test(text)) return Math.round(value * 1_000_000);
  if (/k|พัน/.test(text)) return Math.round(value * 1_000);
  if (/หมื่น/.test(text)) return Math.round(value * 10_000);
  return Math.round(value);
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
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">{batch.platform} | {batch.count} candidates | {new Date(batch.createdAt).toLocaleString()}</p>
            <h1 className="text-3xl font-semibold">Marketplace Candidate Batch</h1>
            <a className="mt-2 inline-block text-sm text-blue-700 underline" href={batch.sourceUrl} target="_blank" rel="noreferrer">
              {batch.sourceUrl}
            </a>
          </div>
          <a className="rounded-md border bg-white px-3 py-2 text-sm" href="/marketplace-capture">Back to captures</a>
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
              <div className="mt-4 flex gap-2">
                <a className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white" href={item.sourceUrl} target="_blank" rel="noreferrer">Open source</a>
                {itemAffiliateUrl(item) ? (
                  <button className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" type="button" onClick={() => navigator.clipboard?.writeText(itemAffiliateUrl(item))}>
                    Copy affiliate
                  </button>
                ) : null}
                <a className="rounded-md border bg-white px-3 py-2 text-sm" href={`/marketplace-capture?candidate=${encodeURIComponent(item.id)}`}>Keep for later</a>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
