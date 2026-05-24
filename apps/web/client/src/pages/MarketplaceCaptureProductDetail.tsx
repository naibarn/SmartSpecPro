import { useLocation } from "wouter";
import { MarketplaceInsightsSection } from "@/components/marketplace/MarketplaceInsightsSection";
import { trpc } from "@/lib/trpc";

function getProductId(pathname: string) {
  return pathname.match(/\/marketplace-capture\/products\/([^/]+)/)?.[1] ?? "";
}

function parseCompactCount(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (!raw) return null;
  const text = String(raw).toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return null;
  if (/m\+?/.test(text) || /ล้าน/.test(text)) return Math.round(value * 1_000_000);
  if (/k\+?/.test(text) || /พัน/.test(text)) return Math.round(value * 1_000);
  if (/หมื่น/.test(text)) return Math.round(value * 10_000);
  return Math.round(value);
}

function formatCount(value: string | number | null | undefined, fallbackText?: string | number | null): string {
  const normalized = parseCompactCount(value) ?? parseCompactCount(fallbackText);
  if (normalized != null) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(normalized);
  }
  return value == null || value === "" ? "-" : String(value);
}

export default function MarketplaceCaptureProductDetail() {
  const [location] = useLocation();
  const productId = getProductId(location);
  const product = trpc.marketplaceCapture.getProduct.useQuery({ productId }, { enabled: Boolean(productId) });
  const productData = product.data as any;
  const productItem = productData?.product ?? productData;
  const captureId = productItem?.captureId ? String(productItem.captureId) : "";
  const productInsights = trpc.marketplaceCapture.listInsightsByProduct.useQuery({ productId }, { enabled: Boolean(productId) });
  const captureInsights = trpc.marketplaceCapture.listInsightsByCapture.useQuery({ captureId }, { enabled: Boolean(captureId) });

  if (product.isLoading) return <main className="p-8">Loading product...</main>;
  if (!product.data) return <main className="p-8">Product not found</main>;

  const data = productData;
  const item = data.product ?? data;
  const images = data.images ?? [];
  const history = data.history ?? [];
  const health = data.health;
  const insights = [...((productInsights.data as any[] | undefined) ?? []), ...((captureInsights.data as any[] | undefined) ?? [])];
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-lg border bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">{item.platform}</p>
          <h1 className="mt-1 text-3xl font-semibold">{item.productName}</h1>
          <a className="mt-2 inline-block text-sm text-blue-700 underline" href={item.sourceUrl} target="_blank" rel="noreferrer">
            Source marketplace page
          </a>
          <div className="mt-4 rounded-md border bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-1 text-xs font-medium ${
              health?.status === "critical" ? "bg-red-100 text-red-700" :
              health?.status === "warning" ? "bg-amber-100 text-amber-700" :
              "bg-emerald-100 text-emerald-700"
            }`}>Health: {health?.status ?? "ok"}</span>
            <span className="text-sm text-slate-500">Access: {item.accessType ?? "owner"}</span>
            <span className="text-sm text-slate-500">Snapshots: {health?.snapshotCount ?? history.length}</span>
            <span className="text-sm text-slate-500">Last checked: {health?.lastCheckedAt ? new Date(health.lastCheckedAt).toLocaleString() : "-"}</span>
          </div>
          {health?.warnings?.length ? (
            <ul className="mt-2 space-y-1 text-sm text-amber-700">
              {health.warnings.map((warning: any) => <li key={warning.code}>{warning.message}</li>)}
            </ul>
          ) : null}
          </div>
          <dl className="mt-6 grid gap-4 md:grid-cols-2">
            <div><dt className="text-sm font-medium text-slate-500">Price</dt><dd>{item.priceCurrent ?? "-"} {item.currency ?? "THB"}</dd></div>
            <div><dt className="text-sm font-medium text-slate-500">Commission</dt><dd>{item.commissionRatePercent ?? "-"}%</dd></div>
            <div><dt className="text-sm font-medium text-slate-500">Sold</dt><dd>{formatCount(item.soldCountNormalized, item.soldCountText)}</dd></div>
            <div><dt className="text-sm font-medium text-slate-500">Shop</dt><dd>{item.shopName ?? "-"}</dd></div>
            <div><dt className="text-sm font-medium text-slate-500">Rating</dt><dd>{item.ratingScore ?? "-"}</dd></div>
            <div><dt className="text-sm font-medium text-slate-500">Reviews</dt><dd>{formatCount(item.reviewCountText, history[0]?.reviewCountNormalized)}</dd></div>
            <div><dt className="text-sm font-medium text-slate-500">Updated</dt><dd>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "-"}</dd></div>
          </dl>
        </section>
        <MarketplaceInsightsSection
          insights={insights}
          isLoading={productInsights.isLoading || captureInsights.isLoading}
          emptyText="No AI insights have been synced for this product or its source capture yet."
          allowStorytellingAction
        />
        <section className="rounded-lg border bg-white p-6 shadow-sm">
        {history.length > 0 ? (
          <>
            <h2 className="mt-6 text-lg font-semibold">Update History</h2>
            <div className="mt-3 overflow-x-auto rounded-md border">
              <table className="min-w-full divide-y text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Captured at</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Commission</th>
                    <th className="px-3 py-2">Sold</th>
                    <th className="px-3 py-2">Rating</th>
                    <th className="px-3 py-2">Reviews</th>
                    <th className="px-3 py-2">By user</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-white">
                  {history.map((snapshot: any) => (
                    <tr key={snapshot.id}>
                      <td className="px-3 py-2">{new Date(snapshot.capturedAt).toLocaleString()}</td>
                      <td className="px-3 py-2">{snapshot.priceCurrent ?? "-"} {snapshot.currency ?? "THB"}</td>
                      <td className="px-3 py-2">{snapshot.commissionRatePercent ?? "-"}%</td>
                      <td className="px-3 py-2">{formatCount(snapshot.soldCountNormalized, snapshot.soldCountText)}</td>
                      <td className="px-3 py-2">{snapshot.ratingScore ?? "-"}</td>
                      <td className="px-3 py-2">{formatCount(snapshot.reviewCountNormalized, snapshot.reviewCountText)}</td>
                      <td className="px-3 py-2">{snapshot.capturedByUserId ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {images.length > 0 ? (
          <>
            <h2 className="mt-6 text-lg font-semibold">Images</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {images.map((image: any) => (
                <figure key={image.id} className="rounded-md border bg-slate-50 p-2">
                  <img src={image.url} alt={image.type} className="h-40 w-full object-contain" />
                  <figcaption className="mt-1 text-xs text-slate-500">{image.type}</figcaption>
                </figure>
              ))}
            </div>
          </>
        ) : null}
        <h2 className="mt-6 text-lg font-semibold">Description</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.descriptionText || "-"}</p>
        <h2 className="mt-6 text-lg font-semibold">Raw data</h2>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(item, null, 2)}</pre>
        </section>
      </div>
    </main>
  );
}
