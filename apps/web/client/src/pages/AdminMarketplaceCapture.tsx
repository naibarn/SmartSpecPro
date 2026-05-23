import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

function fmtDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value.toLocaleString()}</p>
    </div>
  );
}

export default function AdminMarketplaceCapture() {
  const overview = trpc.marketplaceCapture.adminOverview.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const data = overview.data;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-500">Admin / Marketplace Capture</p>
            <h1 className="text-2xl font-semibold">Marketplace Capture Ops</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Monitor extension pairings, capture volume, saved products, and latest product metric refreshes.
            </p>
          </div>
          <button
            className="rounded-md border bg-white px-3 py-2 text-sm"
            onClick={() => overview.refetch()}
            disabled={overview.isFetching}
          >
            Refresh
          </button>
        </header>

        {overview.isLoading ? <p className="rounded-lg border bg-white p-4 text-sm text-slate-600">Loading...</p> : null}
        {overview.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {overview.error.message}
          </p>
        ) : null}

        {data ? (
          <>
            <section className="grid gap-3 md:grid-cols-5">
              <StatCard label="Pairings" value={data.stats.pairings} />
              <StatCard label="Captures" value={data.stats.captures} />
              <StatCard label="Products" value={data.stats.products} />
              <StatCard label="Assets" value={data.stats.assets} />
              <StatCard label="Candidate batches" value={data.stats.candidateBatches} />
            </section>

            <section className="rounded-lg border bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Recent Products</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Platform</th>
                      <th className="px-3 py-2">Shop / Item</th>
                      <th className="px-3 py-2">Price / Commission</th>
                      <th className="px-3 py-2">Rating / Reviews / Sold</th>
                      <th className="px-3 py-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentProducts.map((product) => (
                      <tr className="border-t" key={product.id}>
                        <td className="px-3 py-2">
                          <Link className="font-medium text-blue-700 underline" href={`/marketplace-capture/products/${product.id}`}>
                            {product.productName}
                          </Link>
                          <a className="ml-2 text-xs text-slate-500 underline" href={product.sourceUrl} target="_blank" rel="noreferrer">source</a>
                        </td>
                        <td className="px-3 py-2">{product.platform}</td>
                        <td className="px-3 py-2">{product.externalShopId ?? "-"} / {product.externalProductId ?? "-"}</td>
                        <td className="px-3 py-2">{product.priceCurrent ?? "-"} / {product.commissionRatePercent ?? "-"}%</td>
                        <td className="px-3 py-2">{product.ratingScore ?? "-"} / {product.reviewCountText ?? "-"} / {product.soldCountText ?? "-"}</td>
                        <td className="px-3 py-2">{fmtDate(product.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold">Recent Captures</h2>
                <div className="mt-3 space-y-2">
                  {data.recentCaptures.map((capture) => (
                    <div className="rounded-md border p-3 text-sm" key={capture.id}>
                      <div className="flex flex-wrap justify-between gap-2">
                        <Link className="font-medium text-blue-700 underline" href={`/marketplace-capture/captures/${capture.id}/preview`}>
                          {capture.id}
                        </Link>
                        <span>{capture.platform} / {capture.status}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {capture.externalShopId ?? "-"} / {capture.externalProductId ?? "-"} | {fmtDate(capture.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold">Recent Extension Pairings</h2>
                <div className="mt-3 space-y-2">
                  {data.recentPairings.map((pairing) => (
                    <div className="rounded-md border p-3 text-sm" key={pairing.id}>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium">{pairing.status}</span>
                        <span>User {pairing.userId}</span>
                      </div>
                      <div className="mt-1 break-all text-xs text-slate-500">{pairing.origin ?? "-"}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        last used {fmtDate(pairing.lastUsedAt)} | expires {fmtDate(pairing.expiresAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
