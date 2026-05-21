import { useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

function getInsightId(pathname: string) {
  return pathname.match(/\/marketplace-capture\/insights\/([^/]+)/)?.[1] ?? "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export default function MarketplaceCaptureInsight() {
  const [location] = useLocation();
  const insightId = getInsightId(location);
  const utils = trpc.useUtils();
  const insightQuery = trpc.marketplaceCapture.getInsight.useQuery({ insightId }, { enabled: Boolean(insightId) });
  const resolveClaim = trpc.marketplaceCapture.resolveInsightClaim.useMutation({
    onSuccess: () => utils.marketplaceCapture.getInsight.invalidate({ insightId }),
  });
  const insight = insightQuery.data as any;
  const payload = useMemo(() => (insight?.payloadJson ?? {}) as any, [insight]);
  const claims = asArray(payload.claims) as Array<{ id?: string; text?: string; status?: string; evidenceIds?: string[] }>;
  const evidenceIds = asArray(payload.evidenceIds);
  const selectedImages = asArray(payload.selectedImages) as Array<{ url?: string; role?: string; fidelity?: string }>;

  if (insightQuery.isLoading) return <main className="p-8">Loading insight...</main>;
  if (!insight) return <main className="p-8">Insight not found</main>;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-6 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">{insight.platform} | {insight.provider} | {insight.status}</p>
            <h1 className="text-2xl font-semibold">Marketplace Insight</h1>
            <a className="text-sm text-blue-700 underline" href={insight.sourceUrl} target="_blank" rel="noreferrer">
              {insight.sourceUrl}
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            {insight.captureId ? <a className="rounded-md border bg-white px-3 py-2 text-sm" href={`/marketplace-capture/captures/${insight.captureId}/preview`}>Open capture</a> : null}
            {payload?.readiness === "ready_for_storytelling" || payload?.readiness === "ready_with_warnings" ? (
              <a className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white" href={`/media-studio?marketplaceStorytelling=1&marketplaceInsightId=${encodeURIComponent(insight.id)}`}>
                Open Storytelling
              </a>
            ) : null}
          </div>
        </header>

        <section className="rounded-md border bg-white p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <div className="text-xs uppercase text-slate-500">Type</div>
              <div className="font-medium">{insight.insightType}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Readiness</div>
              <div className="font-medium">{payload.readiness ?? insight.storytellingReadiness ?? "-"}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Confidence</div>
              <div className="font-medium">{typeof payload.confidence === "number" ? `${Math.round(payload.confidence * 100)}%` : "-"}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Evidence</div>
              <div className="font-medium">{evidenceIds.length}</div>
            </div>
          </div>
        </section>

        <section className="rounded-md border bg-white p-4">
          <h2 className="text-lg font-semibold">{payload.productName ?? payload.title ?? "Structured Insight"}</h2>
          {payload.shortSummary ? <p className="mt-2 text-sm text-slate-700">{payload.shortSummary}</p> : null}
          {Array.isArray(payload.blockers) && payload.blockers.length > 0 ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {payload.blockers.join(", ")}
            </div>
          ) : null}
          {Array.isArray(payload.customerJourneyStages) ? (
            <div className="mt-3 text-sm text-slate-600">Journey: {payload.customerJourneyStages.join(" -> ")}</div>
          ) : null}
        </section>

        {selectedImages.length > 0 ? (
          <section className="rounded-md border bg-white p-4">
            <h2 className="text-lg font-semibold">Selected Images</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {selectedImages.map((image, index) => (
                <div className="rounded-md border p-2" key={`${image.url}-${index}`}>
                  {image.url ? <img className="aspect-square w-full rounded object-cover" src={image.url} alt="" loading="lazy" /> : null}
                  <div className="mt-2 text-xs text-slate-500">{image.role} | {image.fidelity}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {claims.length > 0 ? (
          <section className="rounded-md border bg-white p-4">
            <h2 className="text-lg font-semibold">Claim Review</h2>
            <div className="mt-3 space-y-3">
              {claims.map((claim) => (
                <div className="rounded-md border p-3" key={claim.id}>
                  <div className="font-medium">{claim.text}</div>
                  <div className="text-xs text-slate-500">Status: {claim.status} | Evidence: {claim.evidenceIds?.join(", ") || "-"}</div>
                  {claim.id ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className="rounded-md border bg-white px-3 py-1 text-sm" onClick={() => resolveClaim.mutate({ insightId, claimId: claim.id!, decision: "approve" })}>Approve</button>
                      <button className="rounded-md border bg-white px-3 py-1 text-sm" onClick={() => resolveClaim.mutate({ insightId, claimId: claim.id!, decision: "request_more_evidence" })}>More evidence</button>
                      <button className="rounded-md border border-red-200 bg-white px-3 py-1 text-sm text-red-700" onClick={() => resolveClaim.mutate({ insightId, claimId: claim.id!, decision: "remove" })}>Remove</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
