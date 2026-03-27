diff --git a/apps/web/client/src/components/agency/AgencyToolbar.tsx b/apps/web/client/src/components/agency/AgencyToolbar.tsx
index 59a5ba61..f9c61cad 100644
--- a/apps/web/client/src/components/agency/AgencyToolbar.tsx
+++ b/apps/web/client/src/components/agency/AgencyToolbar.tsx
@@ -13,6 +13,7 @@ import {
   History,
   Sparkles,
   Brain,
+  Activity,
 } from "lucide-react";
 import { cn } from "@/lib/utils";
 import { ModelPicker } from "./ModelPicker";
@@ -36,6 +37,7 @@ interface AgencyToolbarProps {
   onUndo?: () => void;
   onRedo?: () => void;
   onHistory?: () => void;
+  onRunHistory?: () => void;
   onAutoCreate?: () => void;
   readOnly?: boolean;
 }
@@ -65,6 +67,7 @@ export function AgencyToolbar({
   onUndo,
   onRedo,
   onHistory,
+  onRunHistory,
   onAutoCreate,
   readOnly = false,
 }: AgencyToolbarProps) {
@@ -165,6 +168,11 @@ export function AgencyToolbar({
             AI Creator
           </Button>
         )}
+        {onRunHistory && (
+          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRunHistory} title="Run history">
+            <Activity className="h-4 w-4" />
+          </Button>
+        )}
         {onHistory && (
           <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onHistory} title="Version history">
             <History className="h-4 w-4" />
diff --git a/apps/web/client/src/components/agency/RunHistoryPanel.tsx b/apps/web/client/src/components/agency/RunHistoryPanel.tsx
new file mode 100644
index 00000000..ba15f6e1
--- /dev/null
+++ b/apps/web/client/src/components/agency/RunHistoryPanel.tsx
@@ -0,0 +1,182 @@
+import { useState } from "react";
+import { trpc } from "@/lib/trpc";
+import { Button } from "@/components/ui/button";
+import { Badge } from "@/components/ui/badge";
+import {
+  Sheet,
+  SheetContent,
+  SheetHeader,
+  SheetTitle,
+} from "@/components/ui/sheet";
+import {
+  Select,
+  SelectContent,
+  SelectItem,
+  SelectTrigger,
+  SelectValue,
+} from "@/components/ui/select";
+import { Loader2, ChevronRight, Clock, Coins, Cpu } from "lucide-react";
+import { TraceViewerTimeline } from "./TraceViewerTimeline";
+
+interface RunHistoryPanelProps {
+  agencyId: string;
+  open: boolean;
+  onClose: () => void;
+}
+
+const STATUS_BADGE: Record<string, { variant: "default" | "destructive" | "secondary" | "outline"; label: string }> = {
+  completed: { variant: "default", label: "Completed" },
+  failed: { variant: "destructive", label: "Failed" },
+  cancelled: { variant: "secondary", label: "Cancelled" },
+  timeout: { variant: "outline", label: "Timeout" },
+  running: { variant: "secondary", label: "Running" },
+};
+
+function formatDuration(ms: number | null): string {
+  if (ms == null) return "—";
+  if (ms < 1000) return `${Math.round(ms)}ms`;
+  return `${(ms / 1000).toFixed(1)}s`;
+}
+
+function formatCost(cost: string | null): string {
+  if (!cost) return "—";
+  const num = parseFloat(cost);
+  if (isNaN(num)) return "—";
+  return `$${num.toFixed(4)}`;
+}
+
+export function RunHistoryPanel({ agencyId, open, onClose }: RunHistoryPanelProps) {
+  const [statusFilter, setStatusFilter] = useState<string>("all");
+  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
+  const [offset, setOffset] = useState(0);
+  const LIMIT = 20;
+
+  const { data, isLoading } = trpc.agency.listRunTraces.useQuery(
+    {
+      agencyId,
+      limit: LIMIT,
+      offset,
+      status: statusFilter === "all" ? undefined : statusFilter,
+    },
+    { enabled: open },
+  );
+
+  const traces = data?.traces ?? [];
+  const total = data?.total ?? 0;
+
+  return (
+    <>
+      <Sheet open={open && !selectedTraceId} onOpenChange={(v) => !v && onClose()}>
+        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
+          <SheetHeader>
+            <SheetTitle>Run History</SheetTitle>
+          </SheetHeader>
+
+          <div className="mt-4 mb-3">
+            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setOffset(0); }}>
+              <SelectTrigger className="w-36 h-8 text-xs">
+                <SelectValue placeholder="Filter status" />
+              </SelectTrigger>
+              <SelectContent>
+                <SelectItem value="all">All statuses</SelectItem>
+                <SelectItem value="completed">Completed</SelectItem>
+                <SelectItem value="failed">Failed</SelectItem>
+                <SelectItem value="cancelled">Cancelled</SelectItem>
+              </SelectContent>
+            </Select>
+          </div>
+
+          {isLoading && (
+            <div className="flex items-center justify-center py-12">
+              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
+            </div>
+          )}
+
+          {!isLoading && traces.length === 0 && (
+            <div className="text-center py-12 text-muted-foreground text-sm">
+              No run traces found.
+            </div>
+          )}
+
+          <div className="space-y-1">
+            {traces.map((trace) => {
+              const badge = STATUS_BADGE[trace.status ?? ""] ?? STATUS_BADGE.running;
+              return (
+                <button
+                  key={trace.id}
+                  className="w-full flex items-center gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
+                  onClick={() => setSelectedTraceId(trace.id)}
+                >
+                  <div className="flex-1 min-w-0">
+                    <div className="flex items-center gap-2 mb-1">
+                      <span className="text-xs font-mono text-muted-foreground truncate max-w-32">
+                        {trace.runId.slice(0, 8)}
+                      </span>
+                      <Badge variant={badge.variant} className="text-[10px] px-1.5 py-0">
+                        {badge.label}
+                      </Badge>
+                    </div>
+                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
+                      <span className="flex items-center gap-1">
+                        <Clock className="h-3 w-3" />
+                        {formatDuration(trace.durationMs)}
+                      </span>
+                      <span className="flex items-center gap-1">
+                        <Cpu className="h-3 w-3" />
+                        {trace.totalTokens?.toLocaleString() ?? "—"}
+                      </span>
+                      <span className="flex items-center gap-1">
+                        <Coins className="h-3 w-3" />
+                        {formatCost(trace.totalCost)}
+                      </span>
+                    </div>
+                    <div className="text-[10px] text-muted-foreground mt-0.5">
+                      {new Date(trace.createdAt).toLocaleString()}
+                    </div>
+                  </div>
+                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
+                </button>
+              );
+            })}
+          </div>
+
+          {total > LIMIT && (
+            <div className="flex items-center justify-between mt-4 pt-3 border-t">
+              <span className="text-xs text-muted-foreground">
+                {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
+              </span>
+              <div className="flex gap-1">
+                <Button
+                  variant="outline"
+                  size="sm"
+                  className="h-7 text-xs"
+                  disabled={offset === 0}
+                  onClick={() => setOffset(Math.max(0, offset - LIMIT))}
+                >
+                  Previous
+                </Button>
+                <Button
+                  variant="outline"
+                  size="sm"
+                  className="h-7 text-xs"
+                  disabled={offset + LIMIT >= total}
+                  onClick={() => setOffset(offset + LIMIT)}
+                >
+                  Next
+                </Button>
+              </div>
+            </div>
+          )}
+        </SheetContent>
+      </Sheet>
+
+      {selectedTraceId && (
+        <TraceViewerTimeline
+          traceId={selectedTraceId}
+          open={!!selectedTraceId}
+          onClose={() => setSelectedTraceId(null)}
+        />
+      )}
+    </>
+  );
+}
diff --git a/apps/web/client/src/components/agency/TraceViewerTimeline.tsx b/apps/web/client/src/components/agency/TraceViewerTimeline.tsx
new file mode 100644
index 00000000..9b0ed50a
--- /dev/null
+++ b/apps/web/client/src/components/agency/TraceViewerTimeline.tsx
@@ -0,0 +1,221 @@
+import { useState } from "react";
+import { trpc } from "@/lib/trpc";
+import { Badge } from "@/components/ui/badge";
+import {
+  Sheet,
+  SheetContent,
+  SheetHeader,
+  SheetTitle,
+} from "@/components/ui/sheet";
+import { Loader2, Clock, Coins, Cpu, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
+import { cn } from "@/lib/utils";
+
+interface TraceViewerTimelineProps {
+  traceId: string;
+  open: boolean;
+  onClose: () => void;
+}
+
+interface TraceSpan {
+  spanId: string;
+  parentSpanId: string | null;
+  name: string;
+  type: string;
+  startMs: number;
+  endMs: number | null;
+  durationMs: number | null;
+  input: string | null;
+  output: string | null;
+  tokens: number;
+  cost: number;
+  toolCalls: Array<{ toolId: string; name: string; durationMs: number }>;
+  guardrails: Array<{ name: string; passed: boolean; durationMs: number }>;
+  error: string | null;
+  metadata: Record<string, unknown>;
+}
+
+const TYPE_COLORS: Record<string, string> = {
+  agent_turn: "bg-blue-500",
+  tool_call: "bg-emerald-500",
+  guardrail: "bg-orange-500",
+};
+
+const TYPE_LABELS: Record<string, string> = {
+  agent_turn: "Agent",
+  tool_call: "Tool",
+  guardrail: "Guard",
+};
+
+function formatMs(ms: number | null): string {
+  if (ms == null) return "—";
+  if (ms < 1000) return `${Math.round(ms)}ms`;
+  return `${(ms / 1000).toFixed(2)}s`;
+}
+
+function CollapsibleText({ label, text }: { label: string; text: string | null }) {
+  const [expanded, setExpanded] = useState(false);
+  if (!text) return null;
+
+  return (
+    <div className="mt-2">
+      <button
+        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
+        onClick={() => setExpanded(!expanded)}
+      >
+        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
+        {label}
+      </button>
+      {expanded && (
+        <pre className="mt-1 text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-words">
+          {text}
+        </pre>
+      )}
+    </div>
+  );
+}
+
+function SpanDetail({ span }: { span: TraceSpan }) {
+  return (
+    <div className="border rounded-md p-3 mt-2 bg-background">
+      <div className="flex items-center gap-2 mb-2">
+        <div className={cn("w-2 h-2 rounded-full", TYPE_COLORS[span.type] ?? "bg-gray-400")} />
+        <span className="font-medium text-sm">{span.name}</span>
+        <Badge variant="outline" className="text-[10px]">
+          {TYPE_LABELS[span.type] ?? span.type}
+        </Badge>
+      </div>
+
+      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mb-2">
+        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatMs(span.durationMs)}</span>
+        <span className="flex items-center gap-1"><Cpu className="h-3 w-3" /> {span.tokens.toLocaleString()} tok</span>
+        <span className="flex items-center gap-1"><Coins className="h-3 w-3" /> ${span.cost.toFixed(4)}</span>
+      </div>
+
+      {span.error && (
+        <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded p-2 mb-2">
+          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
+          <span>{span.error}</span>
+        </div>
+      )}
+
+      {span.toolCalls.length > 0 && (
+        <div className="text-xs mt-1">
+          <span className="font-medium text-muted-foreground">Tool Calls:</span>
+          {span.toolCalls.map((tc, i) => (
+            <span key={i} className="ml-2 text-muted-foreground">
+              {tc.name} ({formatMs(tc.durationMs)})
+            </span>
+          ))}
+        </div>
+      )}
+
+      {span.guardrails.length > 0 && (
+        <div className="text-xs mt-1">
+          <span className="font-medium text-muted-foreground">Guardrails:</span>
+          {span.guardrails.map((gr, i) => (
+            <span key={i} className={cn("ml-2", gr.passed ? "text-green-600" : "text-red-600")}>
+              {gr.name} ({gr.passed ? "pass" : "fail"})
+            </span>
+          ))}
+        </div>
+      )}
+
+      <CollapsibleText label="Input" text={span.input} />
+      <CollapsibleText label="Output" text={span.output} />
+    </div>
+  );
+}
+
+export function TraceViewerTimeline({ traceId, open, onClose }: TraceViewerTimelineProps) {
+  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
+
+  const { data: trace, isLoading } = trpc.agency.getRunTrace.useQuery(
+    { traceId },
+    { enabled: open },
+  );
+
+  const traceData = trace?.trace as { version: number; spans: TraceSpan[] } | undefined;
+  const spans = traceData?.spans ?? [];
+  const totalDurationMs = trace?.durationMs ?? (spans.length > 0 ? Math.max(...spans.map((s) => s.endMs ?? 0)) : 0);
+
+  const selectedSpan = selectedSpanId ? spans.find((s) => s.spanId === selectedSpanId) : null;
+
+  return (
+    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
+      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] overflow-y-auto">
+        <SheetHeader>
+          <SheetTitle>Trace Viewer</SheetTitle>
+        </SheetHeader>
+
+        {isLoading && (
+          <div className="flex items-center justify-center py-12">
+            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
+          </div>
+        )}
+
+        {trace && (
+          <>
+            {/* Summary bar */}
+            <div className="flex items-center gap-4 mt-4 mb-4 p-3 rounded-md bg-muted/50 border">
+              <Badge
+                variant={trace.status === "completed" ? "default" : trace.status === "failed" ? "destructive" : "secondary"}
+              >
+                {trace.status}
+              </Badge>
+              <span className="flex items-center gap-1 text-sm">
+                <Clock className="h-3.5 w-3.5" /> {formatMs(trace.durationMs)}
+              </span>
+              <span className="flex items-center gap-1 text-sm">
+                <Cpu className="h-3.5 w-3.5" /> {trace.totalTokens?.toLocaleString() ?? 0} tokens
+              </span>
+              <span className="flex items-center gap-1 text-sm">
+                <Coins className="h-3.5 w-3.5" /> ${parseFloat(trace.totalCost ?? "0").toFixed(4)}
+              </span>
+            </div>
+
+            {/* Timeline */}
+            <div className="space-y-1">
+              {spans.map((span) => {
+                const left = totalDurationMs > 0 ? (span.startMs / totalDurationMs) * 100 : 0;
+                const width = totalDurationMs > 0 && span.durationMs
+                  ? Math.max((span.durationMs / totalDurationMs) * 100, 2)
+                  : 2;
+                const indent = span.parentSpanId ? "ml-6" : "";
+
+                return (
+                  <button
+                    key={span.spanId}
+                    className={cn(
+                      "w-full text-left rounded-md p-2 hover:bg-muted/50 transition-colors",
+                      selectedSpanId === span.spanId && "bg-muted",
+                      indent,
+                    )}
+                    onClick={() => setSelectedSpanId(selectedSpanId === span.spanId ? null : span.spanId)}
+                  >
+                    <div className="flex items-center gap-2 mb-1">
+                      <div className={cn("w-2 h-2 rounded-full shrink-0", TYPE_COLORS[span.type] ?? "bg-gray-400")} />
+                      <span className="text-xs font-medium truncate">{span.name}</span>
+                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
+                        {formatMs(span.durationMs)}
+                      </span>
+                    </div>
+                    {/* Timeline bar */}
+                    <div className="h-2 bg-muted rounded-full relative overflow-hidden">
+                      <div
+                        className={cn("absolute h-full rounded-full", TYPE_COLORS[span.type] ?? "bg-gray-400")}
+                        style={{ left: `${left}%`, width: `${width}%` }}
+                      />
+                    </div>
+                  </button>
+                );
+              })}
+            </div>
+
+            {/* Detail panel */}
+            {selectedSpan && <SpanDetail span={selectedSpan} />}
+          </>
+        )}
+      </SheetContent>
+    </Sheet>
+  );
+}
diff --git a/apps/web/client/src/pages/AgencyBuilder.tsx b/apps/web/client/src/pages/AgencyBuilder.tsx
index 7bc675d1..211a3534 100644
--- a/apps/web/client/src/pages/AgencyBuilder.tsx
+++ b/apps/web/client/src/pages/AgencyBuilder.tsx
@@ -29,6 +29,7 @@ import { NodePropertyPanel } from "@/components/agency/NodePropertyPanel";
 import { AgencyToolbar } from "@/components/agency/AgencyToolbar";
 import { AgencySidebar } from "@/components/agency/AgencySidebar";
 import { AgencyVersionHistory } from "@/components/agency/AgencyVersionHistory";
