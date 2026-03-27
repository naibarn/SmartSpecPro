diff --git a/apps/web/client/src/components/agency/NodePropertyPanel.tsx b/apps/web/client/src/components/agency/NodePropertyPanel.tsx
index 902d2aae..f2f8f5f4 100644
--- a/apps/web/client/src/components/agency/NodePropertyPanel.tsx
+++ b/apps/web/client/src/components/agency/NodePropertyPanel.tsx
@@ -202,6 +202,8 @@ export function NodePropertyPanel({ node, nodeId, siblingNodes = [], agencyId, o
           {nodeType === "parallel_fan_out" && <ParallelFanOutForm node={node} onChange={onChange} siblingNodes={siblingNodes} />}
           {nodeType === "loop_retry" && <LoopRetryForm node={node} onChange={onChange} siblingNodes={siblingNodes} />}
           {nodeType === "skill_discovery" && <SkillDiscoveryForm node={node} onChange={onChange} />}
+          {nodeType === "error_handler" && <ErrorHandlerForm node={node} onChange={onChange} siblingNodes={siblingNodes} />}
+          {nodeType === "data_transform" && <DataTransformForm node={node} onChange={onChange} />}
 
           <Separator />
 
@@ -3102,3 +3104,336 @@ function SkillDiscoveryForm({
     </>
   );
 }
+
+// ── Error Handler Form ───────────────────────────────────────────────────────
+
+function ErrorHandlerForm({
+  node,
+  onChange,
+  siblingNodes = [],
+}: {
+  node: AgencyNodeData;
+  onChange: (updates: Partial<AgencyNodeData>) => void;
+  siblingNodes?: SiblingNode[];
+}) {
+  const watchedNodeIds = ncGet<string[]>(node, "watchedNodeIds", []);
+  const onError = ncGet<string>(node, "onError", "retry");
+  const retryConfig = ncGet<{ maxRetries?: number; backoffMs?: number; backoffMultiplier?: number }>(node, "retryConfig", {});
+  const fallbackNodeId = ncGet<string>(node, "fallbackNodeId", "");
+  const fallbackMessage = ncGet<string>(node, "fallbackMessage", "");
+  const skipMessage = ncGet<string>(node, "skipMessage", "");
+
+  // Exclude self and other error handlers from watched node list
+  const watchableNodes = siblingNodes.filter(
+    (n) => n.nodeType !== "error_handler",
+  );
+
+  return (
+    <>
+      {/* Name */}
+      <div>
+        <Label className="text-xs font-medium">Name</Label>
+        <Input
+          value={node.name}
+          onChange={(e) => onChange({ name: e.target.value })}
+          className="mt-1"
+          placeholder="Error Handler"
+        />
+      </div>
+
+      {/* Description */}
+      <div>
+        <Label className="text-xs font-medium">Description</Label>
+        <Textarea
+          value={node.description ?? ""}
+          onChange={(e) => onChange({ description: e.target.value })}
+          className="mt-1"
+          rows={2}
+          placeholder="Handles errors for watched nodes..."
+        />
+      </div>
+
+      <Separator />
+
+      {/* Watched Nodes */}
+      <div>
+        <Label className="text-xs font-medium">Watched Nodes</Label>
+        <p className="text-[11px] text-muted-foreground mb-1">Select nodes this handler watches for errors</p>
+        <div className="space-y-1.5 mt-1">
+          {watchableNodes.map((n) => {
+            const checked = watchedNodeIds.includes(n.id);
+            return (
+              <label key={n.id} className="flex items-center gap-2 text-xs cursor-pointer">
+                <input
+                  type="checkbox"
+                  checked={checked}
+                  onChange={() => {
+                    const next = checked
+                      ? watchedNodeIds.filter((id) => id !== n.id)
+                      : [...watchedNodeIds, n.id];
+                    onChange(ncSet(node, "watchedNodeIds", next));
+                  }}
+                  className="rounded border-gray-300"
+                />
+                <span>{n.name}</span>
+                <span className="text-muted-foreground">({n.nodeType})</span>
+              </label>
+            );
+          })}
+          {watchableNodes.length === 0 && (
+            <p className="text-xs text-muted-foreground italic">No nodes available to watch</p>
+          )}
+        </div>
+      </div>
+
+      <Separator />
+
+      {/* On Error Strategy */}
+      <div>
+        <Label className="text-xs font-medium">On Error Strategy</Label>
+        <Select value={onError} onValueChange={(v) => onChange(ncSet(node, "onError", v))}>
+          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
+          <SelectContent>
+            <SelectItem value="retry">Retry with backoff</SelectItem>
+            <SelectItem value="fallback">Fallback to node/message</SelectItem>
+            <SelectItem value="skip">Skip with message</SelectItem>
+            <SelectItem value="terminate">Terminate run</SelectItem>
+          </SelectContent>
+        </Select>
+      </div>
+
+      {/* Retry Config */}
+      {onError === "retry" && (
+        <div className="space-y-2 pl-2 border-l-2 border-red-200">
+          <div>
+            <Label className="text-xs">Max Retries (1-5)</Label>
+            <Input
+              type="number"
+              min={1}
+              max={5}
+              value={retryConfig.maxRetries ?? 3}
+              onChange={(e) =>
+                onChange(ncSet(node, "retryConfig", { ...retryConfig, maxRetries: Math.min(5, Math.max(1, Number(e.target.value))) }))
+              }
+              className="mt-1"
+            />
+          </div>
+          <div>
+            <Label className="text-xs">Backoff (ms)</Label>
+            <Input
+              type="number"
+              min={50}
+              value={retryConfig.backoffMs ?? 100}
+              onChange={(e) =>
+                onChange(ncSet(node, "retryConfig", { ...retryConfig, backoffMs: Number(e.target.value) }))
+              }
+              className="mt-1"
+            />
+          </div>
+          <div>
+            <Label className="text-xs">Backoff Multiplier</Label>
+            <Input
+              type="number"
+              min={1}
+              step={0.5}
+              value={retryConfig.backoffMultiplier ?? 2}
+              onChange={(e) =>
+                onChange(ncSet(node, "retryConfig", { ...retryConfig, backoffMultiplier: Number(e.target.value) }))
+              }
+              className="mt-1"
+            />
+          </div>
+        </div>
+      )}
+
+      {/* Fallback Config */}
+      {onError === "fallback" && (
+        <div className="space-y-2 pl-2 border-l-2 border-red-200">
+          <div>
+            <Label className="text-xs">Fallback Node</Label>
+            <Select value={fallbackNodeId} onValueChange={(v) => onChange(ncSet(node, "fallbackNodeId", v))}>
+              <SelectTrigger className="mt-1"><SelectValue placeholder="Select node..." /></SelectTrigger>
+              <SelectContent>
+                {siblingNodes
+                  .filter((n) => n.nodeType !== "error_handler")
+                  .map((n) => (
+                    <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
+                  ))}
+              </SelectContent>
+            </Select>
+          </div>
+          <div>
+            <Label className="text-xs">Fallback Message (if no node)</Label>
+            <Textarea
+              value={fallbackMessage}
+              onChange={(e) => onChange(ncSet(node, "fallbackMessage", e.target.value))}
+              className="mt-1"
+              rows={2}
+              placeholder="Default fallback response..."
+            />
+          </div>
+        </div>
+      )}
+
+      {/* Skip Config */}
+      {onError === "skip" && (
+        <div className="pl-2 border-l-2 border-red-200">
+          <Label className="text-xs">Skip Message</Label>
+          <Textarea
+            value={skipMessage}
+            onChange={(e) => onChange(ncSet(node, "skipMessage", e.target.value))}
+            className="mt-1"
+            rows={2}
+            placeholder="Step skipped due to error"
+          />
+        </div>
+      )}
+    </>
+  );
+}
+
+// ── Data Transform Form ──────────────────────────────────────────────────────
+
+function DataTransformForm({
+  node,
+  onChange,
+}: {
+  node: AgencyNodeData;
+  onChange: (updates: Partial<AgencyNodeData>) => void;
+}) {
+  const transformMode = ncGet<string>(node, "transformMode", "jsonpath");
+  const jsonpathExpression = ncGet<string>(node, "jsonpathExpression", "");
+  const template = ncGet<string>(node, "template", "");
+  const filterCondition = ncGet<{ field?: string; operator?: string; value?: string }>(node, "filterCondition", {});
+  const outputKey = ncGet<string>(node, "outputKey", "");
+
+  return (
+    <>
+      {/* Name */}
+      <div>
+        <Label className="text-xs font-medium">Name</Label>
+        <Input
+          value={node.name}
+          onChange={(e) => onChange({ name: e.target.value })}
+          className="mt-1"
+          placeholder="Data Transform"
+        />
+      </div>
+
+      {/* Description */}
+      <div>
+        <Label className="text-xs font-medium">Description</Label>
+        <Textarea
+          value={node.description ?? ""}
+          onChange={(e) => onChange({ description: e.target.value })}
+          className="mt-1"
+          rows={2}
+          placeholder="Transforms data from previous node..."
+        />
+      </div>
+
+      <Separator />
+
+      {/* Transform Mode */}
+      <div>
+        <Label className="text-xs font-medium">Transform Mode</Label>
+        <Select value={transformMode} onValueChange={(v) => onChange(ncSet(node, "transformMode", v))}>
+          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
+          <SelectContent>
+            <SelectItem value="jsonpath">JSONPath extraction</SelectItem>
+            <SelectItem value="template">Mustache template</SelectItem>
+            <SelectItem value="filter">Array filter</SelectItem>
+          </SelectContent>
+        </Select>
+      </div>
+
+      {/* JSONPath Expression */}
+      {transformMode === "jsonpath" && (
+        <div>
+          <Label className="text-xs">JSONPath Expression</Label>
+          <Input
+            value={jsonpathExpression}
+            onChange={(e) => onChange(ncSet(node, "jsonpathExpression", e.target.value))}
+            className="mt-1 font-mono text-xs"
+            placeholder="$.results[*].title"
+          />
+          <p className="text-[10px] text-muted-foreground mt-0.5">e.g. $.data.items[*].name</p>
+        </div>
+      )}
+
+      {/* Template */}
+      {transformMode === "template" && (
+        <div>
+          <Label className="text-xs">Mustache Template</Label>
+          <Textarea
+            value={template}
+            onChange={(e) => onChange(ncSet(node, "template", e.target.value))}
+            className="mt-1 font-mono text-xs"
+            rows={4}
+            placeholder={"Title: {{title}}\nSummary: {{summary}}"}
+          />
+          <p className="text-[10px] text-muted-foreground mt-0.5">Use {"{{field}}"} for values. HTML is auto-escaped.</p>
+        </div>
+      )}
+
+      {/* Filter Condition */}
+      {transformMode === "filter" && (
+        <div className="space-y-2">
+          <div>
+            <Label className="text-xs">Field</Label>
+            <Input
+              value={filterCondition.field ?? ""}
+              onChange={(e) =>
+                onChange(ncSet(node, "filterCondition", { ...filterCondition, field: e.target.value }))
+              }
+              className="mt-1"
+              placeholder="score"
+            />
+          </div>
+          <div>
+            <Label className="text-xs">Operator</Label>
+            <Select
+              value={filterCondition.operator ?? "equals"}
+              onValueChange={(v) =>
+                onChange(ncSet(node, "filterCondition", { ...filterCondition, operator: v }))
+              }
+            >
+              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
+              <SelectContent>
+                <SelectItem value="equals">Equals</SelectItem>
+                <SelectItem value="contains">Contains</SelectItem>
+                <SelectItem value="gt">Greater than</SelectItem>
+                <SelectItem value="lt">Less than</SelectItem>
+              </SelectContent>
+            </Select>
+          </div>
+          <div>
+            <Label className="text-xs">Value</Label>
+            <Input
+              value={filterCondition.value ?? ""}
+              onChange={(e) =>
+                onChange(ncSet(node, "filterCondition", { ...filterCondition, value: e.target.value }))
+              }
+              className="mt-1"
+              placeholder="0.8"
+            />
+          </div>
+        </div>
+      )}
+
+      <Separator />
+
+      {/* Output Key */}
+      <div>
+        <Label className="text-xs font-medium">Output Key (optional)</Label>
+        <Input
+          value={outputKey}
+          onChange={(e) => onChange(ncSet(node, "outputKey", e.target.value))}
+          className="mt-1"
+          placeholder="transformed_data"
+        />
+        <p className="text-[10px] text-muted-foreground mt-0.5">Store result in context under this key</p>
+      </div>
+    </>
+  );
+}
diff --git a/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx b/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx
index 9a493a44..74bc0deb 100644
--- a/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx
+++ b/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx
@@ -13,6 +13,8 @@ import { ConditionalBranchNodeCard } from "./ConditionalBranchNodeCard";
 import { ParallelFanOutNodeCard } from "./ParallelFanOutNodeCard";
 import { LoopRetryNodeCard } from "./LoopRetryNodeCard";
 import { SkillDiscoveryNodeCard } from "./SkillDiscoveryNodeCard";
+import { ErrorHandlerNodeCard } from "./ErrorHandlerNodeCard";
+import { DataTransformNodeCard } from "./DataTransformNodeCard";
 
 /**
  * Single ReactFlow node type dispatcher.
@@ -45,6 +47,10 @@ export const BaseAgencyNode = memo(function BaseAgencyNode(props: NodeProps<Agen
       return <LoopRetryNodeCard {...props} />;
     case "skill_discovery":
       return <SkillDiscoveryNodeCard {...props} />;
+    case "error_handler":
+      return <ErrorHandlerNodeCard {...props} />;
+    case "data_transform":
+      return <DataTransformNodeCard {...props} />;
     default:
       return <AgentNodeCard {...props} />;
   }
diff --git a/apps/web/client/src/components/agency/nodes/DataTransformNodeCard.tsx b/apps/web/client/src/components/agency/nodes/DataTransformNodeCard.tsx
new file mode 100644
index 00000000..a4362cfb
--- /dev/null
+++ b/apps/web/client/src/components/agency/nodes/DataTransformNodeCard.tsx
@@ -0,0 +1,82 @@
+import { memo } from "react";
+import { Handle, Position } from "reactflow";
+import type { NodeProps } from "reactflow";
+import { Braces, AlertCircle } from "lucide-react";
+import { cn } from "@/lib/utils";
+import type { AgencyNodeData } from "./types";
+
+export const DataTransformNodeCard = memo(function DataTransformNodeCard({
+  data,
+  selected,
+}: NodeProps<AgencyNodeData>) {
+  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
+  const transformMode = (data.nodeConfig?.transformMode as string) ?? "jsonpath";
+  const jsonpathExpr = (data.nodeConfig?.jsonpathExpression as string) ?? "";
+  const filterField = ((data.nodeConfig?.filterCondition as Record<string, string>) ?? {}).field ?? "";
+
+  const modeLabel: Record<string, string> = {
+    jsonpath: "JSONPath",
+    template: "Template",
+    filter: "Filter",
+  };
+
+  const infoText =
+    transformMode === "jsonpath"
+      ? jsonpathExpr
+        ? jsonpathExpr.length > 20
+          ? jsonpathExpr.slice(0, 20) + "..."
+          : jsonpathExpr
+        : "No expression"
+      : transformMode === "template"
+        ? "Template"
+        : filterField
+          ? `by ${filterField}`
+          : "No field";
+
+  return (
+    <div
+      className={cn(
+        "w-64 rounded-lg border-2 bg-white shadow-sm transition-all relative",
+        "border-slate-300",
+        selected && "ring-2 ring-slate-500 shadow-md border-slate-500",
+      )}
+    >
+      {/* Diamond accent */}
+      <div className="flex justify-center -mt-2 mb-0">
+        <div className="h-3 w-3 rotate-45 bg-slate-400 rounded-sm" />
+      </div>
+
+      {/* Input handle */}
+      <Handle
+        type="target"
+        position={Position.Top}
+        style={{ top: -8 }}
+        className="!h-2.5 !w-2.5 !border-2 !border-slate-400 !bg-white"
+      />
+
+      <div className="px-3 py-2">
+        <div className="flex items-start justify-between gap-1 mb-1">
+          <div className="flex items-center gap-1.5 min-w-0">
+            <Braces className="h-3.5 w-3.5 shrink-0 text-slate-500" />
+            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
+          </div>
+          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
+        </div>
+
+        <div className="flex items-center gap-1.5 mt-0.5">
+          <span className="text-[10px] bg-slate-50 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
+            {modeLabel[transformMode] ?? transformMode}
+          </span>
+          <span className="text-[11px] text-slate-400">{infoText}</span>
+        </div>
+      </div>
+
+      {/* Output handle */}
+      <Handle
+        type="source"
+        position={Position.Bottom}
+        className="!h-2.5 !w-2.5 !border-2 !border-slate-400 !bg-slate-100"
+      />
+    </div>
+  );
+});
diff --git a/apps/web/client/src/components/agency/nodes/ErrorHandlerNodeCard.tsx b/apps/web/client/src/components/agency/nodes/ErrorHandlerNodeCard.tsx
new file mode 100644
index 00000000..c11eadca
--- /dev/null
+++ b/apps/web/client/src/components/agency/nodes/ErrorHandlerNodeCard.tsx
@@ -0,0 +1,71 @@
+import { memo } from "react";
+import { Handle, Position } from "reactflow";
+import type { NodeProps } from "reactflow";
+import { ShieldAlert, AlertCircle } from "lucide-react";
+import { cn } from "@/lib/utils";
+import type { AgencyNodeData } from "./types";
+
+export const ErrorHandlerNodeCard = memo(function ErrorHandlerNodeCard({
+  data,
+  selected,
+}: NodeProps<AgencyNodeData>) {
+  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
+  const onError = (data.nodeConfig?.onError as string) ?? "retry";
+  const watchedNodeIds = (data.nodeConfig?.watchedNodeIds as string[]) ?? [];
+
+  const strategyLabel: Record<string, string> = {
+    retry: "Retry",
+    fallback: "Fallback",
+    skip: "Skip",
+    terminate: "Terminate",
+  };
+
+  return (
+    <div
+      className={cn(
+        "w-64 rounded-lg border-2 bg-white shadow-sm transition-all relative",
+        "border-red-300",
+        selected && "ring-2 ring-red-500 shadow-md border-red-500",
+      )}
+    >
+      {/* Diamond accent */}
+      <div className="flex justify-center -mt-2 mb-0">
+        <div className="h-3 w-3 rotate-45 bg-red-400 rounded-sm" />
+      </div>
+
+      {/* Input handle */}
+      <Handle
+        type="target"
+        position={Position.Top}
+        style={{ top: -8 }}
+        className="!h-2.5 !w-2.5 !border-2 !border-red-400 !bg-white"
+      />
+
+      <div className="px-3 py-2">
+        <div className="flex items-start justify-between gap-1 mb-1">
+          <div className="flex items-center gap-1.5 min-w-0">
+            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-500" />
+            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
+          </div>
+          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
+        </div>
+
+        <div className="flex items-center gap-1.5 mt-0.5">
+          <span className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-200">
+            {strategyLabel[onError] ?? onError}
+          </span>
+          <span className="text-[11px] text-slate-400">
+            Watching {watchedNodeIds.length} node{watchedNodeIds.length !== 1 ? "s" : ""}
+          </span>
+        </div>
+      </div>
+
+      {/* Output handle */}
+      <Handle
+        type="source"
+        position={Position.Bottom}
+        className="!h-2.5 !w-2.5 !border-2 !border-red-400 !bg-red-100"
+      />
+    </div>
+  );
+});
diff --git a/apps/web/client/src/components/agency/nodes/types.ts b/apps/web/client/src/components/agency/nodes/types.ts
index 0d4a4543..cd82e3c1 100644
--- a/apps/web/client/src/components/agency/nodes/types.ts
+++ b/apps/web/client/src/components/agency/nodes/types.ts
@@ -10,7 +10,9 @@ export type AgencyNodeType =
   | "conditional_branch"
   | "parallel_fan_out"
   | "loop_retry"
