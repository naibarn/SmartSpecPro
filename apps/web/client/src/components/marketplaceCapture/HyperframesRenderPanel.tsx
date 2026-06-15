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
import {
  getHyperframesRenderDisplayOutput,
  getHyperframesRenderLibraryReadyOutput,
  isHyperframesRenderQaPassed,
} from "@/lib/mediaStudioRenderLibrarySessions";
import { resolveHyperframesRenderUiState } from "@/lib/marketplaceHyperframesUiState";
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
  compact?: boolean;
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
  compact,
  onCancel,
  onRetry,
  onSaveToLibrary,
  locale,
}: HyperframesRenderPanelProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  if (!render && !loading) return null;
  const uiState = resolveHyperframesRenderUiState({ render, loading });
  const output = getHyperframesRenderDisplayOutput(render);
  const durableOutput = getHyperframesRenderLibraryReadyOutput(render);
  const qaPassed = isHyperframesRenderQaPassed(render);
  const renderDetails = render
    ? [
        { label: "Job", value: render.renderJobId },
        { label: "Template", value: render.templateId },
        { label: "Mode", value: render.compositionMode },
        { label: "Intent", value: render.renderIntent },
        { label: "Input", value: render.compositionInputHash },
      ].filter(
        (item): item is { label: string; value: string } =>
          typeof item.value === "string" && item.value.trim().length > 0
      )
    : [];
  const canSaveToLibrary =
    Boolean(onSaveToLibrary) &&
    uiState.completed &&
    qaPassed &&
    render?.renderIntent !== "preview" &&
    render?.renderIntent !== "snapshot" &&
    Boolean(durableOutput?.contentHash);

  return (
    <section
      className={
        compact
          ? "rounded-md border bg-white px-3 py-2 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          : "rounded-lg border bg-white p-4 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      }
      aria-label="HyperFrames render status"
      aria-live="polite"
      data-library-ready={canSaveToLibrary ? "true" : "false"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {uiState.state === "loading" || uiState.active ? (
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
            ) : uiState.failed || uiState.blocked ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            {copy.hyperframesRender}
          </div>
          <p
            className={
              compact
                ? "mt-0.5 line-clamp-1 text-xs leading-5 text-slate-600 dark:text-slate-300"
                : "mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300"
            }
          >
            {render?.safeMessage ?? copy.loadingRenderStatus}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {uiState.canCancel && onCancel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={cancelling}
            >
              {cancelling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              {copy.cancel}
            </Button>
          ) : null}
          {uiState.userRepairAction && onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {uiState.userRepairAction.label}
            </Button>
          ) : null}
          {canSaveToLibrary ? (
            <Button
              type="button"
              size="sm"
              onClick={onSaveToLibrary}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Library className="mr-2 h-4 w-4" />
              )}
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
      <div
        className={
          compact
            ? "mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            : "mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        }
      >
        <div
          className="h-full rounded-full bg-sky-500 transition-all"
          style={{ width: `${render?.progressPercent ?? 0}%` }}
        />
      </div>
      {renderDetails.length ? (
        <dl
          className={
            compact
              ? "mt-2 grid gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 sm:grid-cols-2 lg:grid-cols-3"
              : "mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {renderDetails.map(item => (
            <div
              key={item.label}
              className={
                compact
                  ? "min-w-0 rounded-md bg-slate-50 px-2 py-1.5 dark:bg-slate-950"
                  : "min-w-0 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-950"
              }
            >
              <dt className="font-medium text-slate-500 dark:text-slate-400">
                {item.label}
              </dt>
              <dd
                className="mt-1 truncate font-mono text-slate-800 dark:text-slate-100"
                title={item.value}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {render?.safeDiagnostics?.length ? (
        <div
          className={
            compact
              ? "mt-2 rounded-md bg-slate-50 p-2 text-[11px] leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-300"
              : "mt-3 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-300"
          }
        >
          {render.safeDiagnostics.slice(0, 3).map(item => (
            <p key={item}>{item}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