+import { RunHistoryPanel } from "@/components/agency/RunHistoryPanel";
 import { AutoCreateAgencyModal } from "@/components/agency/AutoCreateAgencyModal";
 import { useAgencyValidation } from "@/hooks/useAgencyValidation";
 import { useAgencyHistory } from "@/hooks/useAgencyHistory";
@@ -203,6 +204,7 @@ function AgencyCanvas() {
   // useReactFlow() is more reliable than onInit — always returns the live instance from context
   const rfInstance = useReactFlow();
   const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
+  const [runHistoryOpen, setRunHistoryOpen] = useState(false);
   const [autoCreateOpen, setAutoCreateOpen] = useState(false);
   const canvasInitRef = useRef(false);
   const nodeCounterRef = useRef(0);
@@ -801,6 +803,7 @@ function AgencyCanvas() {
         onUndo={() => undo(setNodes, setEdges)}
         onRedo={() => redo(setNodes, setEdges)}
         onHistory={() => setVersionHistoryOpen(true)}
+        onRunHistory={() => setRunHistoryOpen(true)}
         onAutoCreate={() => setAutoCreateOpen(true)}
         readOnly={!canEdit}
       />
@@ -814,6 +817,15 @@ function AgencyCanvas() {
         />
       )}
 
+      {/* Run history drawer */}
+      {!isNew && agencyId && (
+        <RunHistoryPanel
+          agencyId={agencyId}
+          open={runHistoryOpen}
+          onClose={() => setRunHistoryOpen(false)}
+        />
+      )}
+
       {/* AI Agency Creator modal */}
       <AutoCreateAgencyModal
         open={autoCreateOpen}
diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index 7ebbc7da..718b6ed1 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -24,6 +24,7 @@ import {
   agencyGuardrails,
   agencyAgentGuardrails,
   agencySharedTools,
+  agencyRunTraces,
   userGroups,
   users,
   systemSettings,
@@ -3843,4 +3844,61 @@ export const agencyRouter = router({
         });
       }
     }),