-  | "skill_discovery";
+  | "skill_discovery"
+  | "data_transform"
+  | "error_handler";
 
 export interface AgencyNodeData {
   nodeType: AgencyNodeType;
diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index a7c79c69..a8a9ffd1 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -808,7 +808,7 @@ export const agencyRouter = router({
               description: z.string().optional(),
               nodeType: z.enum([
                 "agent", "supervisor", "router", "aggregator",
-                "knowledge_base", "skill_call", "human_approval", "browser_session", "conditional_branch", "parallel_fan_out", "loop_retry", "skill_discovery",
+                "knowledge_base", "skill_call", "human_approval", "browser_session", "conditional_branch", "parallel_fan_out", "loop_retry", "skill_discovery", "data_transform", "error_handler",
               ]).default("agent"),
               instructions: z.string().max(50000).optional(),
               model: z.string().max(100).regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid model identifier").optional(),
@@ -1062,7 +1062,7 @@ export const agencyRouter = router({
             description: z.string().optional(),
             nodeType: z.enum([
               "agent", "supervisor", "router", "aggregator",
-              "knowledge_base", "skill_call", "human_approval", "browser_session", "conditional_branch", "parallel_fan_out", "loop_retry", "skill_discovery",
+              "knowledge_base", "skill_call", "human_approval", "browser_session", "conditional_branch", "parallel_fan_out", "loop_retry", "skill_discovery", "data_transform", "error_handler",
             ]).default("agent"),
             instructions: z.string().max(50000).optional(),
             model: z.string().max(100).regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid model identifier").optional(),
@@ -1242,6 +1242,54 @@ export const agencyRouter = router({
                 }
               }
             }
+            // Validate error_handler config
+            if (data.nodeType === "error_handler") {
+              const cfg = data.nodeConfig as any;
+              const watchedNodeIds = cfg?.watchedNodeIds;
+              if (!Array.isArray(watchedNodeIds) || watchedNodeIds.length === 0) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "watchedNodeIds"], message: "error_handler requires at least 1 watchedNodeId" });
+              }
+              const onError = cfg?.onError;
+              if (!onError || !["retry", "fallback", "skip", "terminate"].includes(onError)) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "onError"], message: "onError must be: retry, fallback, skip, or terminate" });
+              }
+              if (onError === "retry") {
+                const maxRetries = cfg?.retryConfig?.maxRetries;
+                if (maxRetries !== undefined && (typeof maxRetries !== "number" || maxRetries < 1 || maxRetries > 5)) {
+                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "retryConfig", "maxRetries"], message: "maxRetries must be 1-5" });
+                }
+              }
+              if (onError === "fallback") {
+                const fallbackNodeId = cfg?.fallbackNodeId;
+                const fallbackMessage = cfg?.fallbackMessage;
+                if (!fallbackNodeId && !fallbackMessage) {
+                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "fallbackNodeId"], message: "fallback requires either fallbackNodeId or fallbackMessage" });
+                }
+              }
+            }
+            // Validate data_transform config
+            if (data.nodeType === "data_transform") {
+              const cfg = data.nodeConfig as any;
+              const mode = cfg?.transformMode;
+              if (!mode || !["jsonpath", "template", "filter"].includes(mode)) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "transformMode"], message: "transformMode must be: jsonpath, template, or filter" });
+              }
+              if (mode === "jsonpath" && !cfg?.jsonpathExpression) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "jsonpathExpression"], message: "jsonpath mode requires jsonpathExpression" });
+              }
+              if (mode === "template" && !cfg?.template) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "template"], message: "template mode requires template" });
+              }
+              if (mode === "filter") {
+                const fc = cfg?.filterCondition;
+                if (!fc?.field || !fc?.operator || fc?.value === undefined) {
+                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "filterCondition"], message: "filter mode requires field, operator, and value" });
+                }
+                if (fc?.operator && !["gt", "lt", "equals", "contains"].includes(fc.operator)) {
+                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "filterCondition", "operator"], message: "operator must be: gt, lt, equals, or contains" });
+                }
+              }
+            }
             // Validate knowledgeBase config
             const kb = (data.nodeConfig as any)?.knowledgeBase;
             if (kb && ["agent", "supervisor"].includes(data.nodeType)) {
diff --git a/python-backend/app/services/agency_data_transform.py b/python-backend/app/services/agency_data_transform.py
new file mode 100644
index 00000000..964d5714
--- /dev/null
+++ b/python-backend/app/services/agency_data_transform.py
@@ -0,0 +1,146 @@
+"""
+agency_data_transform — Data transform functions for agency graph data_transform nodes.
+
+Supports three transform modes:
+  - jsonpath: Extract fields using JSONPath expressions (jsonpath_ng)
+  - template: Render Mustache templates with HTML escaping (pystache)
+  - filter:   Filter JSON arrays by field conditions
+"""
+
+from __future__ import annotations
+
+import json
+from typing import Any
+
+import structlog
+
+logger = structlog.get_logger(__name__)
+
+MAX_JSONPATH_LENGTH = 500
+
+
+def apply_jsonpath(data_str: str, expression: str) -> str:
+    """Parse data_str as JSON, apply jsonpath_ng expression, return JSON string of matches.
+
+    On parse error or invalid expression, return a descriptive error string.
+    """
+    if len(expression) > MAX_JSONPATH_LENGTH:
+        return f"Error: JSONPath expression exceeds {MAX_JSONPATH_LENGTH} character limit"
+
+    try:
+        data = json.loads(data_str)
+    except (json.JSONDecodeError, TypeError):
+        return "Error: Input is not valid JSON"
+
+    try:
+        from jsonpath_ng import parse as jsonpath_parse
+
+        expr = jsonpath_parse(expression)
+        matches = [match.value for match in expr.find(data)]
+        return json.dumps(matches)
+    except Exception as e:
+        return f"Error: Invalid JSONPath expression — {str(e)[:200]}"
+
+
+def apply_template(data_str: str, template: str) -> str:
+    """Parse data_str as JSON dict, render Mustache template with HTML escaping.
+
+    HTML-escapes all interpolated values to prevent injection.
+    """
+    try:
+        data = json.loads(data_str)
+    except (json.JSONDecodeError, TypeError):
+        return "Error: Input is not valid JSON"
+
+    if not isinstance(data, dict):
+        return "Error: Template mode requires a JSON object as input"
+
+    try:
+        import pystache
+
+        renderer = pystache.Renderer(escape=lambda u: _html_escape(str(u)))
+        return renderer.render(template, data)
+    except Exception as e:
+        return f"Error: Template rendering failed — {str(e)[:200]}"
+
+
+def _html_escape(s: str) -> str:
+    """Escape HTML special characters."""
+    return (
+        s.replace("&", "&amp;")
+        .replace("<", "&lt;")
+        .replace(">", "&gt;")
+        .replace('"', "&quot;")
+        .replace("'", "&#x27;")
+    )
+
+
+def apply_filter(data_str: str, condition: dict[str, Any]) -> str:
+    """Parse data_str as JSON array, filter items by condition.
+
+    condition: { "field": str, "operator": "gt"|"lt"|"equals"|"contains", "value": str }
+    Returns JSON string of filtered array.
+    """
+    try:
+        data = json.loads(data_str)
+    except (json.JSONDecodeError, TypeError):
+        return "Error: Input is not valid JSON"
+
+    if not isinstance(data, list):
+        return "Error: Filter mode requires a JSON array as input"
+
+    field = condition.get("field", "")
+    operator = condition.get("operator", "equals")
+    compare_value = condition.get("value", "")
+
+    filtered: list[Any] = []
+    for item in data:
+        if not isinstance(item, dict):
+            continue
+        item_value = item.get(field)
+        if item_value is None:
+            continue
+
+        try:
+            if operator == "equals":
+                if str(item_value) == str(compare_value):
+                    filtered.append(item)
+            elif operator == "contains":
+                if str(compare_value) in str(item_value):
+                    filtered.append(item)
+            elif operator == "gt":
+                if float(item_value) > float(compare_value):
+                    filtered.append(item)
+            elif operator == "lt":
+                if float(item_value) < float(compare_value):
+                    filtered.append(item)
+        except (ValueError, TypeError):
+            continue
+
+    return json.dumps(filtered)
+
+
+def execute_data_transform(input_data: str, config: dict[str, Any]) -> str:
+    """Dispatch to the correct transform function based on config['transformMode']."""
+    mode = config.get("transformMode", "")
+
+    if mode == "jsonpath":
+        expression = config.get("jsonpathExpression", "")
+        if not expression:
+            return "Error: JSONPath expression is required"
+        return apply_jsonpath(input_data, expression)
+
+    elif mode == "template":
+        template = config.get("template", "")
+        if not template:
+            return "Error: Template is required"
+        return apply_template(input_data, template)
+
+    elif mode == "filter":
+        condition = config.get("filterCondition", {})
+        if not condition.get("field"):
+            return "Error: Filter condition requires a field"
+        return apply_filter(input_data, condition)
+
+    else:
+        return f"Error: Unknown transform mode '{mode}'"
diff --git a/python-backend/app/services/agency_error_handler.py b/python-backend/app/services/agency_error_handler.py
new file mode 100644
index 00000000..fb115df3
--- /dev/null
+++ b/python-backend/app/services/agency_error_handler.py
@@ -0,0 +1,147 @@
+"""
+agency_error_handler — Error handler strategies for agency graph error_handler nodes.
+
+Provides retry (exponential backoff), fallback (redirect or message),
+skip (graceful skip with message), and terminate (raise exception).
+All error payloads are scrubbed before entering context or SSE events.
+"""
+
+from __future__ import annotations
+
+import asyncio
+import re
+from typing import Any, Awaitable, Callable
+
+import structlog
+
+logger = structlog.get_logger(__name__)
+
+MAX_RETRIES_CAP = 5
+
+# Patterns to strip from error payloads
+SCRUB_PATTERNS: list[re.Pattern] = [
+    re.compile(r"/home/[^\s\"']+"),                      # File paths
+    re.compile(r"/app/[^\s\"']+"),                        # Container paths
+    re.compile(r"postgresql://[^\s\"']+"),                # DB connection strings
+    re.compile(r"mysql://[^\s\"']+"),                     # MySQL strings
+    re.compile(r"redis://[^\s\"']+"),                     # Redis strings
+    re.compile(r"sk-[a-zA-Z0-9]{10,}"),                  # API keys (OpenAI-style)
+    re.compile(r"key-[a-zA-Z0-9]{10,}"),                 # Generic API keys
+    re.compile(r"Bearer\s+[^\s\"']+", re.IGNORECASE),    # Bearer tokens
+    re.compile(r"Authorization:\s*[^\s\"']+", re.IGNORECASE),  # Auth headers
+    re.compile(r'File "[^"]+",\s*line \d+'),             # Stack trace frames
+    re.compile(r"at\s+[\w.]+\s+\([^)]+\)"),              # JS-style stack frames
+]
+
+MAX_SCRUBBED_LENGTH = 500
+
+
+class RunTerminatedError(Exception):
+    """Raised when an error handler uses the 'terminate' strategy."""
+
+    pass
+
+
+def scrub_error_payload(raw: str) -> str:
+    """Remove stack traces, file paths, DB connection strings, API keys.
+
+    Returns a safe summary truncated to MAX_SCRUBBED_LENGTH chars.
+    """
+    result = raw
+    for pattern in SCRUB_PATTERNS:
+        result = pattern.sub("[REDACTED]", result)
+    if len(result) > MAX_SCRUBBED_LENGTH:
+        result = result[:MAX_SCRUBBED_LENGTH] + "..."
+    return result
+
+
+async def execute_retry(
+    node_executor: Callable[..., Awaitable[str]],
+    node: dict[str, Any],
+    ctx: Any,
+    retry_config: dict[str, Any],
+    emitter: Any | None = None,
+) -> str:
+    """Retry the failed node with exponential backoff.
+
+    Cap maxRetries at MAX_RETRIES_CAP. Between each retry, sleep for
+    backoffMs * (backoffMultiplier ^ attempt). Emit 'error_handled' SSE event
+    per attempt if emitter is provided.
+    """
+    max_retries = min(int(retry_config.get("maxRetries", 3)), MAX_RETRIES_CAP)
+    backoff_ms = float(retry_config.get("backoffMs", 100))
+    backoff_multiplier = float(retry_config.get("backoffMultiplier", 2))
+    node_name = node.get("name", node.get("id", "unknown"))
+
+    last_error: Exception | None = None
+    for attempt in range(max_retries + 1):  # initial + retries
+        try:
+            result = await node_executor(node, ctx)
+            if emitter and attempt > 0:
+                await emitter.emit("error_handled", {
+                    "nodeName": node_name,
+                    "strategy": "retry",
+                    "attempt": attempt,
+                    "errorSummary": f"Succeeded on attempt {attempt + 1}",
+                })
+            return result
+        except Exception as exc:
+            last_error = exc
+            if emitter:
+                await emitter.emit("error_handled", {
+                    "nodeName": node_name,
+                    "strategy": "retry",
+                    "attempt": attempt + 1,
+                    "errorSummary": scrub_error_payload(str(exc)),
+                })
+            if attempt < max_retries:
+                delay_s = (backoff_ms * (backoff_multiplier**attempt)) / 1000
+                logger.info(
+                    "agency_error_handler_retry",
+                    node_name=node_name,
+                    attempt=attempt + 1,
+                    delay_s=delay_s,
+                )
+                await asyncio.sleep(delay_s)
+
+    # All retries exhausted
+    raise last_error  # type: ignore[misc]
+
+
+async def execute_fallback(
+    fallback_node_id: str | None,
+    fallback_message: str | None,
+    error: Exception,
+    emitter: Any | None = None,
+) -> tuple[str | None, str | None]:
+    """Return (result, redirect_node_id).
+
+    If fallbackNodeId exists, return it for the orchestrator to route to.
+    Otherwise return fallbackMessage as result.
+    Scrub the error before storing in context.
+    """
+    scrubbed = scrub_error_payload(str(error))
+
+    if emitter:
+        await emitter.emit("error_handled", {
+            "nodeName": "fallback",
+            "strategy": "fallback",
+            "errorSummary": scrubbed,
+        })
+
+    if fallback_node_id:
+        return (None, fallback_node_id)
+
+    message = fallback_message or f"Fallback: {scrubbed}"
+    return (message, None)
+
+
+def execute_skip(skip_message: str | None) -> str:
+    """Return the skip message or a default."""
+    return skip_message or "Step skipped due to error"
+
+
+def execute_terminate(node_name: str, error: Exception) -> None:
+    """Raise a RunTerminatedError with the failed node name."""
+    scrubbed = scrub_error_payload(str(error))
+    raise RunTerminatedError(f"Run terminated at node '{node_name}': {scrubbed}")
diff --git a/python-backend/app/services/agency_orchestrator.py b/python-backend/app/services/agency_orchestrator.py
index 7da443e4..44392228 100644
--- a/python-backend/app/services/agency_orchestrator.py
+++ b/python-backend/app/services/agency_orchestrator.py
@@ -38,6 +38,15 @@ from app.services.agency_run_context import AgencyRunContext
 from app.services.agency_skill_discovery import execute_skill_discovery
 from app.services.agency_skill_input_mapper import resolve_skill_input_mappings
 from app.services.agency_trace_collector import TraceCollector
+from app.services.agency_data_transform import execute_data_transform
+from app.services.agency_error_handler import (
+    RunTerminatedError,
+    execute_fallback,
+    execute_retry,
+    execute_skip,
+    execute_terminate,
+    scrub_error_payload,
+)
 
 logger = structlog.get_logger(__name__)
 
@@ -157,6 +166,14 @@ class AgencyOrchestrator:
         self._flow_configs: dict[tuple[str, str], FlowConfig] = {}
         self._shared_tools_cache: list[type] | None = None  # resolved once per run
 
+        # Build error_handler_map: watched_node_id → list of handler nodes
+        self.error_handler_map: dict[str, list[NodeRow]] = {}
+        for n in nodes:
+            if n.get("node_type") == "error_handler":
+                cfg = n.get("node_config") or {}
+                for watched_id in cfg.get("watchedNodeIds", []):
+                    self.error_handler_map.setdefault(watched_id, []).append(n)
+
         # Find entry node
         entry_candidates = [n for n in nodes if n.get("is_entry_point")]
         self.entry_node: NodeRow = entry_candidates[0] if entry_candidates else nodes[0]
@@ -262,79 +279,103 @@ class AgencyOrchestrator:
                 input_data=ctx.get_context_text()[:500],
             )
 
