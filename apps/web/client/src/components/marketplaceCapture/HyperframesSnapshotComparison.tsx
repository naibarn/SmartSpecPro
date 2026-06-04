import { AlertTriangle, ImageIcon } from "lucide-react";
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
}

export function HyperframesSnapshotComparison({
  snapshots = [],
  locale,
}: HyperframesSnapshotComparisonProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  return (
    <section
      className="rounded-lg border bg-white p-4 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      aria-label="HyperFrames snapshot comparison"
    >
      <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <ImageIcon className="h-4 w-4" />
        {copy.snapshotComparison}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {snapshots.length > 0 ? (
          snapshots.map(snapshot => (
            <div
              key={snapshot.id}
              className="overflow-hidden rounded-md border bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
            >
              {snapshot.url && snapshot.status === "ready" ? (
                <img
                  src={snapshot.url}
                  alt={snapshot.label}
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-300">
                  <AlertTriangle className="h-4 w-4" />
                  {snapshot.status}
                </div>
              )}
              <p className="p-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                {snapshot.label}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-300">{copy.noSnapshots}</p>
        )}
      </div>
    </section>
  );
}