+
+  // ── Run Trace Procedures (section-15) ────────────────────────────────────
+
+  listRunTraces: protectedProcedure
+    .input(
+      z.object({
+        agencyId: z.string().min(1),
+        startDate: z.date().optional(),
+        endDate: z.date().optional(),
+        status: z.string().optional(),
+        limit: z.number().min(1).max(100).default(20),
+        offset: z.number().min(0).default(0),
+      }),
+    )
+    .query(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await assertAgencyEnabled(tenantId);
+
+      // Verify agency ownership
+      const [agency] = await db
+        .select({ id: agencies.id })
+        .from(agencies)
+        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)))
+        .limit(1);
+      if (!agency) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
+
+      const { listRunTraces } = await import("../services/agencyTraceService");
+      return listRunTraces({
+        agencyId: input.agencyId,
+        tenantId,
+        startDate: input.startDate,
+        endDate: input.endDate,
+        status: input.status,
+        limit: input.limit,
+        offset: input.offset,
+      });
+    }),
+
+  getRunTrace: protectedProcedure
+    .input(
+      z.object({
+        traceId: z.string().min(1),
+      }),
+    )
+    .query(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await assertAgencyEnabled(tenantId);
+
+      const { getRunTrace } = await import("../services/agencyTraceService");
+      const trace = await getRunTrace(input.traceId, tenantId);
+      if (!trace) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Trace not found" });
+      }
+      return trace;
+    }),
 });
diff --git a/apps/web/server/routes/agencyStream.ts b/apps/web/server/routes/agencyStream.ts
index 4e94ebe0..8ce6991b 100644
--- a/apps/web/server/routes/agencyStream.ts
+++ b/apps/web/server/routes/agencyStream.ts
@@ -21,6 +21,7 @@ import { sdk } from "../_core/sdk";
 import { getFeatureFlag } from "../services/featureFlags";
 import { resolveTenantIdVarchar } from "../services/tenantContext";
 import type { TenantRequest } from "../_core/tenant";
+import { persistRunTrace } from "../services/agencyTraceService";
 
 const agencyStreamRouter = Router();
 