+        # Check if this node has error handlers watching it
+        handlers = self.error_handler_map.get(node_id, [])
+
         result: str
-        match node_type:
-            case "agent" | "supervisor":
-                result = await self._execute_agent_node(node, ctx)
-                # Check after_turn cancellation after agent completes
-                if self.event_emitter and self.redis_client:
-                    cancel_mode = await check_cancelled(self.redis_client, self.event_emitter.run_id)
-                    if cancel_mode in ("immediate", "after_turn"):
-                        await self.event_emitter.emit_error("cancelled", "Run cancelled by user (after turn)")
-                        return result or "[Run cancelled]"
-
-            case "router":
-                next_node_id = await self._route(node, ctx)
-                if next_node_id and next_node_id in self.nodes:
-                    result = await self._execute_node(self.nodes[next_node_id], ctx)
-                else:
-                    result = f"[Router: no matching route in node {node_id}]"
-                return result  # Router doesn't follow normal edges — routing already done
-
-            case "aggregator":
-                result = await self._aggregate(node, ctx)
-
-            case "knowledge_base":
-                await self._search_knowledge(node, ctx)
-                result = ""  # Knowledge populates ctx.knowledge, doesn't produce a response
-                # Fall through to follow edges
-
-            case "skill_call":
-                result = await self._call_skill(node, ctx)
-
-            case "skill_discovery":
-                cfg = node.get("node_config") or {}
-                result = await execute_skill_discovery(
-                    node_name=node.get("name", node_id),
-                    node_config=cfg,
-                    context=ctx.shared_context or AgencyRunContext(),
-                    results=ctx.results,
-                )
+        try:
+            match node_type:
+                case "error_handler":
+                    # Error handlers are not executed in normal traversal
+                    result = ""
+
+                case "data_transform":
+                    result = await self._execute_data_transform(node, ctx)
+
+                case "agent" | "supervisor":
+                    result = await self._execute_agent_node(node, ctx)
+                    # Check after_turn cancellation after agent completes
+                    if self.event_emitter and self.redis_client:
+                        cancel_mode = await check_cancelled(
+                            self.redis_client, self.event_emitter.run_id
+                        )
+                        if cancel_mode in ("immediate", "after_turn"):
+                            await self.event_emitter.emit_error(
+                                "cancelled", "Run cancelled by user (after turn)"
+                            )
+                            return result or "[Run cancelled]"
 
