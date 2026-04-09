import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, Clock, Coins, Cpu, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface TraceViewerTimelineProps {
  traceId: string;
  open: boolean;
  onClose: () => void;
}

interface TraceSpan {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  type: string;
  startMs: number;
  endMs: number | null;
  durationMs: number | null;
  input: string | null;
  output: string | null;
  tokens: number;
  cost: number;
  toolCalls: Array<{ toolId: string; name: string; durationMs: number }>;
  guardrails: Array<{ name: string; passed: boolean; durationMs: number }>;
  error: string | null;
  metadata: Record<string, unknown>;
}

const TYPE_COLORS: Record<string, string> = {
  agent_turn: "bg-blue-500",
  tool_call: "bg-emerald-500",
  guardrail: "bg-orange-500",
  bridge: "bg-violet-500",
};

const TYPE_LABELS: Record<string, string> = {
  agent_turn: "Agent",
  tool_call: "Tool",
  guardrail: "Guard",
  bridge: "Bridge",
};

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function CollapsibleText({ label, text }: { label: string; text: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;

  return (
    <div className="mt-2">
      <button
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {expanded && (
        <pre className="mt-1 text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-words">
          {text}
        </pre>
      )}
    </div>
  );
}

function SpanDetail({ span }: { span: TraceSpan }) {
  const sourceEngine = typeof span.metadata?.sourceEngine === "string"
    ? span.metadata.sourceEngine
    : null;
  const targetEngine = typeof span.metadata?.targetEngine === "string"
    ? span.metadata.targetEngine
    : null;
  const sourceSubgraphId = typeof span.metadata?.sourceSubgraphId === "string"
    ? span.metadata.sourceSubgraphId
    : null;
  const targetSubgraphId = typeof span.metadata?.targetSubgraphId === "string"
    ? span.metadata.targetSubgraphId
    : null;
  const bridgeMode = typeof span.metadata?.bridgeMode === "string"
    ? span.metadata.bridgeMode
    : null;
  const inputContract = typeof span.metadata?.inputContract === "string"
    ? span.metadata.inputContract
    : null;
  const outputContract = typeof span.metadata?.outputContract === "string"
    ? span.metadata.outputContract
    : null;
  const nodeId = typeof span.metadata?.nodeId === "string"
    ? span.metadata.nodeId
    : null;
  const bridgeMetadataKeys = new Set([
    "phase",
    "boundaryTransition",
    "bridgeId",
    "bridgeMode",
    "inputContract",
    "outputContract",
    "sourceSubgraphId",
    "targetSubgraphId",
    "sourceEngine",
    "targetEngine",
    "nodeId",
    "nodeType",
    "subgraphId",
    "engine",
  ]);
  const metadataEntries = Object.entries(span.metadata ?? {}).filter(([key, value]) => (
    (typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean")
    && !bridgeMetadataKeys.has(key)
  ));
  const isBridgeSpan = span.type === "bridge" || span.metadata?.phase === "bridge";

  return (
    <div className="border rounded-md p-3 mt-2 bg-background">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-2 h-2 rounded-full", TYPE_COLORS[span.type] ?? "bg-gray-400")} />
        <span className="font-medium text-sm">{span.name}</span>
        <Badge variant="outline" className="text-[10px]">
          {TYPE_LABELS[span.type] ?? span.type}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mb-2">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatMs(span.durationMs)}</span>
        <span className="flex items-center gap-1"><Cpu className="h-3 w-3" /> {span.tokens.toLocaleString()} tok</span>
        <span className="flex items-center gap-1"><Coins className="h-3 w-3" /> ${span.cost.toFixed(4)}</span>
      </div>

      {isBridgeSpan && (
        <div className="mb-2 rounded-md border border-violet-200 bg-violet-50 p-2 text-xs text-violet-900">
          <div className="flex flex-wrap gap-2">
            {sourceEngine && targetEngine && (
              <span>
                {sourceEngine} {"->"} {targetEngine}
              </span>
            )}
            {sourceSubgraphId && targetSubgraphId && (
              <span>
                {sourceSubgraphId} {"->"} {targetSubgraphId}
              </span>
            )}
            {bridgeMode && (
              <span>mode: {bridgeMode}</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {inputContract && (
              <Badge variant="outline" className="border-violet-200 bg-white/90 text-[10px] text-violet-700">
                in: {inputContract}
              </Badge>
            )}
            {outputContract && (
              <Badge variant="outline" className="border-violet-200 bg-white/90 text-[10px] text-violet-700">
                out: {outputContract}
              </Badge>
            )}
            {nodeId && (
              <Badge variant="outline" className="border-violet-200 bg-white/90 text-[10px] text-violet-700">
                node: {nodeId}
              </Badge>
            )}
          </div>
        </div>
      )}

      {metadataEntries.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {metadataEntries.map(([key, value]) => (
            <Badge key={key} variant="outline" className="text-[10px]">
              {key}: {String(value)}
            </Badge>
          ))}
        </div>
      )}

      {span.error && (
        <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded p-2 mb-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{span.error}</span>
        </div>
      )}

      {span.toolCalls.length > 0 && (
        <div className="text-xs mt-1">
          <span className="font-medium text-muted-foreground">Tool Calls:</span>
          {span.toolCalls.map((tc, i) => (
            <span key={i} className="ml-2 text-muted-foreground">
              {tc.name} ({formatMs(tc.durationMs)})
            </span>
          ))}
        </div>
      )}

      {span.guardrails.length > 0 && (
        <div className="text-xs mt-1">
          <span className="font-medium text-muted-foreground">Guardrails:</span>
          {span.guardrails.map((gr, i) => (
            <span key={i} className={cn("ml-2", gr.passed ? "text-green-600" : "text-red-600")}>
              {gr.name} ({gr.passed ? "pass" : "fail"})
            </span>
          ))}
        </div>
      )}

      <CollapsibleText label="Input" text={span.input} />
      <CollapsibleText label="Output" text={span.output} />
    </div>
  );
}

export function TraceViewerTimeline({ traceId, open, onClose }: TraceViewerTimelineProps) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

  const { data: trace, isLoading } = trpc.agency.getRunTrace.useQuery(
    { traceId },
    { enabled: open },
  );

  const traceData = trace?.trace as { version: number; spans: TraceSpan[] } | undefined;
  const spans = traceData?.spans ?? [];
  const totalDurationMs = trace?.durationMs ?? (spans.length > 0 ? Math.max(...spans.map((s) => s.endMs ?? 0)) : 0);
  const hybridSummary = trace?.trace && typeof trace.trace === "object"
    ? (trace.trace as Record<string, unknown>).hybridSummary as Record<string, unknown> | undefined
    : undefined;

  const selectedSpan = selectedSpanId ? spans.find((s) => s.spanId === selectedSpanId) : null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Trace Viewer</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {trace && (
          <>
            {/* Summary bar */}
            <div className="flex items-center gap-4 mt-4 mb-4 p-3 rounded-md bg-muted/50 border">
              <Badge
                variant={trace.status === "completed" ? "default" : trace.status === "failed" ? "destructive" : "secondary"}
              >
                {trace.status}
              </Badge>
              <span className="flex items-center gap-1 text-sm">
                <Clock className="h-3.5 w-3.5" /> {formatMs(trace.durationMs)}
              </span>
              <span className="flex items-center gap-1 text-sm">
                <Cpu className="h-3.5 w-3.5" /> {trace.totalTokens?.toLocaleString() ?? 0} tokens
              </span>
              <span className="flex items-center gap-1 text-sm">
                <Coins className="h-3.5 w-3.5" /> ${parseFloat(trace.totalCost ?? "0").toFixed(4)}
              </span>
            </div>

            {hybridSummary && (
              <div className="mb-4 rounded-md border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="bg-white/80 text-violet-800">
                    Hybrid Trace
                  </Badge>
                  {Array.isArray(hybridSummary.engineMix) && hybridSummary.engineMix.length > 0 && (
                    <span>Engines: {hybridSummary.engineMix.join(", ")}</span>
                  )}
                  {Array.isArray(hybridSummary.subgraphIds) && (
                    <span>Subgraphs: {hybridSummary.subgraphIds.length}</span>
                  )}
                  {typeof hybridSummary.subgraphCount === "number" && (
                    <span>Declared Subgraphs: {hybridSummary.subgraphCount}</span>
                  )}
                  {typeof hybridSummary.boundaryCount === "number" && (
                    <span>Boundaries: {hybridSummary.boundaryCount}</span>
                  )}
                  {typeof hybridSummary.bridgeCount === "number" && (
                    <span>Bridges: {hybridSummary.bridgeCount}</span>
                  )}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="space-y-1">
              {spans.map((span) => {
                const left = totalDurationMs > 0 ? (span.startMs / totalDurationMs) * 100 : 0;
                const width = totalDurationMs > 0 && span.durationMs
                  ? Math.max((span.durationMs / totalDurationMs) * 100, 2)
                  : 2;
                const indent = span.parentSpanId ? "ml-6" : "";

                return (
                  <button
                    key={span.spanId}
                    className={cn(
                      "w-full text-left rounded-md p-2 hover:bg-muted/50 transition-colors",
                      selectedSpanId === span.spanId && "bg-muted",
                      indent,
                    )}
                    onClick={() => setSelectedSpanId(selectedSpanId === span.spanId ? null : span.spanId)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", TYPE_COLORS[span.type] ?? "bg-gray-400")} />
                      <span className="text-xs font-medium truncate">{span.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                        {formatMs(span.durationMs)}
                      </span>
                    </div>
                    {/* Timeline bar */}
                    <div className="h-2 bg-muted rounded-full relative overflow-hidden">
                      <div
                        className={cn("absolute h-full rounded-full", TYPE_COLORS[span.type] ?? "bg-gray-400")}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail panel */}
            {selectedSpan && <SpanDetail span={selectedSpan} />}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
