import { useEffect, useState } from "react";
import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUserSafeHyperframesRepairAction } from "@/lib/marketplaceHyperframesUiState";
import { cn } from "@/lib/utils";
import type { HyperframesRenderStatusProjection } from "@shared/hyperframes/contracts";
import { HyperframesRenderPanel } from "./HyperframesRenderPanel";
import { HyperframesSnapshotComparison } from "./HyperframesSnapshotComparison";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

interface HyperframesStoryboardReviewPanelProps {
  render?: HyperframesRenderStatusProjection | null;
  snapshots?: Array<{
    id: string;
    label: string;
    url?: string | null;
    status: "ready" | "missing" | "failed" | "stale";
  }>;
  onCreatePreview?: () => void;
  onRetry?: () => void;
  onSaveToLibrary?: () => void;
  loading?: boolean;
  creatingPreview?: boolean;
  saving?: boolean;
  manualFallbackVisible?: boolean;
  locale?: MarketplaceHyperframesUiLocale | string;
}

export function HyperframesStoryboardReviewPanel({
  render,
  snapshots,
  onCreatePreview,
  onRetry,
  onSaveToLibrary,
  loading,
  creatingPreview,
  saving,
  manualFallbackVisible,
  locale,
}: HyperframesStoryboardReviewPanelProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const [expanded, setExpanded] = useState(() => Boolean(render));
  const repairAction = getUserSafeHyperframesRepairAction(render);
  useEffect(() => {
    if (render) setExpanded(true);
  }, [render?.renderJobId]);
  const derivedSnapshots =
    snapshots && snapshots.length > 0
      ? snapshots
      : (render?.outputRefs ?? [])
          .filter(ref => ref.kind === "snapshot")
          .map((ref, index) => ({
            id: ref.outputId,
            label: ref.accessibleLabel || `Snapshot ${index + 1}`,
            url: ref.url ?? null,
            status: ref.url ? ("ready" as const) : ("missing" as const),
          }));
  return (
    <section
      className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-slate-950 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-100"
      aria-label="HyperFrames storyboard review"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded(current => !current)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-100">
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                expanded ? "rotate-180" : ""
              )}
            />
            <Sparkles className="h-4 w-4" />
            {copy.autoPreviewTitle}
          </div>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-sky-800 dark:text-sky-100/85">
            {render?.safeMessage ?? copy.autoPreviewDescription}
          </p>
        </button>
        {!render && onCreatePreview ? (
          <Button
            type="button"
            onClick={onCreatePreview}
            disabled={creatingPreview}
            className="bg-sky-600 text-white hover:bg-sky-700"
          >
            {creatingPreview ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
            {copy.createPreview}
          </Button>
        ) : null}
        {repairAction && onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {repairAction.label}
          </Button>
        ) : null}
      </div>
      {expanded ? (
        <>
          <HyperframesRenderPanel
            render={render}
            loading={loading}
            onRetry={repairAction ? undefined : onRetry}
            onSaveToLibrary={onSaveToLibrary}
            saving={saving}
            locale={locale}
          />
          <HyperframesSnapshotComparison snapshots={derivedSnapshots} locale={locale} />
          {manualFallbackVisible ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">{copy.manualFallback}</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