-            case "human_approval":
-                result = await self._await_approval(node, ctx)
+                case "router":
+                    next_node_id = await self._route(node, ctx)
+                    if next_node_id and next_node_id in self.nodes:
+                        result = await self._execute_node(self.nodes[next_node_id], ctx)
+                    else:
+                        result = f"[Router: no matching route in node {node_id}]"
+                    return result
+
+                case "aggregator":
+                    result = await self._aggregate(node, ctx)
+
+                case "knowledge_base":
+                    await self._search_knowledge(node, ctx)
+                    result = ""
+
+                case "skill_call":
+                    result = await self._call_skill(node, ctx)
+
+                case "skill_discovery":
+                    cfg = node.get("node_config") or {}
+                    result = await execute_skill_discovery(
+                        node_name=node.get("name", node_id),
+                        node_config=cfg,
+                        context=ctx.shared_context or AgencyRunContext(),
+                        results=ctx.results,
+                    )
 
-            case "browser_session":
-                execution = await self.browser_session_executor.execute(
-                    node,
-                    ctx,
-                    agency_id=getattr(self.agency_config, "agency_id", None),
-                )
-                result = str(execution.get("result") or "")
+                case "human_approval":
+                    result = await self._await_approval(node, ctx)
 
-            case "conditional_branch":
-                next_node_id = await self._evaluate_conditional_branch(node, ctx)
-                if next_node_id and next_node_id in self.nodes:
-                    result = await self._execute_node(self.nodes[next_node_id], ctx)
-                else:
-                    result = f"[ConditionalBranch: fallback — no valid target in node {node_id}]"
-                return result  # Like router, routing is already done
+                case "browser_session":
+                    execution = await self.browser_session_executor.execute(
+                        node,
+                        ctx,
+                        agency_id=getattr(self.agency_config, "agency_id", None),
+                    )
+                    result = str(execution.get("result") or "")
 