@@ -262,6 +263,13 @@ agencyStreamRouter.post(
           res.write(`event: ${ev.event}\n`);
           res.write(`data: ${message}\n\n`);
 
+          // Persist run trace when trace_complete arrives
+          if (ev.event === "trace_complete" && ev.data) {
+            persistRunTrace(ev.data).catch((err: unknown) => {
+              console.error("[AgencyStream] Failed to persist trace:", err);
+            });
+          }
+
           // Auto-close on terminal events
           if (ev.event === "run_complete" || ev.event === "error") {
             cleanup();
diff --git a/apps/web/server/services/__tests__/agencyTraces.test.ts b/apps/web/server/services/__tests__/agencyTraces.test.ts
new file mode 100644
index 00000000..753a134f
--- /dev/null
+++ b/apps/web/server/services/__tests__/agencyTraces.test.ts
@@ -0,0 +1,204 @@
+/**
+ * Tests for agency trace service — persistRunTrace, getRunTrace, sweepExpiredTraces.
+ * Tests focus on the service functions in isolation with mocked DB.
+ */
+
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Build a self-referencing chainable mock that also acts as a thenable (Promise-like).
+// This handles drizzle's builder pattern where the final chain step is awaited.
+function createChainableMock(defaultResult: unknown = []) {
+  let _result: unknown = defaultResult;
+  const mock: Record<string, ReturnType<typeof vi.fn>> & { _setResult: (v: unknown) => void } = {
+    _setResult: (v: unknown) => { _result = v; },
+  } as any;
+
+  const methods = ["insert", "values", "select", "from", "where", "orderBy", "limit", "offset"];
+  for (const m of methods) {
+    mock[m] = vi.fn().mockImplementation(() => {
+      // Return a proxy that is both chainable and thenable
+      return new Proxy(mock, {
+        get(target, prop) {
+          if (prop === "then") {
+            // Make it thenable — resolve with current _result
+            return (resolve: (v: unknown) => void) => resolve(_result);
+          }
+          return target[prop as string];
+        },
+      });
+    });
+  }
+  mock.execute = vi.fn().mockResolvedValue({ rowCount: 0 });
+
+  return mock;
+}
+
+let mockDb: ReturnType<typeof createChainableMock>;
+
+vi.mock("../../db", () => ({
+  getDb: vi.fn(() => mockDb),
+}));
+
+vi.mock("../../../drizzle/schema", () => ({
+  agencyRunTraces: {
+    id: "id",
+    runId: "runId",
+    agencyId: "agencyId",
+    tenantId: "tenantId",
+    createdBy: "createdBy",
+    trace: "trace",
+    durationMs: "durationMs",
+    totalTokens: "totalTokens",
+    totalCost: "totalCost",
+    status: "status",
+    createdAt: "createdAt",
+  },
+}));
+
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn((...args: unknown[]) => ({ _op: "eq", args })),
+  and: vi.fn((...args: unknown[]) => ({ _op: "and", args })),
+  desc: vi.fn((col: unknown) => ({ _op: "desc", col })),
+  gte: vi.fn((...args: unknown[]) => ({ _op: "gte", args })),
+  lte: vi.fn((...args: unknown[]) => ({ _op: "lte", args })),
+  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
+    _tag: "sql",
+    strings,
+    values,
+  })),
+}));
+
+import {
+  persistRunTrace,
+  listRunTraces,
+  getRunTrace,
+  sweepExpiredTraces,
+} from "../agencyTraceService";
+
+beforeEach(() => {
+  vi.clearAllMocks();
+  mockDb = createChainableMock();
+});
+
+describe("persistRunTrace", () => {
+  it("inserts a trace row with correct fields", async () => {
+    await persistRunTrace({
+      runId: "run-1",
+      agencyId: "agency-1",
+      tenantId: "tenant-A",
+      createdBy: 42,
+      trace: { version: 1, spans: [] },
+      durationMs: 1500,
+      totalTokens: 300,
+      totalCost: 0.005,
+      status: "completed",
+    });
+
+    expect(mockDb.insert).toHaveBeenCalled();
+    expect(mockDb.values).toHaveBeenCalledWith(
+      expect.objectContaining({
+        runId: "run-1",
+        agencyId: "agency-1",
+        tenantId: "tenant-A",
+        createdBy: 42,
+        status: "completed",
+      }),
+    );
+  });
+});
+
+describe("listRunTraces", () => {
+  it("calls select, from, where, orderBy, limit, offset", async () => {
+    const result = await listRunTraces({
+      agencyId: "agency-1",
+      tenantId: "tenant-A",
+    });
+
+    expect(mockDb.select).toHaveBeenCalled();
+    expect(mockDb.from).toHaveBeenCalled();
+    expect(mockDb.where).toHaveBeenCalled();
+    expect(result).toHaveProperty("traces");
+    expect(result).toHaveProperty("total");
+  });
+
+  it("uses default limit of 20 and offset of 0", async () => {
+    await listRunTraces({
+      agencyId: "agency-1",
+      tenantId: "tenant-A",
+    });
+
+    expect(mockDb.limit).toHaveBeenCalledWith(20);
+    expect(mockDb.offset).toHaveBeenCalledWith(0);
+  });
+
+  it("clamps limit to max 100", async () => {
+    await listRunTraces({
+      agencyId: "agency-1",
+      tenantId: "tenant-A",
+      limit: 500,
+    });
+
+    expect(mockDb.limit).toHaveBeenCalledWith(100);
+  });
+
+  it("passes custom offset", async () => {
+    await listRunTraces({
+      agencyId: "agency-1",
+      tenantId: "tenant-A",
+      limit: 10,
+      offset: 20,
+    });
+
+    expect(mockDb.limit).toHaveBeenCalledWith(10);
+    expect(mockDb.offset).toHaveBeenCalledWith(20);
+  });
+});
+
+describe("getRunTrace", () => {
+  it("returns trace for matching traceId and tenantId", async () => {
+    const mockTrace = {
+      id: "t1",
+      runId: "r1",
+      tenantId: "tenant-A",
+      trace: { version: 1, spans: [{ spanId: "s1" }] },
+    };
+    mockDb._setResult([mockTrace]);
+
+    const result = await getRunTrace("t1", "tenant-A");
+    expect(result).toEqual(mockTrace);
+    expect(mockDb.where).toHaveBeenCalled();
+  });
+
+  it("returns null when trace not found", async () => {
+    mockDb._setResult([]);
+
+    const result = await getRunTrace("nonexistent", "tenant-A");
+    expect(result).toBeNull();
+  });
+});
+
+describe("sweepExpiredTraces", () => {
+  it("deletes traces older than retention days", async () => {
+    mockDb.execute.mockResolvedValueOnce({ rowCount: 5 });
+
+    const deleted = await sweepExpiredTraces("tenant-A", 30);
+    expect(deleted).toBe(5);
+    expect(mockDb.execute).toHaveBeenCalled();
+  });
+
+  it("batches deletes until fewer than batch size returned", async () => {
+    mockDb.execute.mockResolvedValueOnce({ rowCount: 1000 });
+    mockDb.execute.mockResolvedValueOnce({ rowCount: 200 });
+
+    const deleted = await sweepExpiredTraces("tenant-A", 7);
+    expect(deleted).toBe(1200);
+    expect(mockDb.execute).toHaveBeenCalledTimes(2);
+  });
+
+  it("returns 0 when no traces to delete", async () => {
+    mockDb.execute.mockResolvedValueOnce({ rowCount: 0 });
+
+    const deleted = await sweepExpiredTraces("tenant-A", 30);
+    expect(deleted).toBe(0);
+  });
+});
diff --git a/apps/web/server/services/agencyTraceService.ts b/apps/web/server/services/agencyTraceService.ts
new file mode 100644
index 00000000..c642787a
--- /dev/null
+++ b/apps/web/server/services/agencyTraceService.ts
@@ -0,0 +1,178 @@
+/**
+ * Agency Trace Service — persists run traces to agency_run_traces table
+ * and provides query helpers for the tRPC router.
+ */
+
+import { getDb } from "../db";
+import { agencyRunTraces } from "../../drizzle/schema";
+import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
+import crypto from "crypto";
+
+interface TracePayload {
+  runId: string;
+  agencyId: string;
+  tenantId: string;
+  createdBy?: number | null;
+  trace: Record<string, unknown>;
+  durationMs?: number | null;
+  totalTokens?: number | null;
+  totalCost?: number | null;
+  status?: string | null;
+}
+
+/**
+ * Persist a run trace emitted by the Python orchestrator via SSE.
+ * Called from agencyStream.ts when a trace_complete event arrives.
+ */
+export async function persistRunTrace(payload: TracePayload): Promise<void> {
+  const db = await getDb();
+  if (!db) return;
+
+  const id = crypto.randomUUID();
+
+  await db.insert(agencyRunTraces).values({
+    id,
+    runId: payload.runId,
+    agencyId: payload.agencyId,
+    tenantId: payload.tenantId,
+    createdBy: payload.createdBy ?? null,
+    trace: payload.trace,
+    durationMs: payload.durationMs ? Math.round(payload.durationMs) : null,
+    totalTokens: payload.totalTokens ?? null,
+    totalCost: payload.totalCost != null ? String(payload.totalCost) : null,
+    status: payload.status ?? "unknown",
+  });
+}
+
+/**
+ * List run traces for an agency with optional filters.
+ */
+export async function listRunTraces(opts: {
+  agencyId: string;
+  tenantId: string;
+  startDate?: Date;
+  endDate?: Date;
+  status?: string;
+  limit?: number;
+  offset?: number;
+}): Promise<{
+  traces: Array<{
+    id: string;
+    runId: string;
+    status: string | null;
+    durationMs: number | null;
+    totalTokens: number | null;
+    totalCost: string | null;
+    createdAt: Date;
+  }>;
+  total: number;
+}> {
+  const db = await getDb();
+  if (!db) return { traces: [], total: 0 };
+
+  const limit = Math.min(opts.limit ?? 20, 100);
+  const offset = opts.offset ?? 0;
+
+  const conditions = [
+    eq(agencyRunTraces.agencyId, opts.agencyId),
+    eq(agencyRunTraces.tenantId, opts.tenantId),
+  ];
+
+  if (opts.startDate) {
+    conditions.push(gte(agencyRunTraces.createdAt, opts.startDate));
+  }
+  if (opts.endDate) {
+    conditions.push(lte(agencyRunTraces.createdAt, opts.endDate));
+  }
+  if (opts.status) {
+    conditions.push(eq(agencyRunTraces.status, opts.status));
+  }
+
+  const whereClause = and(...conditions);
+
+  const [traces, countResult] = await Promise.all([
+    db
+      .select({
+        id: agencyRunTraces.id,
+        runId: agencyRunTraces.runId,
+        status: agencyRunTraces.status,
+        durationMs: agencyRunTraces.durationMs,
+        totalTokens: agencyRunTraces.totalTokens,
+        totalCost: agencyRunTraces.totalCost,
+        createdAt: agencyRunTraces.createdAt,
+      })
+      .from(agencyRunTraces)
+      .where(whereClause)
+      .orderBy(desc(agencyRunTraces.createdAt))
+      .limit(limit)
+      .offset(offset),
+    db
+      .select({ count: sql<number>`count(*)::int` })
+      .from(agencyRunTraces)
+      .where(whereClause),
+  ]);
+
+  return {
+    traces,
+    total: countResult[0]?.count ?? 0,
+  };
+}
+
+/**
+ * Get a single run trace with full JSONB trace data.
+ * Enforces tenant isolation.
+ */
+export async function getRunTrace(
+  traceId: string,
+  tenantId: string,
+): Promise<typeof agencyRunTraces.$inferSelect | null> {
+  const db = await getDb();
+  if (!db) return null;
+
+  const [row] = await db
+    .select()
+    .from(agencyRunTraces)
+    .where(
+      and(
+        eq(agencyRunTraces.id, traceId),
+        eq(agencyRunTraces.tenantId, tenantId),
+      ),
+    )
+    .limit(1);
+
+  return row ?? null;
+}
+
+/**
+ * Delete traces older than the given retention days for a specific tenant.
+ * Returns count of deleted rows.
+ */
+export async function sweepExpiredTraces(
+  tenantId: string,
+  retentionDays: number,
+): Promise<number> {
+  const db = await getDb();
+  if (!db) return 0;
+
+  const cutoff = new Date();
+  cutoff.setDate(cutoff.getDate() - retentionDays);
+
+  let totalDeleted = 0;
+  const BATCH_SIZE = 1000;
+
+  // Batched delete to avoid long-running transactions
+  while (true) {
+    const result = await db.execute(
+      sql`DELETE FROM agency_run_traces
+          WHERE "tenantId" = ${tenantId}
+            AND "createdAt" < ${cutoff}
+          LIMIT ${BATCH_SIZE}`,
+    );
+    // drizzle returns rowCount on the result
+    const deleted = (result as any).rowCount ?? 0;
+    totalDeleted += deleted;
+    if (deleted < BATCH_SIZE) break;
+  }
+
+  return totalDeleted;
+}
diff --git a/apps/web/server/services/scheduler.ts b/apps/web/server/services/scheduler.ts
index 22968e25..5dc4dffa 100644
--- a/apps/web/server/services/scheduler.ts
+++ b/apps/web/server/services/scheduler.ts
@@ -19,6 +19,7 @@ import {
   conversations,
   messages,
   autoDraftSchedules,
+  systemSettings,
 } from "../../drizzle/schema";
 import { eq, and, lte, isNull, sql } from "drizzle-orm";
 import { deductCredits, hasEnoughCredits, calculateCreditsForLLM } from "./creditService";
