import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ChevronRight, Clock, Coins, Cpu } from "lucide-react";
import { TraceViewerTimeline } from "./TraceViewerTimeline";

interface RunHistoryPanelProps {
  agencyId: string;
  open: boolean;
  onClose: () => void;
}

const STATUS_BADGE: Record<string, { variant: "default" | "destructive" | "secondary" | "outline"; label: string }> = {
  completed: { variant: "default", label: "Completed" },
  failed: { variant: "destructive", label: "Failed" },
  cancelled: { variant: "secondary", label: "Cancelled" },
  timeout: { variant: "outline", label: "Timeout" },
  running: { variant: "secondary", label: "Running" },
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cost: string | null): string {
  if (!cost) return "—";
  const num = parseFloat(cost);
  if (isNaN(num)) return "—";
  return `$${num.toFixed(4)}`;
}

export function RunHistoryPanel({ agencyId, open, onClose }: RunHistoryPanelProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const { data, isLoading } = trpc.agency.listRunTraces.useQuery(
    {
      agencyId,
      limit: LIMIT,
      offset,
      status: statusFilter === "all" ? undefined : statusFilter,
    },
    { enabled: open },
  );

  const traces = data?.traces ?? [];
  const total = data?.total ?? 0;

  return (
    <>
      <Sheet open={open && !selectedTraceId} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Run History</SheetTitle>
          </SheetHeader>

          <div className="mt-4 mb-3">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setOffset(0); }}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && traces.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No run traces found.
            </div>
          )}

          <div className="space-y-1">
            {traces.map((trace) => {
              const badge = STATUS_BADGE[trace.status ?? ""] ?? STATUS_BADGE.running;
              return (
                <button
                  key={trace.id}
                  className="w-full flex items-center gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedTraceId(trace.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground truncate max-w-32">
                        {trace.runId.slice(0, 8)}
                      </span>
                      <Badge variant={badge.variant} className="text-[10px] px-1.5 py-0">
                        {badge.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(trace.durationMs)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Cpu className="h-3 w-3" />
                        {trace.totalTokens?.toLocaleString() ?? "—"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Coins className="h-3 w-3" />
                        {formatCost(trace.totalCost)}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(trace.createdAt).toLocaleString()}
                    </div>
                    {trace.hybridSummary && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {(Array.isArray(trace.hybridSummary.engineMix) && trace.hybridSummary.engineMix.length > 0)
                            ? trace.hybridSummary.engineMix.join(", ")
                            : "hybrid"}
                        </Badge>
                        {typeof trace.hybridSummary.subgraphCount === "number" && (
                          <Badge variant="outline" className="text-[10px]">
                            {trace.hybridSummary.subgraphCount} subgraphs
                          </Badge>
                        )}
                        {typeof trace.hybridSummary.boundaryCount === "number" && (
                          <Badge variant="outline" className="text-[10px]">
                            {trace.hybridSummary.boundaryCount} boundaries
                          </Badge>
                        )}
                        {typeof trace.hybridSummary.bridgeCount === "number" && (
                          <Badge variant="outline" className="text-[10px]">
                            {trace.hybridSummary.bridgeCount} bridges
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>

          {total > LIMIT && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t">
              <span className="text-xs text-muted-foreground">
                {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={offset + LIMIT >= total}
                  onClick={() => setOffset(offset + LIMIT)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {selectedTraceId && (
        <TraceViewerTimeline
          traceId={selectedTraceId}
          open={!!selectedTraceId}
          onClose={() => setSelectedTraceId(null)}
        />
      )}
    </>
  );
}