-            case "parallel_fan_out":
-                result = await self._execute_parallel_fan_out(node, ctx)
-                return result  # Fan-out handles its own downstream
+                case "conditional_branch":
+                    next_node_id = await self._evaluate_conditional_branch(node, ctx)
+                    if next_node_id and next_node_id in self.nodes:
+                        result = await self._execute_node(self.nodes[next_node_id], ctx)
+                    else:
+                        result = f"[ConditionalBranch: fallback — no valid target in node {node_id}]"
+                    return result
+
+                case "parallel_fan_out":
+                    result = await self._execute_parallel_fan_out(node, ctx)
+                    return result
+
+                case "loop_retry":
+                    handler = LoopHandler()
+                    result = await handler.execute(
+                        node, ctx, self,
+                        run_context=ctx.shared_context,
+                        trace_collector=self.trace_collector,
+                    )
 
-            case "loop_retry":
-                handler = LoopHandler()
-                result = await handler.execute(
-                    node, ctx, self,
-                    run_context=ctx.shared_context,
-                    trace_collector=self.trace_collector,
-                )
+                case _:
+                    logger.warning(
+                        "agency_orchestrator_unknown_node_type", node_type=node_type
+                    )
+                    result = ""
 
-            case _:
-                logger.warning("agency_orchestrator_unknown_node_type", node_type=node_type)
-                result = ""
+        except RunTerminatedError:
+            raise  # Let terminate propagate up
+        except Exception as exc:
+            if handlers:
+                result = await self._handle_error(handlers[0], node, exc, ctx)
+            else:
+                raise
 
         if result:
             ctx.results[node_id] = result
