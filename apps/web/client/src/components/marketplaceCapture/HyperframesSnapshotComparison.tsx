import { AlertTriangle, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

interface HyperframesSnapshotComparisonProps {
  snapshots?: Array<{
    id: string;
    label: string;
    url?: string | null;
    status: "ready" | "missing" | "failed" | "stale";
  }>;
  locale?: MarketplaceHyperframesUiLocale | string;
  compact?: boolean;
}

export function HyperframesSnapshotComparison({
  snapshots = [],
  locale,
  compact,
}: HyperframesSnapshotComparisonProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const readyCount = snapshots.filter(
    snapshot => snapshot.status === "ready" && snapshot.url
  ).length;
  return (
    <section
      className={cn(
        "border bg-white text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
        compact ? "rounded-md px-3 py-2" : "rounded-lg p-4"
      )}
      aria-label="HyperFrames snapshot comparison"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <ImageIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{copy.snapshotComparison}</span>
        </div>
        {compact ? (
          <span className="shrink-0 text-xs text-slate-500 dark:text-slate-300">
            {snapshots.length > 0
              ? `${readyCount}/${snapshots.length}`
              : copy.noSnapshots}
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          compact
            ? "mt-2 flex gap-2 overflow-x-auto pb-1"
            : "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        )}
      >
        {snapshots.length > 0 ? (
          snapshots.map(snapshot => (
            <div
              key={snapshot.id}
              className={cn(
                "overflow-hidden rounded-md border bg-slate-50 dark:border-slate-700 dark:bg-slate-950",
                compact ? "w-28 shrink-0" : ""
              )}
            >
              {snapshot.url && snapshot.status === "ready" ? (
                <img
                  src={snapshot.url}
                  alt={snapshot.label}
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div
                  className={cn(
                    "flex aspect-video items-center justify-center gap-2 text-slate-500 dark:text-slate-300",
                    compact ? "text-[11px]" : "text-sm"
                  )}
                >
                  <AlertTriangle className="h-4 w-4" />
                  {snapshot.status}
                </div>
              )}
              <p
                className={cn(
                  "font-medium text-slate-700 dark:text-slate-200",
                  compact ? "truncate px-2 py-1 text-[11px]" : "p-2 text-xs"
                )}
                title={snapshot.label}
              >
                {snapshot.label}
              </p>
            </div>
          ))
        ) : (
          <p
            className={
              compact ? "sr-only" : "text-sm text-slate-500 dark:text-slate-300"
            }
          >
            {copy.noSnapshots}
          </p>
        )}
      </div>
    </section>
  );
}