@@ -878,3 +879,54 @@ export async function sweepDueAutoDraftSchedules(): Promise<number> {
 
   return dispatched;
 }
+
+/**
+ * Sweep expired agency run traces. Default retention: 30 days.
+ * Configurable via system_settings category="agency", key="trace_retention_days".
+ */
+export async function sweepExpiredRunTraces(): Promise<number> {
+  const db = await getDb();
+  if (!db) return 0;
+
+  const { sweepExpiredTraces } = await import("./agencyTraceService");
+
+  // Check global retention override
+  const DEFAULT_RETENTION_DAYS = 30;
+  let retentionDays = DEFAULT_RETENTION_DAYS;
+  const [override] = await db
+    .select({ value: systemSettings.value })
+    .from(systemSettings)
+    .where(
+      and(
+        eq(systemSettings.category, "agency"),
+        eq(systemSettings.key, "trace_retention_days"),
+      ),
+    )
+    .limit(1);
+  if (override?.value) {
+    const parsed = parseInt(String(override.value), 10);
+    if (!isNaN(parsed) && parsed > 0) {
+      retentionDays = parsed;
+    }
+  }
+
+  // Get distinct tenants that have traces
+  const tenants = await db.execute(
+    sql`SELECT DISTINCT "tenantId" FROM agency_run_traces`,
+  );
+  const tenantRows = (tenants as any).rows ?? tenants ?? [];
+
+  let totalDeleted = 0;
+  for (const row of tenantRows) {
+    const tenantId = row.tenantId;
+    if (!tenantId) continue;
+
+    const deleted = await sweepExpiredTraces(tenantId, retentionDays);
+    if (deleted > 0) {
+      console.log(`[Scheduler] Deleted ${deleted} expired traces for tenant ${tenantId} (retention: ${retentionDays}d)`);
+    }
+    totalDeleted += deleted;
+  }
+
+  return totalDeleted;
+}
diff --git a/apps/web/shared/agencyStreamEvents.ts b/apps/web/shared/agencyStreamEvents.ts
index 7cbc7c60..94c1e8d4 100644
--- a/apps/web/shared/agencyStreamEvents.ts
+++ b/apps/web/shared/agencyStreamEvents.ts
@@ -79,6 +79,23 @@ export interface AgencyRunCompleteEvent {
   data: { runId: string; usage: { tokens: number; cost: number } };
 }
 