@@ -1228,6 +1269,90 @@ class AgencyOrchestrator:
             case _:
                 return "[Human approval: timed out → escalated]"
 
+    async def _handle_error(
+        self,
+        handler_node: NodeRow,
+        failed_node: NodeRow,
+        exc: Exception,
+        ctx: ExecutionContext,
+    ) -> str:
+        """Apply error handler strategy to a failed node."""
+        cfg = handler_node.get("node_config") or {}
+        strategy = cfg.get("onError", "skip")
+        failed_name = failed_node.get("name", failed_node["id"])
+
+        logger.info(
+            "agency_error_handler_triggered",
+            handler=handler_node.get("name"),
+            failed_node=failed_name,
+            strategy=strategy,
+        )
+
+        if strategy == "retry":
+            retry_config = cfg.get("retryConfig", {})
+            return await execute_retry(
+                self._execute_agent_node if failed_node.get("node_type") in AGENT_NODE_TYPES
+                else self._execute_node,
+                failed_node, ctx, retry_config,
+                emitter=self.event_emitter,
+            )
+
+        elif strategy == "fallback":
+            fallback_node_id = cfg.get("fallbackNodeId")
+            fallback_message = cfg.get("fallbackMessage")
+            result, redirect_id = await execute_fallback(
+                fallback_node_id, fallback_message, exc,
+                emitter=self.event_emitter,
+            )
+            if redirect_id and redirect_id in self.nodes:
+                return await self._execute_node(self.nodes[redirect_id], ctx)
+            return result or f"[Fallback for {failed_name}]"
+
+        elif strategy == "skip":
+            skip_message = cfg.get("skipMessage")
+            result = execute_skip(skip_message)
+            if self.event_emitter:
+                await self.event_emitter.emit("error_handled", {
+                    "nodeName": failed_name,
+                    "strategy": "skip",
+                    "errorSummary": scrub_error_payload(str(exc)),
+                })
+            return result
+
+        else:  # terminate
+            if self.event_emitter:
+                await self.event_emitter.emit("error_handled", {
+                    "nodeName": failed_name,
+                    "strategy": "terminate",
+                    "errorSummary": scrub_error_payload(str(exc)),
+                })
+            execute_terminate(failed_name, exc)
+            return ""  # unreachable, but keeps mypy happy
+
+    async def _execute_data_transform(self, node: NodeRow, ctx: ExecutionContext) -> str:
+        """Execute a data_transform node."""
+        node_id = node["id"]
+        node_config = node.get("node_config") or {}
+
+        # Find previous node's result by looking at incoming edges
+        incoming = [e for e in self.edges if e.get("to_node_id") == node_id]
+        input_data = ""
+        if incoming:
+            source_id = incoming[0].get("from_node_id", "")
+            input_data = ctx.results.get(source_id, "")
+
+        if not input_data:
+            input_data = ctx.input  # fallback to original input
+
+        result = execute_data_transform(input_data, node_config)
+
+        # Store in context under outputKey if specified
+        output_key = node_config.get("outputKey")
+        if output_key and ctx.shared_context:
+            await ctx.shared_context.set(output_key, result)
+
+        return result
+
 
 # ── Factory function ──────────────────────────────────────────────────────────
 
