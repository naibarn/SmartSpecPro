import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Library,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getHyperframesRenderLibraryReadyOutput } from "@/lib/mediaStudioRenderLibrarySessions";
import type { HyperframesRenderStatusProjection } from "@shared/hyperframes/contracts";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

interface HyperframesRenderPanelProps {
  render?: HyperframesRenderStatusProjection | null;
  loading?: boolean;
  cancelling?: boolean;
  saving?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onSaveToLibrary?: () => void;
  locale?: MarketplaceHyperframesUiLocale | string;
}

export function HyperframesRenderPanel({
  render,
  loading,
  cancelling,
  saving,
  onCancel,
  onRetry,
  onSaveToLibrary,
  locale,
}: HyperframesRenderPanelProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  if (!render && !loading) return null;
  const status = render?.status ?? "queued";
  const completed = status === "completed" || status === "ready_for_review";
  const saved = status === "saved_to_library";
  const failed =
    status === "failed" ||
    status === "failed_permanent" ||
    status === "failed_transient" ||
    status === "dead_lettered" ||
    status === "stale_input_hash";
  const active = !completed && !saved && !failed && status !== "cancelled";
  const output = render?.outputRefs?.[0];
  const durableOutput = getHyperframesRenderLibraryReadyOutput(render);
  const canSaveToLibrary =
    Boolean(onSaveToLibrary) &&
    completed &&
    render?.renderIntent !== "preview" &&
    render?.renderIntent !== "snapshot" &&
    Boolean(durableOutput?.contentHash);

  return (
    <section
      className="rounded-lg border bg-white p-4 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      aria-label="HyperFrames render status"
      aria-live="polite"
      data-library-ready={canSaveToLibrary ? "true" : "false"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {loading || active ? (
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
            ) : failed ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            {copy.hyperframesRender}
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {render?.safeMessage ?? copy.loadingRenderStatus}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {active && onCancel ? (
            <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={cancelling}>
              {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
              {copy.cancel}
            </Button>
          ) : null}
          {render?.repairActions?.[0] && onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {render.repairActions[0].label}
            </Button>
          ) : null}
          {canSaveToLibrary ? (
            <Button type="button" size="sm" onClick={onSaveToLibrary} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Library className="mr-2 h-4 w-4" />}
              {copy.saveToLibrary}
            </Button>
          ) : null}
          {output?.url ? (
            <Button asChild type="button" variant="outline" size="sm">
              <a href={output.url} target="_blank" rel="noreferrer">
                <Download className="mr-2 h-4 w-4" />
                {copy.openOutput}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-500 transition-all"
          style={{ width: `${render?.progressPercent ?? 0}%` }}
        />
      </div>
      {render?.safeDiagnostics?.length ? (
        <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          {render.safeDiagnostics.slice(0, 3).map(item => (
            <p key={item}>{item}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