+export interface AgencyTraceCompleteEvent {
+  event: "trace_complete";
+  id: string;
+  ts: string;
+  data: {
+    runId: string;
+    agencyId: string;
+    tenantId: string;
+    createdBy: number | null;
+    trace: { version: number; spans: Array<Record<string, unknown>> };
+    durationMs: number;
+    totalTokens: number;
+    totalCost: number;
+    status: string;
+  };
+}
+
 export interface AgencyErrorEvent {
   event: "error";
   id: string;
@@ -98,6 +115,7 @@ export type AgencyStreamEvent =
   | AgencyGuardrailTriggerEvent
   | AgencyApprovalRequiredEvent
   | AgencyRunCompleteEvent
+  | AgencyTraceCompleteEvent
   | AgencyErrorEvent;
 
 export type AgencyStreamEventType = AgencyStreamEvent["event"];
@@ -114,6 +132,7 @@ export const AGENCY_STREAM_EVENT_TYPES: ReadonlySet<AgencyStreamEventType> =
     "guardrail_trigger",
     "approval_required",
     "run_complete",
+    "trace_complete",
     "error",
   ]);
 
diff --git a/python-backend/app/services/agency_orchestrator.py b/python-backend/app/services/agency_orchestrator.py
index ffdb55f6..1d5673ef 100644
--- a/python-backend/app/services/agency_orchestrator.py
+++ b/python-backend/app/services/agency_orchestrator.py
@@ -27,6 +27,7 @@ from app.services.agency_event_emitter import AgencyEventEmitter, check_cancelle
 from app.services.agency_instruction_resolver import resolve_instructions
 from app.services.agency_output_validator import AgencyOutputValidator
 from app.services.agency_run_context import AgencyRunContext
+from app.services.agency_trace_collector import TraceCollector
 
 logger = structlog.get_logger(__name__)
 
@@ -107,6 +108,7 @@ class AgencyOrchestrator:
         user_context: dict[str, Any] | None = None,
         event_emitter: AgencyEventEmitter | None = None,
         redis_client: Any | None = None,
+        trace_collector: TraceCollector | None = None,
     ):
         self.nodes: dict[str, NodeRow] = {n["id"]: n for n in nodes}
         self.edges: list[EdgeRow] = edges
@@ -120,6 +122,7 @@ class AgencyOrchestrator:
         self.user_context = user_context
         self.event_emitter = event_emitter
         self.redis_client = redis_client
+        self.trace_collector = trace_collector
         self.browser_session_executor = AgencyBrowserSessionExecutor()
         self._round_trip_tracker = RoundTripTracker()
         self._flow_configs: dict[tuple[str, str], FlowConfig] = {}
@@ -188,11 +191,16 @@ class AgencyOrchestrator:
         try:
             result = await self._execute_node(self.entry_node, ctx)
         except Exception as exc:
+            if self.trace_collector:
+                self.trace_collector.set_status("failed")
             if self.event_emitter:
                 await self.event_emitter.emit_error("orchestrator_error", str(exc)[:500])
             raise
 
-        # Capture context snapshot for observability (section-15 will persist it)
+        if self.trace_collector:
+            self.trace_collector.set_status("completed")
+
+        # Capture context snapshot for observability
         ctx.context_snapshot = ctx.shared_context.snapshot()
 
         return result or "", ctx
@@ -201,6 +209,7 @@ class AgencyOrchestrator:
         """Execute a single node and follow its outgoing edges."""
         node_type = node.get("node_type", "agent")
         node_id = node["id"]
+        node_name = node.get("name", node_id)
 
         # Check for cancellation between node executions
         if self.event_emitter and self.redis_client:
@@ -211,6 +220,15 @@ class AgencyOrchestrator:
 
         logger.info("agency_orchestrator_execute_node", node_id=node_id, node_type=node_type)
 
+        # Start trace span for this node
+        span_id: str | None = None
+        if self.trace_collector:
+            span_id = self.trace_collector.start_span(
+                name=f"{node_type}:{node_name}",
+                type="agent_turn" if node_type in AGENT_NODE_TYPES else "tool_call",
+                input_data=ctx.get_context_text()[:500],
+            )
+
         result: str
         match node_type:
             case "agent" | "supervisor":
@@ -259,6 +277,13 @@ class AgencyOrchestrator:
         if result:
             ctx.results[node_id] = result
 
+        # End trace span for this node
+        if self.trace_collector and span_id:
+            self.trace_collector.end_span(
+                span_id,
+                output=result[:500] if result else None,
+            )
+
         # Follow outgoing edges (unless router which already handled routing)
         if node_type not in ("router",):
             outgoing = [e for e in self.edges if e.get("from_node_id") == node_id]
diff --git a/python-backend/app/services/agency_service.py b/python-backend/app/services/agency_service.py
index 1680a2cc..d8d9ecf3 100644
--- a/python-backend/app/services/agency_service.py
+++ b/python-backend/app/services/agency_service.py
@@ -33,6 +33,7 @@ from app.services.agency_result_envelope import parse_agency_result_envelope
 from app.services.agency_tools import resolve_tools_for_agent
 from app.services.agency_audit import log_agency_event, reconcile_credits
 from app.services.agency_orchestrator import AgencyOrchestrator, should_use_orchestrator
+from app.services.agency_trace_collector import TraceCollector
 
 logger = structlog.get_logger(__name__)
 
@@ -909,6 +910,14 @@ class AgencyService:
                 except Exception:
                     logger.warning("agency_event_emitter_init_failed", agency_id=agency_id)
 
