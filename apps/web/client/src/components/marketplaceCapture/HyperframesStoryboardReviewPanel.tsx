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
  compact?: boolean;
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
  compact,
  locale,
}: HyperframesStoryboardReviewPanelProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const [expanded, setExpanded] = useState(() => Boolean(render) && !compact);
  const repairAction = getUserSafeHyperframesRepairAction(render);
  useEffect(() => {
    if (render && !compact) setExpanded(true);
  }, [compact, render?.renderJobId]);
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
  const statusSummary = render
    ? `${render.status} · ${Math.round(render.progressPercent ?? 0)}%`
    : null;
  return (
    <section
      className={cn(
        "rounded-lg border border-sky-200 bg-sky-50 text-slate-950 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-100",
        compact ? "space-y-2 p-2" : "space-y-3 p-3"
      )}
      aria-label="HyperFrames storyboard review"
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between",
          compact ? "gap-2" : "gap-3"
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded(current => !current)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <div className="inline-flex max-w-full items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-100">
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 transition-transform",
                expanded ? "rotate-180" : ""
              )}
            />
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="truncate">{copy.autoPreviewTitle}</span>
            {compact && statusSummary ? (
              <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-sky-100 dark:bg-slate-950 dark:text-sky-100 dark:ring-sky-800">
                {statusSummary}
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              "line-clamp-1 text-sky-800 dark:text-sky-100/85",
              compact
                ? "mt-0.5 text-[11px] leading-4"
                : "mt-1 text-xs leading-5"
            )}
          >
            {render?.safeMessage ?? copy.autoPreviewDescription}
          </p>
        </button>
        {!render && onCreatePreview ? (
          <Button
            type="button"
            onClick={onCreatePreview}
            disabled={creatingPreview}
            size={compact ? "sm" : "default"}
            className={cn(
              "bg-sky-600 text-white hover:bg-sky-700",
              compact ? "h-8 px-3 text-xs" : ""
            )}
          >
            {creatingPreview ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {copy.createPreview}
          </Button>
        ) : null}
        {repairAction && onRetry ? (
          <Button
            type="button"
            variant="outline"
            size={compact ? "sm" : "default"}
            className={compact ? "h-8 px-3 text-xs" : undefined}
            onClick={onRetry}
          >
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
            compact={compact}
            locale={locale}
          />
          <HyperframesSnapshotComparison
            snapshots={derivedSnapshots}
            locale={locale}
            compact={compact}
          />
          {manualFallbackVisible ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {copy.manualFallback}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