diff --git a/python-backend/requirements.txt b/python-backend/requirements.txt
index b390f95f..e4a2a875 100644
--- a/python-backend/requirements.txt
+++ b/python-backend/requirements.txt
@@ -195,3 +195,6 @@ bleach>=6.0.0,<7.0.0
 
 # Section 052: Conditional Branch (JSONPath evaluation)
 jsonpath-ng>=1.6.0
+
+# Section 052: Data Transform (Mustache template rendering)
+pystache>=0.6.0
diff --git a/python-backend/tests/unit/test_agency_data_transform.py b/python-backend/tests/unit/test_agency_data_transform.py
new file mode 100644
index 00000000..561e6279
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_data_transform.py
@@ -0,0 +1,159 @@
+"""Tests for agency_data_transform — data transform functions."""
+
+import json
+
+import pytest
+
+from app.services.agency_data_transform import (
+    apply_filter,
+    apply_jsonpath,
+    apply_template,
+    execute_data_transform,
+)
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestApplyJsonpath:
+    def test_extracts_correct_fields(self):
+        data = json.dumps({"results": [{"title": "A"}, {"title": "B"}]})
+        result = apply_jsonpath(data, "$.results[*].title")
+        parsed = json.loads(result)
+        assert parsed == ["A", "B"]
+
+    def test_handles_invalid_expression(self):
+        data = json.dumps({"a": 1})
+        result = apply_jsonpath(data, "$.[[[[")
+        assert "Error" in result
+
+    def test_handles_non_json_input(self):
+        result = apply_jsonpath("not json", "$.title")
+        assert "Error" in result
+        assert "not valid JSON" in result
+
+    def test_rejects_long_expression(self):
+        data = json.dumps({"a": 1})
+        result = apply_jsonpath(data, "$." + "a" * 600)
+        assert "exceeds" in result
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestApplyTemplate:
+    def test_renders_with_html_escaping(self):
+        data = json.dumps({"title": "<script>alert(1)</script>", "summary": "Safe text"})
+        result = apply_template(data, "Title: {{title}}\nSummary: {{summary}}")
+        assert "&lt;script&gt;" in result
+        assert "Safe text" in result
+
+    def test_handles_non_json_input(self):
+        result = apply_template("not json", "{{foo}}")
+        assert "Error" in result
+
+    def test_handles_non_dict_input(self):
+        result = apply_template(json.dumps([1, 2, 3]), "{{foo}}")
+        assert "Error" in result
+        assert "JSON object" in result
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestApplyFilter:
+    def test_filter_gt_operator(self):
+        data = json.dumps([
+            {"name": "A", "score": 0.9},
+            {"name": "B", "score": 0.5},
+            {"name": "C", "score": 0.85},
+        ])
+        condition = {"field": "score", "operator": "gt", "value": "0.8"}
+        result = apply_filter(data, condition)
+        parsed = json.loads(result)
+        names = [item["name"] for item in parsed]
+        assert names == ["A", "C"]
+
+    def test_filter_equals_operator(self):
+        data = json.dumps([{"status": "done"}, {"status": "pending"}])
+        condition = {"field": "status", "operator": "equals", "value": "done"}
+        result = apply_filter(data, condition)
+        parsed = json.loads(result)
+        assert len(parsed) == 1
+        assert parsed[0]["status"] == "done"
+
+    def test_filter_contains_operator(self):
+        data = json.dumps([{"text": "hello world"}, {"text": "goodbye"}])
+        condition = {"field": "text", "operator": "contains", "value": "hello"}
+        result = apply_filter(data, condition)
+        parsed = json.loads(result)
+        assert len(parsed) == 1
+        assert "hello" in parsed[0]["text"]
+
+    def test_filter_lt_operator(self):
+        data = json.dumps([{"val": 10}, {"val": 20}, {"val": 5}])
+        condition = {"field": "val", "operator": "lt", "value": "15"}
+        result = apply_filter(data, condition)
+        parsed = json.loads(result)
+        assert len(parsed) == 2
+
+    def test_handles_non_json_input(self):
+        result = apply_filter("not json", {"field": "x", "operator": "equals", "value": "1"})
+        assert "Error" in result
+
+    def test_handles_non_array_input(self):
+        result = apply_filter(json.dumps({"a": 1}), {"field": "a", "operator": "equals", "value": "1"})
+        assert "Error" in result
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestExecuteDataTransform:
+    def test_dispatches_to_jsonpath(self):
+        data = json.dumps({"title": "Hello"})
+        config = {"transformMode": "jsonpath", "jsonpathExpression": "$.title"}
+        result = execute_data_transform(data, config)
+        parsed = json.loads(result)
+        assert parsed == ["Hello"]
+
+    def test_dispatches_to_template(self):
+        data = json.dumps({"name": "World"})
+        config = {"transformMode": "template", "template": "Hello, {{name}}!"}
+        result = execute_data_transform(data, config)
+        assert result == "Hello, World!"
+
+    def test_dispatches_to_filter(self):
+        data = json.dumps([{"x": 1}, {"x": 2}])
+        config = {
+            "transformMode": "filter",
+            "filterCondition": {"field": "x", "operator": "gt", "value": "1"},
+        }
+        result = execute_data_transform(data, config)
+        parsed = json.loads(result)
+        assert len(parsed) == 1
+
+    def test_unknown_mode(self):
+        result = execute_data_transform("{}", {"transformMode": "invalid"})
+        assert "Error" in result
+        assert "Unknown" in result
+
+    def test_missing_jsonpath_expression(self):
+        result = execute_data_transform("{}", {"transformMode": "jsonpath"})
+        assert "Error" in result
+
+    def test_missing_template(self):
+        result = execute_data_transform("{}", {"transformMode": "template"})
+        assert "Error" in result
+
+    def test_missing_filter_field(self):
+        result = execute_data_transform("[]", {"transformMode": "filter", "filterCondition": {}})
+        assert "Error" in result
+
+    def test_stores_output_key_in_context(self):
+        """Test that execute_data_transform returns data correctly for context storage."""
+        data = json.dumps({"val": 42})
+        config = {
+            "transformMode": "jsonpath",
+            "jsonpathExpression": "$.val",
+            "outputKey": "transformed_data",
+        }
+        result = execute_data_transform(data, config)
+        parsed = json.loads(result)
+        assert parsed == [42]
diff --git a/python-backend/tests/unit/test_agency_error_handler.py b/python-backend/tests/unit/test_agency_error_handler.py
new file mode 100644
index 00000000..077941df
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_error_handler.py
@@ -0,0 +1,197 @@
+"""Tests for agency_error_handler — error handler strategies."""
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock
+
+from app.services.agency_error_handler import (
+    MAX_RETRIES_CAP,
+    RunTerminatedError,
+    execute_fallback,
+    execute_retry,
+    execute_skip,
+    execute_terminate,
+    scrub_error_payload,
+)
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestScrubErrorPayload:
+    def test_scrubs_file_paths(self):
+        raw = 'Error at /home/dev/projects/app.py line 42'
+        result = scrub_error_payload(raw)
+        assert "/home/dev" not in result
+        assert "[REDACTED]" in result
+
+    def test_scrubs_db_urls(self):
+        raw = "Connection failed: postgresql://user:pass@host:5432/db"
+        result = scrub_error_payload(raw)
+        assert "postgresql://" not in result
+        assert "pass" not in result
+
+    def test_scrubs_api_keys(self):
+        raw = "Auth error with key sk-abc123defghijklmnop"
+        result = scrub_error_payload(raw)
+        assert "sk-abc123" not in result
+
+    def test_scrubs_bearer_tokens(self):
+        raw = "Header: Bearer eyJhbGciOiJIUzI1NiJ9.token"
+        result = scrub_error_payload(raw)
+        assert "eyJhbGci" not in result
+
+    def test_scrubs_stack_traces(self):
+        raw = 'File "/home/dev/app.py", line 10, in foo\n  x = 1'
+        result = scrub_error_payload(raw)
+        assert 'File "' not in result
+
+    def test_truncates_long_messages(self):
+        raw = "x" * 1000
+        result = scrub_error_payload(raw)
+        assert len(result) <= 504  # 500 + "..."
+
+    def test_preserves_safe_summary(self):
+        raw = "Connection timeout after 30 seconds"
+        result = scrub_error_payload(raw)
+        assert "Connection timeout" in result
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestExecuteRetry:
+    @pytest.mark.asyncio
+    async def test_retry_succeeds_after_failures(self):
+        call_count = 0
+
+        async def failing_then_success(node, ctx):
+            nonlocal call_count
+            call_count += 1
+            if call_count < 3:
+                raise RuntimeError("transient error")
+            return "success"
+
+        node = {"id": "n1", "name": "TestNode"}
+        ctx = MagicMock()
+        retry_config = {"maxRetries": 3, "backoffMs": 1, "backoffMultiplier": 2}
+
+        result = await execute_retry(failing_then_success, node, ctx, retry_config)
+        assert result == "success"
+        assert call_count == 3
+
+    @pytest.mark.asyncio
+    async def test_retry_exhausted_raises(self):
+        async def always_fail(node, ctx):
+            raise RuntimeError("permanent error")
+
+        node = {"id": "n1", "name": "TestNode"}
+        ctx = MagicMock()
+        retry_config = {"maxRetries": 2, "backoffMs": 1, "backoffMultiplier": 1}
+
+        with pytest.raises(RuntimeError, match="permanent error"):
+            await execute_retry(always_fail, node, ctx, retry_config)
+
+    @pytest.mark.asyncio
+    async def test_max_retries_capped_at_5(self):
+        call_count = 0
+
+        async def always_fail(node, ctx):
+            nonlocal call_count
+            call_count += 1
+            raise RuntimeError("fail")
+
+        node = {"id": "n1", "name": "TestNode"}
+        ctx = MagicMock()
+        retry_config = {"maxRetries": 10, "backoffMs": 1, "backoffMultiplier": 1}
+
+        with pytest.raises(RuntimeError):
+            await execute_retry(always_fail, node, ctx, retry_config)
+        # initial + 5 retries = 6
+        assert call_count == MAX_RETRIES_CAP + 1
+
+    @pytest.mark.asyncio
+    async def test_retry_emits_events(self):
+        call_count = 0
+
+        async def fail_once(node, ctx):
+            nonlocal call_count
+            call_count += 1
+            if call_count == 1:
+                raise RuntimeError("oops")
+            return "ok"
+
+        emitter = MagicMock()
+        emitter.emit = AsyncMock()
+        node = {"id": "n1", "name": "RetryNode"}
+        ctx = MagicMock()
+        retry_config = {"maxRetries": 2, "backoffMs": 1, "backoffMultiplier": 1}
+
+        result = await execute_retry(fail_once, node, ctx, retry_config, emitter=emitter)
+        assert result == "ok"
+        assert emitter.emit.call_count >= 1
+        # First call is error event, second is success
+        first_call = emitter.emit.call_args_list[0]
+        assert first_call[0][0] == "error_handled"
+        assert first_call[0][1]["strategy"] == "retry"
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestExecuteFallback:
+    @pytest.mark.asyncio
+    async def test_fallback_with_node_id(self):
+        result, redirect = await execute_fallback(
+            fallback_node_id="node-backup",
+            fallback_message=None,
+            error=RuntimeError("API down"),
+        )
+        assert result is None
+        assert redirect == "node-backup"
+
+    @pytest.mark.asyncio
+    async def test_fallback_with_message(self):
+        result, redirect = await execute_fallback(
+            fallback_node_id=None,
+            fallback_message="Using cached response",
+            error=RuntimeError("API down"),
+        )
+        assert result == "Using cached response"
+        assert redirect is None
+
+    @pytest.mark.asyncio
+    async def test_fallback_default_message(self):
+        result, redirect = await execute_fallback(
+            fallback_node_id=None,
+            fallback_message=None,
+            error=RuntimeError("API down"),
+        )
+        assert result is not None
+        assert "Fallback" in result
+        assert redirect is None
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestExecuteSkip:
+    def test_skip_with_message(self):
+        result = execute_skip("Step skipped due to API error")
+        assert result == "Step skipped due to API error"
+
+    def test_skip_default_message(self):
+        result = execute_skip(None)
+        assert "skipped" in result.lower()
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestExecuteTerminate:
+    def test_terminate_raises(self):
+        with pytest.raises(RunTerminatedError) as exc_info:
+            execute_terminate("FailedNode", RuntimeError("critical"))
+        assert "FailedNode" in str(exc_info.value)
+
+    def test_terminate_scrubs_error(self):
+        error = RuntimeError("Failed at /home/dev/secret/app.py with key sk-secretkey1234567890")
+        with pytest.raises(RunTerminatedError) as exc_info:
+            execute_terminate("Node1", error)
+        msg = str(exc_info.value)
+        assert "/home/dev" not in msg
+        assert "sk-secret" not in msg