+                # Create trace collector for observability
+                trace_collector = TraceCollector(
+                    run_id=run_id,
+                    agency_id=agency_id,
+                    tenant_id=context.tenant_id,
+                    user_id=context.user_id,
+                )
+
                 orchestrator = AgencyOrchestrator(
                     nodes=agents_data,
                     edges=edges_data,
@@ -921,6 +930,7 @@ class AgencyService:
                     user_context=agency_config.user_context,
                     event_emitter=event_emitter,
                     redis_client=redis_client,
+                    trace_collector=trace_collector,
                 )
                 response_text, execution_context = await orchestrator.run_with_context(
                     message=message,
@@ -931,9 +941,12 @@ class AgencyService:
                 for browser_session in execution_context.browser_sessions:
                     yield {"event": "browser_session", "data": browser_session}
                 yield {"event": "token", "data": {"token": response_text}}
-                # Emit run_complete via event emitter for SSE subscribers
+
+                # Persist trace via SSE event emitter (Node.js side persists to agency_run_traces)
+                trace_summary = trace_collector.get_trace_summary()
                 if event_emitter:
-                    await event_emitter.emit_complete({"tokens": 0, "cost": 0})
+                    await event_emitter.emit("trace_complete", trace_summary)
+                    await event_emitter.emit_complete({"tokens": trace_summary.get("totalTokens", 0), "cost": trace_summary.get("totalCost", 0)})
                 yield {"event": "run_finished", "data": {"run_id": run_id, "response": response_text}}
                 return
 
diff --git a/python-backend/app/services/agency_trace_collector.py b/python-backend/app/services/agency_trace_collector.py
new file mode 100644
index 00000000..6373b551
--- /dev/null
+++ b/python-backend/app/services/agency_trace_collector.py
@@ -0,0 +1,217 @@
+"""
+AgencyTraceCollector — builds hierarchical span tree for agency run observability.
+
+Collects timing, token, and cost data for each node execution.  Secret scrubbing
+ensures no API keys or auth tokens leak into persisted traces.  Thread-safe via
+asyncio.Lock for concurrent tool calls within a single agent turn.
+"""
+
+from __future__ import annotations
+
+import asyncio
+import re
+import time
+import uuid
+from dataclasses import dataclass, field
+from typing import Any
+
+import structlog
+
+logger = structlog.get_logger(__name__)
+
+# ── Secret scrubbing patterns ──────────────────────────────────────────────────
+
+_SECRET_PATTERNS: list[re.Pattern[str]] = [
+    re.compile(r"sk-[a-zA-Z0-9]{20,}"),                 # OpenAI-style API keys
+    re.compile(r"Bearer\s+[a-zA-Z0-9._\-]+", re.I),     # Bearer tokens
+    re.compile(r"Authorization:\s*\S+(?:\s+\S+)?", re.I), # Authorization header values (Basic/Bearer + token)
+    re.compile(r"key-[a-zA-Z0-9]{20,}"),                 # generic API key patterns
+    re.compile(r"postgresql://[^\s]+"),                   # connection strings
+]
+
+TOOL_OUTPUT_MAX = 1000
+AGENT_OUTPUT_MAX = 2000
+
+
+def scrub_secrets(text: str | None) -> str | None:
+    """Replace known secret patterns with [REDACTED]."""
+    if text is None:
+        return None
+    if not text:
+        return text
+    for pattern in _SECRET_PATTERNS:
+        text = pattern.sub("[REDACTED]", text)
+    return text
+
+
+def _truncate(text: str | None, max_len: int) -> str | None:
+    if text is None:
+        return None
+    if len(text) <= max_len:
+        return text
+    return text[:max_len] + "..."
+
+
+# ── Span dataclass ─────────────────────────────────────────────────────────────
+
+
+@dataclass
+class TraceSpan:
+    """Single span representing an agent turn, tool call, or guardrail check."""
+
+    span_id: str
+    parent_span_id: str | None
+    name: str
+    type: str  # agent_turn | tool_call | guardrail
+    start_ms: float
+    end_ms: float | None = None
+    duration_ms: float | None = None
+    input_data: str | None = None
+    output: str | None = None
+    tokens: int = 0
+    cost: float = 0.0
+    tool_calls: list[dict[str, Any]] = field(default_factory=list)
+    guardrails: list[dict[str, Any]] = field(default_factory=list)
+    error: str | None = None
+    metadata: dict[str, Any] = field(default_factory=dict)
+
+    def to_dict(self) -> dict[str, Any]:
+        return {
+            "spanId": self.span_id,
+            "parentSpanId": self.parent_span_id,
+            "name": self.name,
+            "type": self.type,
+            "startMs": round(self.start_ms, 2),
+            "endMs": round(self.end_ms, 2) if self.end_ms is not None else None,
+            "durationMs": round(self.duration_ms, 2) if self.duration_ms is not None else None,
+            "input": self.input_data,
+            "output": self.output,
+            "tokens": self.tokens,
+            "cost": self.cost,
+            "toolCalls": self.tool_calls,
+            "guardrails": self.guardrails,
+            "error": self.error,
+            "metadata": self.metadata,
+        }
+
+
+# ── TraceCollector ─────────────────────────────────────────────────────────────
+
+
+class TraceCollector:
+    """Builds a hierarchical trace during an agency orchestrator run."""
+
+    def __init__(
+        self,
+        run_id: str,
+        agency_id: str,
+        tenant_id: str,
+        user_id: int | None = None,
+    ) -> None:
+        self.run_id = run_id
+        self.agency_id = agency_id
+        self.tenant_id = tenant_id
+        self.user_id = user_id
+        self._spans: dict[str, TraceSpan] = {}
+        self._status: str = "running"
+        self._run_start_ms: float = time.monotonic() * 1000
+        self._lock = asyncio.Lock()
+
+    def start_span(
+        self,
+        name: str,
+        type: str,
+        parent_span_id: str | None = None,
+        input_data: str | None = None,
+    ) -> str:
+        """Start a new span. Returns span_id."""
+        span_id = str(uuid.uuid4())
+        now_ms = time.monotonic() * 1000 - self._run_start_ms
+        truncated_input = _truncate(scrub_secrets(input_data), AGENT_OUTPUT_MAX)
+        span = TraceSpan(
+            span_id=span_id,
+            parent_span_id=parent_span_id,
+            name=name,
+            type=type,
+            start_ms=now_ms,
+            input_data=truncated_input,
+        )
+        self._spans[span_id] = span
+        return span_id
+
+    def end_span(
+        self,
+        span_id: str,
+        *,
+        output: str | None = None,
+        tokens: int = 0,
+        cost: float = 0.0,
+        tool_calls: list[dict[str, Any]] | None = None,
+        guardrails: list[dict[str, Any]] | None = None,
+        error: str | None = None,
+    ) -> None:
+        """End a span. Applies secret scrubbing and output truncation."""
+        span = self._spans.get(span_id)
+        if span is None:
+            logger.warning("trace_end_span_not_found", span_id=span_id)
+            return
+
+        now_ms = time.monotonic() * 1000 - self._run_start_ms
+        span.end_ms = now_ms
+        span.duration_ms = now_ms - span.start_ms
+
+        # Determine truncation limit based on span type
+        max_len = TOOL_OUTPUT_MAX if span.type == "tool_call" else AGENT_OUTPUT_MAX
+        span.output = _truncate(scrub_secrets(output), max_len)
+        span.tokens = tokens
+        span.cost = cost
+        if tool_calls:
+            span.tool_calls = tool_calls
+        if guardrails:
+            span.guardrails = guardrails
+        if error:
+            span.error = scrub_secrets(error)
+
+    async def start_span_async(
+        self,
+        name: str,
+        type: str,
+        parent_span_id: str | None = None,
+        input_data: str | None = None,
+    ) -> str:
+        """Thread-safe version of start_span for concurrent tool calls."""
+        async with self._lock:
+            return self.start_span(name, type, parent_span_id, input_data)
+
+    async def end_span_async(self, span_id: str, **kwargs: Any) -> None:
+        """Thread-safe version of end_span for concurrent tool calls."""
+        async with self._lock:
+            self.end_span(span_id, **kwargs)
+
+    def set_status(self, status: str) -> None:
+        """Set the final run status: 'completed', 'failed', 'cancelled', 'timeout'."""
+        self._status = status
+
+    def get_trace_summary(self) -> dict[str, Any]:
+        """Return the full trace dict suitable for INSERT into agency_run_traces."""
+        total_tokens = sum(s.tokens for s in self._spans.values())
+        total_cost = sum(s.cost for s in self._spans.values())
+        end_ms = time.monotonic() * 1000 - self._run_start_ms
+        duration_ms = round(end_ms, 2)
+
+        spans_list = [s.to_dict() for s in self._spans.values()]
+
+        return {
+            "runId": self.run_id,
+            "agencyId": self.agency_id,
+            "tenantId": self.tenant_id,
+            "createdBy": self.user_id,
+            "trace": {
+                "version": 1,
+                "spans": spans_list,
+            },
+            "durationMs": duration_ms,
+            "totalTokens": total_tokens,
+            "totalCost": round(total_cost, 6),
+            "status": self._status,
+        }
diff --git a/python-backend/tests/unit/services/test_agency_trace_collector.py b/python-backend/tests/unit/services/test_agency_trace_collector.py
new file mode 100644
index 00000000..0a0de456
--- /dev/null
+++ b/python-backend/tests/unit/services/test_agency_trace_collector.py
@@ -0,0 +1,184 @@
+"""Tests for agency_trace_collector.py — TraceCollector and secret scrubbing."""
+
+import asyncio
+import time
+
+import pytest
+
+from app.services.agency_trace_collector import (
+    TraceCollector,
+    scrub_secrets,
+)
+
+
+@pytest.mark.unit
+class TestScrubSecrets:
+    def test_none_input(self):
+        assert scrub_secrets(None) is None
+
+    def test_empty_input(self):
+        assert scrub_secrets("") == ""
+
+    def test_openai_key(self):
+        text = "Using key sk-abc123secretkey0123456789xyz"
+        result = scrub_secrets(text)
+        assert "sk-abc123" not in result
+        assert "[REDACTED]" in result
+
+    def test_bearer_token(self):
+        text = "Header: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload"
+        result = scrub_secrets(text)
+        assert "eyJhbGciOi" not in result
+        assert "[REDACTED]" in result
+
+    def test_authorization_header(self):
+        text = "Authorization: Basic dXNlcjpwYXNz"
+        result = scrub_secrets(text)
+        assert "dXNlcjpwYXNz" not in result
+        assert "[REDACTED]" in result
+
+    def test_generic_key_pattern(self):
+        text = "api_key=key-abcdefghij0123456789ab"
+        result = scrub_secrets(text)
+        assert "key-abcdefghij" not in result
+        assert "[REDACTED]" in result
+
+    def test_connection_string(self):
+        text = "db: postgresql://user:pass@host:5432/mydb"
+        result = scrub_secrets(text)
+        assert "postgresql://" not in result
+        assert "[REDACTED]" in result
+
+    def test_no_secrets_unchanged(self):
+        text = "This is a normal output with no secrets."
+        assert scrub_secrets(text) == text
+
+
+@pytest.mark.unit
+class TestTraceCollector:
+    def test_builds_correct_span_hierarchy(self):
+        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
+        agent_span = tc.start_span(name="agent:Researcher", type="agent_turn")
+        tool_span = tc.start_span(
+            name="tool:web-search", type="tool_call", parent_span_id=agent_span
+        )
+
+        tc.end_span(tool_span, output="results...", tokens=150, cost=0.002)
+        tc.end_span(agent_span, output="summary...", tokens=300, cost=0.005)
+
+        summary = tc.get_trace_summary()
+        spans = summary["trace"]["spans"]
+        assert len(spans) == 2
+
+        tool = next(s for s in spans if s["type"] == "tool_call")
+        agent = next(s for s in spans if s["type"] == "agent_turn")
+        assert tool["parentSpanId"] == agent["spanId"]
+        assert tool["durationMs"] is not None
+        assert tool["durationMs"] >= 0
+        assert agent["durationMs"] is not None
+
+    def test_secret_scrubbing_on_end_span(self):
+        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
+        span_id = tc.start_span(name="agent:test", type="agent_turn")
+        tc.end_span(
+            span_id,
+            output="Key is sk-abc123secretkey0123456789xyz and Bearer eyJhbGciOi.token",
+        )
+
+        summary = tc.get_trace_summary()
+        output = summary["trace"]["spans"][0]["output"]
+        assert "sk-abc123" not in output
+        assert "eyJhbGciOi" not in output
+        assert "[REDACTED]" in output
+
+    def test_truncates_tool_output_at_1000_chars(self):
+        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
+        span_id = tc.start_span(name="tool:big", type="tool_call")
+        tc.end_span(span_id, output="x" * 2000)
+
+        span = tc.get_trace_summary()["trace"]["spans"][0]
+        assert len(span["output"]) <= 1003  # 1000 + "..."
+
+    def test_truncates_agent_output_at_2000_chars(self):
+        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
+        span_id = tc.start_span(name="agent:big", type="agent_turn")
+        tc.end_span(span_id, output="y" * 5000)
+
+        span = tc.get_trace_summary()["trace"]["spans"][0]
+        assert len(span["output"]) <= 2003
+
+    def test_get_trace_summary_returns_correct_structure(self):
+        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1", user_id=42)
+        agent_span = tc.start_span(name="agent:A", type="agent_turn")
+        tool_span = tc.start_span(
+            name="tool:T", type="tool_call", parent_span_id=agent_span
+        )
+        tc.end_span(tool_span, tokens=100, cost=0.001)
+        tc.end_span(agent_span, tokens=200, cost=0.003)
+        tc.set_status("completed")
+
+        summary = tc.get_trace_summary()
+        assert summary["runId"] == "r1"
+        assert summary["agencyId"] == "a1"
+        assert summary["tenantId"] == "t1"
+        assert summary["createdBy"] == 42
+        assert summary["status"] == "completed"
+        assert summary["totalTokens"] == 300
+        assert abs(summary["totalCost"] - 0.004) < 1e-6
+        assert summary["durationMs"] >= 0
+        assert summary["trace"]["version"] == 1
+        assert len(summary["trace"]["spans"]) == 2
+
+    def test_end_span_with_error(self):
+        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
+        span_id = tc.start_span(name="agent:fail", type="agent_turn")
+        tc.end_span(span_id, error="Something went wrong")
+
+        span = tc.get_trace_summary()["trace"]["spans"][0]
+        assert span["error"] == "Something went wrong"
+
+    def test_end_span_unknown_id_no_error(self):
+        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
+        # Should not raise, just log warning
+        tc.end_span("nonexistent-id", output="test")
+
+    def test_set_status(self):
+        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
+        tc.set_status("failed")
+        assert tc.get_trace_summary()["status"] == "failed"
+
+    def test_tool_calls_and_guardrails(self):
+        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
+        span_id = tc.start_span(name="agent:A", type="agent_turn")
+        tc.end_span(
+            span_id,
+            tool_calls=[{"toolId": "builtin-web-search", "name": "web_search", "durationMs": 800}],
+            guardrails=[{"name": "pii_check", "passed": True, "durationMs": 5}],
+        )
+
+        span = tc.get_trace_summary()["trace"]["spans"][0]
+        assert len(span["toolCalls"]) == 1
+        assert span["toolCalls"][0]["toolId"] == "builtin-web-search"
+        assert len(span["guardrails"]) == 1
+        assert span["guardrails"][0]["passed"] is True
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+class TestTraceCollectorAsync:
+    async def test_concurrent_spans_safely(self):
+        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
+
+        async def create_and_end_span(idx: int) -> None:
+            span_id = await tc.start_span_async(
+                name=f"tool:concurrent-{idx}", type="tool_call"
+            )
+            await asyncio.sleep(0.01)  # simulate work
+            await tc.end_span_async(span_id, output=f"result-{idx}", tokens=10)
+
+        tasks = [create_and_end_span(i) for i in range(10)]
+        await asyncio.gather(*tasks)
+
+        summary = tc.get_trace_summary()
+        assert len(summary["trace"]["spans"]) == 10
+        assert summary["totalTokens"] == 100
