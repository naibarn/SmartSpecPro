import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CaptureEvidenceViewer } from "@/components/marketplace/CaptureEvidenceViewer";
import { MarketplaceInsightsSection } from "@/components/marketplace/MarketplaceInsightsSection";
import {
  ProductExtractedForm,
  productConfirmPayload,
  productFormFromExtraction,
  type ProductFormValue,
} from "@/components/marketplace/ProductExtractedForm";
import { ProductImagePicker, type ProductImageSelection } from "@/components/marketplace/ProductImagePicker";
import { trpc } from "@/lib/trpc";

function getCaptureId(pathname: string) {
  return pathname.match(/\/marketplace-capture\/captures\/([^/]+)\/preview/)?.[1] ?? "";
}

function isProductImageAsset(asset: any) {
  return ["main_image", "description_image", "review_image"].includes(String(asset?.kind ?? ""));
}

function mutationErrorMessage(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Unknown error");
  }
  return String(error);
}

export default function MarketplaceCapturePreview() {
  const [location] = useLocation();
  const captureId = getCaptureId(location);
  const utils = trpc.useUtils();
  const captureQuery = trpc.marketplaceCapture.getCapture.useQuery({ captureId }, { enabled: Boolean(captureId) });
  const insightsQuery = trpc.marketplaceCapture.listInsightsByCapture.useQuery({ captureId }, { enabled: Boolean(captureId) });
  const analyzeMutation = trpc.marketplaceCapture.analyzeCapture.useMutation({
    onSuccess: () => utils.marketplaceCapture.getCapture.invalidate({ captureId }),
  });
  const saveDraftMutation = trpc.marketplaceCapture.saveDraftEdits.useMutation({
    onSuccess: () => utils.marketplaceCapture.getCapture.invalidate({ captureId }),
  });
  const discardMutation = trpc.marketplaceCapture.discardCapture.useMutation({
    onSuccess: () => utils.marketplaceCapture.getCapture.invalidate({ captureId }),
  });
  const confirmMutation = trpc.marketplaceCapture.confirmCapture.useMutation({
    onSuccess: () => {
      utils.marketplaceCapture.getCapture.invalidate({ captureId });
      utils.marketplaceCapture.listInsightsByCapture.invalidate({ captureId });
    },
  });
  const capture = captureQuery.data?.capture as any;
  const assets = (captureQuery.data?.assets as any[] | undefined) ?? [];
  const extraction = useMemo(() => (capture?.normalizedResultJson ?? capture?.llmResultJson ?? {}) as any, [capture]);
  const [form, setForm] = useState<ProductFormValue>(() => productFormFromExtraction({}));
  const [images, setImages] = useState<ProductImageSelection>({ main: [], description: [], review: [], relatedExcluded: [], coverAssetId: null });
  const [highlightedEvidence, setHighlightedEvidence] = useState<string | null>(null);

  useEffect(() => {
    if (!capture) return;
    const next = productFormFromExtraction({
      ...extraction,
      platformRawJson: {
        ...((capture.rawPayloadJson ?? {}) as Record<string, unknown>),
        ...((extraction.platformRawJson ?? {}) as Record<string, unknown>),
      },
    });
    setForm(next);
    const mainAssetImageIds = assets
      .filter((asset) => asset.kind === "main_image" && String(asset.contentType ?? "").startsWith("image/"))
      .map((asset) => asset.id);
    const descriptionAssetImageIds = assets
      .filter((asset) => asset.kind === "description_image" && String(asset.contentType ?? "").startsWith("image/"))
      .map((asset) => asset.id);
    const reviewAssetImageIds = assets
      .filter((asset) => asset.kind === "review_image" && String(asset.contentType ?? "").startsWith("image/"))
      .map((asset) => asset.id);
    const extractedMain = Array.isArray(extraction?.images?.main) ? extraction.images.main.filter(Boolean) : [];
    const extractedDescription = Array.isArray(extraction?.images?.description) ? extraction.images.description.filter(Boolean) : [];
    const extractedReview = Array.isArray(extraction?.images?.review) ? extraction.images.review.filter(Boolean) : [];
    const main = [...mainAssetImageIds, ...extractedMain].slice(0, 20);
    setImages({
      main,
      description: [...descriptionAssetImageIds, ...extractedDescription].slice(0, 20),
      review: [...reviewAssetImageIds, ...extractedReview].slice(0, 30),
      relatedExcluded: Array.isArray(extraction?.images?.excludedRelated) ? extraction.images.excludedRelated.filter(Boolean) : [],
      coverAssetId: main[0] ?? null,
    });
  }, [assets.length, capture, extraction]);

  if (captureQuery.isLoading) return <main className="p-8">Loading capture...</main>;
  if (!capture) return <main className="p-8">Capture not found</main>;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">{capture.platform} | {capture.status}</p>
            <h1 className="text-2xl font-semibold">Marketplace Capture Preview</h1>
            <a className="text-sm text-blue-700 underline" href={capture.sourceUrl} target="_blank" rel="noreferrer">
              {capture.sourceUrl}
            </a>
            {form.affiliateUrl ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <a className="max-w-xl truncate text-blue-700 underline" href={form.affiliateUrl} target="_blank" rel="noreferrer">
                  Affiliate link
                </a>
                <button className="rounded border bg-white px-2 py-1 text-xs" type="button" onClick={() => navigator.clipboard?.writeText(form.affiliateUrl)}>
                  Copy
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button className="rounded-md border bg-white px-3 py-2 text-sm" onClick={() => analyzeMutation.mutate({ captureId, analyze: { forceRerun: true } })}>
              Re-run LLM
            </button>
            <button
              className="rounded-md border bg-white px-3 py-2 text-sm disabled:opacity-60"
              disabled={!form.productName || saveDraftMutation.isPending || capture.status === "discarded"}
              onClick={() => saveDraftMutation.mutate({ captureId, data: productConfirmPayload(form, images, extraction) })}
            >
              Save Draft
            </button>
            <button
              className="rounded-md border bg-white px-3 py-2 text-sm"
              onClick={() => utils.marketplaceCapture.getCapture.invalidate({ captureId })}
            >
              Refresh
            </button>
            <button
              className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700 disabled:opacity-60"
              disabled={discardMutation.isPending || capture.status === "confirmed" || capture.status === "discarded"}
              onClick={() => discardMutation.mutate({ captureId })}
            >
              Discard
            </button>
            <button
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={!form.productName || confirmMutation.isPending || capture.status === "discarded" || capture.status === "confirmed"}
              onClick={() => confirmMutation.mutate({
                captureId,
                data: productConfirmPayload(form, images, extraction),
              })}
            >
              {confirmMutation.isPending ? "Saving..." : "Confirm & Save Product"}
            </button>
          </div>
        </header>

        {confirmMutation.isPending ? (
          <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Saving product. Please wait...
          </p>
        ) : null}

        {confirmMutation.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-medium">Confirm failed</div>
            <div className="mt-1 break-words">{mutationErrorMessage(confirmMutation.error)}</div>
            <div className="mt-2 text-xs text-red-700">
              Check that the latest marketplace capture migration has been applied, then try again.
            </div>
          </div>
        ) : null}

        {confirmMutation.data ? (
          <a className="block rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" href={confirmMutation.data.productUrl}>
            Saved: {confirmMutation.data.productId}
          </a>
        ) : null}

        {saveDraftMutation.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-medium">Save draft failed</div>
            <div className="mt-1 break-words">{mutationErrorMessage(saveDraftMutation.error)}</div>
          </div>
        ) : null}

        {analyzeMutation.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-medium">Re-run LLM failed</div>
            <div className="mt-1 break-words">{mutationErrorMessage(analyzeMutation.error)}</div>
          </div>
        ) : null}

        {discardMutation.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-medium">Discard failed</div>
            <div className="mt-1 break-words">{mutationErrorMessage(discardMutation.error)}</div>
          </div>
        ) : null}

        {saveDraftMutation.data ? (
          <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Draft saved at {saveDraftMutation.data.savedAt}
          </p>
        ) : null}

        {capture.status === "discarded" ? (
          <p className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600">
            This capture is discarded. Evidence remains viewable for audit until retention cleanup.
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_460px]">
          <CaptureEvidenceViewer
            assets={assets}
            rawDomText={capture.rawDomText}
            rawJson={{ capture, extraction }}
            highlightedSource={highlightedEvidence}
          />
          <div className="space-y-5">
            <ProductExtractedForm
              value={form}
              onChange={setForm}
              confidence={extraction.confidence ?? capture.confidenceJson}
              warnings={extraction.warnings ?? capture.validationWarningsJson ?? []}
              evidence={extraction.evidence ?? {}}
              onEvidenceSelect={setHighlightedEvidence}
            />
            <ProductImagePicker assets={assets.filter(isProductImageAsset)} extraction={extraction} value={images} onChange={setImages} />
          </div>
        </div>
        <MarketplaceInsightsSection
          insights={(insightsQuery.data as any[] | undefined) ?? []}
          isLoading={insightsQuery.isLoading}
          title="AI Insights From This Capture"
          emptyText="No structured AI insights have been synced for this capture yet."
        />
      </div>
    </main>
  );
}
