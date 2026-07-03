/**
 * VerticalDramaRunsList — per-episode run history rows (spec §04 Runs sub-list).
 *
 * Each row shows runId, status, mode and timestamps and links to the run's
 * read-only artifact-ledger detail (section 09). Scrolls within its own
 * container so the workspace body never overflows horizontally.
 */

import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { vdCopy, vdStageLabel, type VdLocale } from "./verticalDramaWorkspaceCopy";
import type { VerticalDramaPipelineStage } from "@shared/verticalDramaSeries";

export interface VerticalDramaRunRow {
  runId: string;
  stage: VerticalDramaPipelineStage;
  status: string;
  mode: string;
  startedAt: string | Date;
  updatedAt: string | Date;
  completedAt?: string | Date | null;
  artifactLedgerHref: string;
}

export interface VerticalDramaRunsListProps {
  locale?: VdLocale;
  runs: VerticalDramaRunRow[];
  loading?: boolean;
  /** Navigate to the run's read-only artifact-ledger detail (section 09). */
  onOpenRun?: (run: VerticalDramaRunRow) => void;
  className?: string;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed") return "destructive";
  if (status === "succeeded") return "secondary";
  if (status === "approval_required") return "outline";
  return "default";
}

function fmt(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function VerticalDramaRunsList({
  locale = "en",
  runs,
  loading = false,
  onOpenRun,
  className,
}: VerticalDramaRunsListProps) {
  const t = useMemo(() => vdCopy(locale), [locale]);

  if (loading) {
    return (
      <div className={cn("space-y-2", className)} data-testid="vd-runs-loading">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)} data-testid="vd-runs-empty">
        {t.noRuns}
      </p>
    );
  }

  return (
    <section className={cn("rounded-lg border", className)} aria-label={t.runs}>
      <header className="border-b px-3 py-2 text-sm font-medium">{t.runs}</header>
      <ScrollArea className="max-h-72">
        <ul className="divide-y">
          {runs.map((run) => (
            <li key={run.runId}>
              <button
                type="button"
                onClick={() => onOpenRun?.(run)}
                className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50 focus:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`vd-run-row-${run.runId}`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">#{run.runId}</span>
                  <span className="text-sm">{vdStageLabel(run.stage, locale)}</span>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {run.mode}
                  </Badge>
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                  <span className="text-xs text-muted-foreground">{fmt(run.updatedAt)}</span>
                  <span className="text-xs text-primary underline">{t.openLedger}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </section>
  );
}

export default VerticalDramaRunsList;
