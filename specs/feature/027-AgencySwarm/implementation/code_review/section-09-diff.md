diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index e611040..15290a8 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -89,6 +89,7 @@ const UsageAnalytics = lazy(() => import("./pages/UsageAnalytics"));
 const TaskQueueMonitor = lazy(() => import("./pages/TaskQueueMonitor"));
 const AgencyBrowser = lazy(() => import("./pages/AgencyBrowser"));
 const AgencyChat = lazy(() => import("./pages/AgencyChat"));
+const AgencyBuilder = lazy(() => import("./pages/AgencyBuilder"));
 const Workflows = lazy(() => import("./pages/Workflows"));
 const WorkflowEditor = lazy(() => import("./pages/WorkflowEditor"));
 const WorkflowGallery = lazy(() => import("./pages/WorkflowGallery"));
@@ -162,6 +163,7 @@ function Router() {
         <Route path="/forgot-password" component={ForgotPassword} />
         <Route path="/chat" component={Chat} />
         <Route path="/agencies" component={AgencyBrowser} />
+        <Route path="/agencies/:id/edit" component={AgencyBuilder} />
         <Route path="/agencies/:id" component={AgencyChat} />
         <Route path="/workflows" component={Workflows} />
         <Route path="/workflows/editor" component={WorkflowEditor} />
diff --git a/apps/web/client/src/components/agency/AgencyToolbar.tsx b/apps/web/client/src/components/agency/AgencyToolbar.tsx
new file mode 100644
index 0000000..1ad3d55
--- /dev/null
+++ b/apps/web/client/src/components/agency/AgencyToolbar.tsx
@@ -0,0 +1,81 @@
+import { Button } from "@/components/ui/button";
+import { Badge } from "@/components/ui/badge";
+import {
+  ArrowLeft,
+  Save,
+  Upload,
+  LayoutGrid,
+  Play,
+  Loader2,
+} from "lucide-react";
+import { cn } from "@/lib/utils";
+
+interface AgencyToolbarProps {
+  agencyName: string;
+  agencyStatus: "draft" | "published" | "archived";
+  isSaving: boolean;
+  onSave: () => void;
+  onPublish: () => void;
+  onAutoLayout: () => void;
+  onTest: () => void;
+  onBack: () => void;
+}
+
+const STATUS_STYLES: Record<string, string> = {
+  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
+  published: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
+  archived: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
+};
+
+export function AgencyToolbar({
+  agencyName,
+  agencyStatus,
+  isSaving,
+  onSave,
+  onPublish,
+  onAutoLayout,
+  onTest,
+  onBack,
+}: AgencyToolbarProps) {
+  return (
+    <div className="flex h-12 items-center justify-between border-b bg-background px-4">
+      {/* Left side */}
+      <div className="flex items-center gap-3">
+        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
+          <ArrowLeft className="h-4 w-4" />
+        </Button>
+        <span className="text-sm font-semibold">{agencyName || "Untitled Agency"}</span>
+        <Badge
+          variant="secondary"
+          className={cn("text-xs", STATUS_STYLES[agencyStatus] ?? "")}
+        >
+          {agencyStatus}
+        </Badge>
+      </div>
+
+      {/* Right side */}
+      <div className="flex items-center gap-2">
+        <Button variant="outline" size="sm" onClick={onAutoLayout}>
+          <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
+          Auto Layout
+        </Button>
+        <Button variant="outline" size="sm" onClick={onTest}>
+          <Play className="mr-1.5 h-3.5 w-3.5" />
+          Test
+        </Button>
+        <Button variant="outline" size="sm" onClick={onSave} disabled={isSaving}>
+          {isSaving ? (
+            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
+          ) : (
+            <Save className="mr-1.5 h-3.5 w-3.5" />
+          )}
+          Save
+        </Button>
+        <Button size="sm" onClick={onPublish} disabled={isSaving}>
+          <Upload className="mr-1.5 h-3.5 w-3.5" />
+          Publish
+        </Button>
+      </div>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/agency/AgentNode.tsx b/apps/web/client/src/components/agency/AgentNode.tsx
new file mode 100644
index 0000000..ed3d255
--- /dev/null
+++ b/apps/web/client/src/components/agency/AgentNode.tsx
@@ -0,0 +1,80 @@
+import { memo } from "react";
+import { Handle, Position } from "reactflow";
+import type { NodeProps } from "reactflow";
+import { Badge } from "@/components/ui/badge";
+import { Wrench } from "lucide-react";
+import { cn } from "@/lib/utils";
+
+export interface AgentNodeData {
+  name: string;
+  description: string;
+  instructions: string;
+  model: string;
+  modelSettings: { max_tokens?: number; temperature?: number; top_p?: number };
+  isEntryPoint: boolean;
+  isOptional: boolean;
+  tools: Array<{ toolId: string; toolName: string }>;
+}
+
+export const AgentNode = memo(function AgentNode({
+  data,
+  selected,
+}: NodeProps<AgentNodeData>) {
+  return (
+    <div
+      className={cn(
+        "w-56 rounded-lg border bg-card shadow-sm transition-shadow",
+        selected && "ring-2 ring-primary shadow-md",
+        data.isEntryPoint && "border-l-4 border-l-green-500",
+        data.isOptional && !data.isEntryPoint && "border-l-4 border-l-yellow-500",
+      )}
+    >
+      <Handle
+        type="target"
+        position={Position.Top}
+        className="!h-2 !w-2 !border-2 !border-primary !bg-background"
+      />
+
+      <div className="px-3 py-2">
+        <div className="flex items-start justify-between gap-1">
+          <span className="truncate text-sm font-semibold">{data.name}</span>
+          <div className="flex shrink-0 gap-1">
+            {data.isEntryPoint && (
+              <Badge
+                variant="secondary"
+                className="bg-green-100 px-1 py-0 text-[10px] text-green-800 dark:bg-green-900 dark:text-green-200"
+              >
+                entry
+              </Badge>
+            )}
+            {data.isOptional && (
+              <Badge
+                variant="secondary"
+                className="bg-yellow-100 px-1 py-0 text-[10px] text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
+              >
+                optional
+              </Badge>
+            )}
+          </div>
+        </div>
+
+        <p className="mt-0.5 truncate text-xs text-muted-foreground">
+          {data.model || "No model"}
+        </p>
+
+        {data.tools.length > 0 && (
+          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
+            <Wrench className="h-3 w-3" />
+            <span>{data.tools.length} tool{data.tools.length !== 1 ? "s" : ""}</span>
+          </div>
+        )}
+      </div>
+
+      <Handle
+        type="source"
+        position={Position.Bottom}
+        className="!h-2 !w-2 !border-2 !border-primary !bg-background"
+      />
+    </div>
+  );
+});
diff --git a/apps/web/client/src/components/agency/AgentPropertyPanel.tsx b/apps/web/client/src/components/agency/AgentPropertyPanel.tsx
new file mode 100644
index 0000000..8d08855
--- /dev/null
+++ b/apps/web/client/src/components/agency/AgentPropertyPanel.tsx
@@ -0,0 +1,272 @@
+import { useState } from "react";
+import { Input } from "@/components/ui/input";
+import { Textarea } from "@/components/ui/textarea";
+import { Switch } from "@/components/ui/switch";
+import { Label } from "@/components/ui/label";
+import { Button } from "@/components/ui/button";
+import { Badge } from "@/components/ui/badge";
+import { ScrollArea } from "@/components/ui/scroll-area";
+import { Separator } from "@/components/ui/separator";
+import { ToolPicker } from "./ToolPicker";
+import type { AgentNodeData } from "./AgentNode";
+import { X, Wrench, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
+import { cn } from "@/lib/utils";
+
+interface AgentPropertyPanelProps {
+  agent: AgentNodeData;
+  onChange: (updates: Partial<AgentNodeData>) => void;
+  onClose: () => void;
+  onDelete: () => void;
+}
+
+export function AgentPropertyPanel({
+  agent,
+  onChange,
+  onClose,
+  onDelete,
+}: AgentPropertyPanelProps) {
+  const [toolPickerOpen, setToolPickerOpen] = useState(false);
+  const [settingsOpen, setSettingsOpen] = useState(false);
+
+  const handleAddTool = (tool: { toolId: string; toolName: string }) => {
+    onChange({ tools: [...agent.tools, tool] });
+  };
+
+  const handleRemoveTool = (toolId: string) => {
+    onChange({ tools: agent.tools.filter((t) => t.toolId !== toolId) });
+  };
+
+  return (
+    <div className="flex h-full w-80 flex-col border-l bg-background">
+      {/* Header */}
+      <div className="flex items-center justify-between border-b px-4 py-3">
+        <span className="text-sm font-medium">Agent Properties</span>
+        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
+          <X className="h-4 w-4" />
+        </Button>
+      </div>
+
+      <ScrollArea className="flex-1">
+        <div className="space-y-4 p-4">
+          {/* Name */}
+          <div className="space-y-1.5">
+            <Label htmlFor="agent-name">Name</Label>
+            <Input
+              id="agent-name"
+              value={agent.name}
+              onChange={(e) => onChange({ name: e.target.value })}
+              placeholder="Agent name"
+            />
+          </div>
+
+          {/* Description */}
+          <div className="space-y-1.5">
+            <Label htmlFor="agent-description">Description</Label>
+            <Textarea
+              id="agent-description"
+              value={agent.description}
+              onChange={(e) => onChange({ description: e.target.value })}
+              placeholder="Short description"
+              rows={2}
+            />
+          </div>
+
+          {/* Instructions */}
+          <div className="space-y-1.5">
+            <Label htmlFor="agent-instructions">Instructions</Label>
+            <Textarea
+              id="agent-instructions"
+              value={agent.instructions}
+              onChange={(e) => onChange({ instructions: e.target.value })}
+              placeholder="Agent system prompt / instructions"
+              rows={5}
+              className="min-h-[120px] resize-y"
+            />
+          </div>
+
+          {/* Model */}
+          <div className="space-y-1.5">
+            <Label htmlFor="agent-model">Model</Label>
+            <Input
+              id="agent-model"
+              value={agent.model}
+              onChange={(e) => onChange({ model: e.target.value })}
+              placeholder="e.g. gpt-4o, claude-sonnet-4-20250514"
+            />
+          </div>
+
+          <Separator />
+
+          {/* Model Settings (collapsible) */}
+          <div>
+            <button
+              type="button"
+              onClick={() => setSettingsOpen(!settingsOpen)}
+              className="flex w-full items-center justify-between text-sm font-medium"
+            >
+              Model Settings
+              {settingsOpen ? (
+                <ChevronDown className="h-4 w-4" />
+              ) : (
+                <ChevronRight className="h-4 w-4" />
+              )}
+            </button>
+
+            {settingsOpen && (
+              <div className="mt-2 space-y-3">
+                <div className="space-y-1.5">
+                  <Label htmlFor="max-tokens">Max Tokens</Label>
+                  <Input
+                    id="max-tokens"
+                    type="number"
+                    value={agent.modelSettings?.max_tokens ?? ""}
+                    onChange={(e) =>
+                      onChange({
+                        modelSettings: {
+                          ...agent.modelSettings,
+                          max_tokens: e.target.value
+                            ? Number(e.target.value)
+                            : undefined,
+                        },
+                      })
+                    }
+                    placeholder="4096"
+                  />
+                </div>
+                <div className="space-y-1.5">
+                  <Label htmlFor="temperature">
+                    Temperature ({agent.modelSettings?.temperature ?? 0.7})
+                  </Label>
+                  <input
+                    id="temperature"
+                    type="range"
+                    min="0"
+                    max="2"
+                    step="0.1"
+                    value={agent.modelSettings?.temperature ?? 0.7}
+                    onChange={(e) =>
+                      onChange({
+                        modelSettings: {
+                          ...agent.modelSettings,
+                          temperature: Number(e.target.value),
+                        },
+                      })
+                    }
+                    className="w-full"
+                  />
+                </div>
+                <div className="space-y-1.5">
+                  <Label htmlFor="top-p">
+                    Top P ({agent.modelSettings?.top_p ?? 1})
+                  </Label>
+                  <input
+                    id="top-p"
+                    type="range"
+                    min="0"
+                    max="1"
+                    step="0.05"
+                    value={agent.modelSettings?.top_p ?? 1}
+                    onChange={(e) =>
+                      onChange({
+                        modelSettings: {
+                          ...agent.modelSettings,
+                          top_p: Number(e.target.value),
+                        },
+                      })
+                    }
+                    className="w-full"
+                  />
+                </div>
+              </div>
+            )}
+          </div>
+
+          <Separator />
+
+          {/* Flags */}
+          <div className="space-y-3">
+            <div className="flex items-center justify-between">
+              <Label htmlFor="entry-point">Entry Point</Label>
+              <Switch
+                id="entry-point"
+                checked={agent.isEntryPoint}
+                onCheckedChange={(checked) => onChange({ isEntryPoint: checked })}
+              />
+            </div>
+            <div className="flex items-center justify-between">
+              <Label htmlFor="optional">Optional</Label>
+              <Switch
+                id="optional"
+                checked={agent.isOptional}
+                onCheckedChange={(checked) => onChange({ isOptional: checked })}
+              />
+            </div>
+          </div>
+
+          <Separator />
+
+          {/* Tools */}
+          <div className="space-y-2">
+            <div className="flex items-center justify-between">
+              <Label className="flex items-center gap-1">
+                <Wrench className="h-3.5 w-3.5" />
+                Tools
+              </Label>
+              <Button
+                variant="outline"
+                size="sm"
+                className="h-7 text-xs"
+                onClick={() => setToolPickerOpen(true)}
+              >
+                Add Tool
+              </Button>
+            </div>
+
+            {agent.tools.length === 0 ? (
+              <p className="text-xs text-muted-foreground">No tools assigned.</p>
+            ) : (
+              <div className="space-y-1">
+                {agent.tools.map((tool) => (
+                  <div
+                    key={tool.toolId}
+                    className="flex items-center justify-between rounded border px-2 py-1"
+                  >
+                    <span className="truncate text-xs">{tool.toolName}</span>
+                    <Button
+                      variant="ghost"
+                      size="icon"
+                      className="h-5 w-5 shrink-0"
+                      onClick={() => handleRemoveTool(tool.toolId)}
+                    >
+                      <X className="h-3 w-3" />
+                    </Button>
+                  </div>
+                ))}
+              </div>
+            )}
+          </div>
+
+          <Separator />
+
+          {/* Delete */}
+          <Button
+            variant="destructive"
+            size="sm"
+            className="w-full"
+            onClick={onDelete}
+          >
+            <Trash2 className="mr-2 h-4 w-4" />
+            Delete Agent
+          </Button>
+        </div>
+      </ScrollArea>
+
+      <ToolPicker
+        open={toolPickerOpen}
+        onClose={() => setToolPickerOpen(false)}
+        onSelect={handleAddTool}
+        excludeToolIds={agent.tools.map((t) => t.toolId)}
+      />
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/agency/CommunicationEdge.tsx b/apps/web/client/src/components/agency/CommunicationEdge.tsx
new file mode 100644
index 0000000..fb9e530
--- /dev/null
+++ b/apps/web/client/src/components/agency/CommunicationEdge.tsx
@@ -0,0 +1,72 @@
+import { memo } from "react";
+import { getBezierPath, EdgeLabelRenderer } from "reactflow";
+import type { EdgeProps } from "reactflow";
+import { cn } from "@/lib/utils";
+
+export interface CommunicationEdgeData {
+  flowType: "delegation" | "handoff";
+}
+
+const EDGE_COLORS: Record<string, string> = {
+  delegation: "#3b82f6",
+  handoff: "#8b5cf6",
+};
+
+const LABEL_STYLES: Record<string, string> = {
+  delegation: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
+  handoff: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
+};
+
+export const CommunicationEdge = memo(function CommunicationEdge({
+  id,
+  sourceX,
+  sourceY,
+  targetX,
+  targetY,
+  sourcePosition,
+  targetPosition,
+  data,
+  style = {},
+}: EdgeProps<CommunicationEdgeData>) {
+  const flowType = data?.flowType ?? "delegation";
+  const color = EDGE_COLORS[flowType] ?? EDGE_COLORS.delegation;
+
+  const [edgePath, labelX, labelY] = getBezierPath({
+    sourceX,
+    sourceY,
+    sourcePosition,
+    targetX,
+    targetY,
+    targetPosition,
+  });
+
+  return (
+    <>
+      <path
+        id={id}
+        className="react-flow__edge-path"
+        d={edgePath}
+        style={{
+          ...style,
+          stroke: color,
+          strokeWidth: 2,
+        }}
+        markerEnd={`url(#arrow-${flowType})`}
+      />
+      <EdgeLabelRenderer>
+        <div
+          className={cn(
+            "nodrag nopan pointer-events-auto absolute cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-medium",
+            LABEL_STYLES[flowType],
+          )}
+          style={{
+            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
+          }}
+          data-testid={`edge-label-${id}`}
+        >
+          {flowType}
+        </div>
+      </EdgeLabelRenderer>
+    </>
+  );
+});
diff --git a/apps/web/client/src/components/agency/ToolPicker.tsx b/apps/web/client/src/components/agency/ToolPicker.tsx
new file mode 100644
index 0000000..50d5aba
--- /dev/null
+++ b/apps/web/client/src/components/agency/ToolPicker.tsx
@@ -0,0 +1,162 @@
+import {
+  Dialog,
+  DialogContent,
+  DialogHeader,
+  DialogTitle,
+} from "@/components/ui/dialog";
+import { Input } from "@/components/ui/input";
+import { Badge } from "@/components/ui/badge";
+import { Button } from "@/components/ui/button";
+import { ScrollArea } from "@/components/ui/scroll-area";
+import { Search, Wrench, AlertTriangle } from "lucide-react";
+import { useState, useMemo } from "react";
+import { cn } from "@/lib/utils";
+import { trpc } from "@/lib/trpc";
+
+interface ToolPickerProps {
+  open: boolean;
+  onClose: () => void;
+  onSelect: (tool: { toolId: string; toolName: string }) => void;
+  excludeToolIds: string[];
+}
+
+const RISK_STYLES: Record<string, string> = {
+  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
+  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
+  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
+};
+
+const TYPE_LABELS: Record<string, string> = {
+  builtin: "Built-in",
+  skill: "Skill",
+  sandbox: "Sandbox",
+  custom: "Custom",
+};
+
+export function ToolPicker({
+  open,
+  onClose,
+  onSelect,
+  excludeToolIds,
+}: ToolPickerProps) {
+  const [search, setSearch] = useState("");
+
+  // Attempt to fetch tools from agency.listTools if available,
+  // fall back to empty array if the procedure doesn't exist yet
+  const { data: toolsData } = (trpc as any).agency?.listTools?.useQuery?.(
+    undefined,
+    { enabled: open },
+  ) ?? { data: undefined };
+
+  const tools = useMemo(() => {
+    const allTools: Array<{
+      id: string;
+      name: string;
+      description?: string;
+      toolType?: string;
+      riskLevel?: string;
+      requiresApproval?: boolean;
+    }> = toolsData?.tools ?? [];
+
+    return allTools.filter(
+      (t) =>
+        !excludeToolIds.includes(t.id) &&
+        (!search ||
+          t.name.toLowerCase().includes(search.toLowerCase()) ||
+          t.description?.toLowerCase().includes(search.toLowerCase())),
+    );
+  }, [toolsData, excludeToolIds, search]);
+
+  const grouped = useMemo(() => {
+    const groups: Record<string, typeof tools> = {};
+    for (const tool of tools) {
+      const type = tool.toolType ?? "custom";
+      if (!groups[type]) groups[type] = [];
+      groups[type].push(tool);
+    }
+    return groups;
+  }, [tools]);
+
+  return (
+    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
+      <DialogContent className="sm:max-w-lg">
+        <DialogHeader>
+          <DialogTitle className="flex items-center gap-2">
+            <Wrench className="h-4 w-4" />
+            Select Tool
+          </DialogTitle>
+        </DialogHeader>
+
+        <div className="relative">
+          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
+          <Input
+            value={search}
+            onChange={(e) => setSearch(e.target.value)}
+            placeholder="Search tools..."
+            className="pl-9"
+          />
+        </div>
+
+        <ScrollArea className="max-h-80">
+          {tools.length === 0 ? (
+            <p className="py-8 text-center text-sm text-muted-foreground">
+              {toolsData === undefined
+                ? "Loading tools..."
+                : "No tools available."}
+            </p>
+          ) : (
+            <div className="space-y-4">
+              {Object.entries(grouped).map(([type, typeTools]) => (
+                <div key={type}>
+                  <h4 className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">
+                    {TYPE_LABELS[type] ?? type}
+                  </h4>
+                  <div className="space-y-1">
+                    {typeTools.map((tool) => (
+                      <button
+                        key={tool.id}
+                        type="button"
+                        className="flex w-full items-start gap-2 rounded border px-3 py-2 text-left transition-colors hover:bg-accent"
+                        onClick={() => {
+                          onSelect({ toolId: tool.id, toolName: tool.name });
+                          onClose();
+                        }}
+                      >
+                        <div className="min-w-0 flex-1">
+                          <div className="flex items-center gap-1.5">
+                            <span className="text-sm font-medium">
+                              {tool.name}
+                            </span>
+                            {tool.riskLevel && (
+                              <Badge
+                                variant="secondary"
+                                className={cn(
+                                  "px-1 py-0 text-[10px]",
+                                  RISK_STYLES[tool.riskLevel] ?? "",
+                                )}
+                              >
+                                {tool.riskLevel}
+                              </Badge>
+                            )}
+                            {tool.requiresApproval && (
+                              <AlertTriangle className="h-3 w-3 text-amber-500" />
+                            )}
+                          </div>
+                          {tool.description && (
+                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
+                              {tool.description}
+                            </p>
+                          )}
+                        </div>
+                      </button>
+                    ))}
+                  </div>
+                </div>
+              ))}
+            </div>
+          )}
+        </ScrollArea>
+      </DialogContent>
+    </Dialog>
+  );
+}
diff --git a/apps/web/client/src/components/agency/__tests__/AgencyBuilder.test.tsx b/apps/web/client/src/components/agency/__tests__/AgencyBuilder.test.tsx
new file mode 100644
index 0000000..603ba57
--- /dev/null
+++ b/apps/web/client/src/components/agency/__tests__/AgencyBuilder.test.tsx
@@ -0,0 +1,155 @@
+/**
+ * @vitest-environment jsdom
+ */
+
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent, waitFor } from "@testing-library/react";
+import { createElement } from "react";
+
+// ── React Flow mock ────────────────────────────────────────
+vi.mock("reactflow", () => {
+  const useNodesState = vi.fn(() => {
+    const nodes: any[] = [];
+    return [nodes, vi.fn(), vi.fn()];
+  });
+  const useEdgesState = vi.fn(() => {
+    const edges: any[] = [];
+    return [edges, vi.fn(), vi.fn()];
+  });
+
+  return {
+    __esModule: true,
+    default: ({ children, nodes, edges, onNodeClick, onPaneClick, onConnect }: any) =>
+      createElement(
+        "div",
+        {
+          "data-testid": "react-flow-canvas",
+          "data-nodes": JSON.stringify(nodes ?? []),
+          "data-edges": JSON.stringify(edges ?? []),
+        },
+        children,
+      ),
+    ReactFlowProvider: ({ children }: any) => createElement("div", null, children),
+    useNodesState,
+    useEdgesState,
+    Controls: () => createElement("div", { "data-testid": "rf-controls" }),
+    MiniMap: () => createElement("div", { "data-testid": "rf-minimap" }),
+    Background: () => createElement("div", { "data-testid": "rf-background" }),
+    BackgroundVariant: { Dots: "dots" },
+    MarkerType: { ArrowClosed: "arrowclosed" },
+    Handle: ({ type, position }: any) =>
+      createElement("div", { "data-testid": `handle-${type}-${position}` }),
+    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
+    addEdge: vi.fn((connection: any, edges: any[]) => [
+      ...edges,
+      { id: "e-new", ...connection },
+    ]),
+    EdgeLabelRenderer: ({ children }: any) => createElement("div", null, children),
+    getBezierPath: vi.fn(() => ["M 0 0", 100, 50]),
+  };
+});
+
+// ── tRPC mock ──────────────────────────────────────────────
+const mockUseQuery = vi.fn().mockReturnValue({
+  data: undefined,
+  isLoading: false,
+  isError: false,
+});
+const mockUseMutation = vi.fn().mockReturnValue({
+  mutateAsync: vi.fn().mockResolvedValue({ id: "test-id" }),
+  isPending: false,
+});
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    agency: {
+      getById: { useQuery: (...args: any[]) => mockUseQuery(...args) },
+      update: { useMutation: (...args: any[]) => mockUseMutation(...args) },
+      create: { useMutation: (...args: any[]) => mockUseMutation(...args) },
+    },
+  },
+}));
+
+// ── Auth mock ──────────────────────────────────────────────
+vi.mock("@/contexts/AuthContext", () => ({
+  useAuth: vi.fn().mockReturnValue({
+    isLoading: false,
+    isAuthenticated: true,
+    user: { id: "u1" },
+  }),
+}));
+
+// ── Wouter mock ────────────────────────────────────────────
+const mockSetLocation = vi.fn();
+vi.mock("wouter", () => ({
+  useRoute: vi.fn().mockReturnValue([true, { id: "new" }]),
+  useLocation: vi.fn().mockReturnValue(["/agencies/new/edit", mockSetLocation]),
+}));
+
+// ── Sonner mock ────────────────────────────────────────────
+vi.mock("sonner", () => ({
+  toast: { success: vi.fn(), error: vi.fn() },
+}));
+
+// ── Reactflow CSS no-op ────────────────────────────────────
+vi.mock("reactflow/dist/style.css", () => ({}));
+
+describe("AgencyBuilder", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockUseQuery.mockReturnValue({
+      data: undefined,
+      isLoading: false,
+      isError: false,
+    });
+  });
+
+  it("renders React Flow canvas with initial empty state", async () => {
+    const { default: AgencyBuilder } = await import("@/pages/AgencyBuilder");
+    render(createElement(AgencyBuilder));
+
+    expect(screen.getByTestId("react-flow-canvas")).toBeTruthy();
+    expect(screen.getByTestId("rf-controls")).toBeTruthy();
+    expect(screen.getByTestId("rf-minimap")).toBeTruthy();
+    expect(screen.getByTestId("rf-background")).toBeTruthy();
+  });
+
+  it("shows Add Agent button", async () => {
+    const { default: AgencyBuilder } = await import("@/pages/AgencyBuilder");
+    render(createElement(AgencyBuilder));
+
+    expect(screen.getByTestId("add-agent-btn")).toBeTruthy();
+    expect(screen.getByTestId("add-agent-btn").textContent).toContain(
+      "Add Agent",
+    );
+  });
+
+  it("renders toolbar with agency name and status", async () => {
+    const { default: AgencyBuilder } = await import("@/pages/AgencyBuilder");
+    render(createElement(AgencyBuilder));
+
+    expect(screen.getByText("Untitled Agency")).toBeTruthy();
+    expect(screen.getByText("draft")).toBeTruthy();
+    expect(screen.getByText("Save")).toBeTruthy();
+    expect(screen.getByText("Publish")).toBeTruthy();
+    expect(screen.getByText("Auto Layout")).toBeTruthy();
+    expect(screen.getByText("Test")).toBeTruthy();
+  });
+
+  it("loading state displays spinner when auth is loading", async () => {
+    const { useAuth } = await import("@/contexts/AuthContext");
+    (useAuth as any).mockReturnValue({
+      isLoading: true,
+      isAuthenticated: false,
+    });
+
+    const { default: AgencyBuilder } = await import("@/pages/AgencyBuilder");
+    render(createElement(AgencyBuilder));
+
+    // Should show a loading spinner (Loader2 renders as an svg)
+    expect(
+      document.querySelector(".animate-spin") ||
+        screen.queryByTestId("react-flow-canvas") === null,
+    ).toBeTruthy();
+  });
+});
diff --git a/apps/web/client/src/components/agency/__tests__/AgentNode.test.tsx b/apps/web/client/src/components/agency/__tests__/AgentNode.test.tsx
new file mode 100644
index 0000000..5af2933
--- /dev/null
+++ b/apps/web/client/src/components/agency/__tests__/AgentNode.test.tsx
@@ -0,0 +1,94 @@
+/**
+ * @vitest-environment jsdom
+ */
+
+import { describe, it, expect, vi } from "vitest";
+import { render, screen } from "@testing-library/react";
+import { createElement } from "react";
+
+vi.mock("reactflow", () => ({
+  Handle: ({ type, position }: any) =>
+    createElement("div", { "data-testid": `handle-${type}-${position}` }),
+  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
+}));
+
+import { AgentNode, type AgentNodeData } from "../AgentNode";
+
+function makeProps(overrides: Partial<AgentNodeData> = {}, selected = false) {
+  const data: AgentNodeData = {
+    name: "Research Agent",
+    description: "Handles research tasks",
+    instructions: "Search and summarize.",
+    model: "gpt-4o",
+    modelSettings: {},
+    isEntryPoint: false,
+    isOptional: false,
+    tools: [],
+    ...overrides,
+  };
+  return {
+    id: "node-1",
+    type: "agent",
+    data,
+    selected,
+    isConnectable: true,
+    xPos: 0,
+    yPos: 0,
+    zIndex: 0,
+    dragging: false,
+  } as any;
+}
+
+describe("AgentNode", () => {
+  it("renders agent name and model", () => {
+    render(createElement(AgentNode, makeProps()));
+
+    expect(screen.getByText("Research Agent")).toBeTruthy();
+    expect(screen.getByText("gpt-4o")).toBeTruthy();
+  });
+
+  it("shows entry point badge when isEntryPoint is true", () => {
+    render(createElement(AgentNode, makeProps({ isEntryPoint: true })));
+
+    expect(screen.getByText("entry")).toBeTruthy();
+  });
+
+  it("shows optional badge when isOptional is true", () => {
+    render(createElement(AgentNode, makeProps({ isOptional: true })));
+
+    expect(screen.getByText("optional")).toBeTruthy();
+  });
+
+  it("displays tool count indicator", () => {
+    render(
+      createElement(
+        AgentNode,
+        makeProps({
+          tools: [
+            { toolId: "t1", toolName: "Search" },
+            { toolId: "t2", toolName: "Calculator" },
+          ],
+        }),
+      ),
+    );
+
+    expect(screen.getByText("2 tools")).toBeTruthy();
+  });
+
+  it("renders source and target handles for connections", () => {
+    render(createElement(AgentNode, makeProps()));
+
+    expect(screen.getByTestId("handle-target-top")).toBeTruthy();
+    expect(screen.getByTestId("handle-source-bottom")).toBeTruthy();
+  });
+
+  it("highlights when selected", () => {
+    const { container } = render(
+      createElement(AgentNode, makeProps({}, true)),
+    );
+
+    // Selected node should have ring-2 class
+    const nodeDiv = container.firstElementChild as HTMLElement;
+    expect(nodeDiv.className).toContain("ring-2");
+  });
+});
diff --git a/apps/web/client/src/components/agency/__tests__/AgentPropertyPanel.test.tsx b/apps/web/client/src/components/agency/__tests__/AgentPropertyPanel.test.tsx
new file mode 100644
index 0000000..3ef7189
--- /dev/null
+++ b/apps/web/client/src/components/agency/__tests__/AgentPropertyPanel.test.tsx
@@ -0,0 +1,125 @@
+/**
+ * @vitest-environment jsdom
+ */
+
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent } from "@testing-library/react";
+import { createElement } from "react";
+
+// Mock ToolPicker (it uses trpc internally)
+vi.mock("../ToolPicker", () => ({
+  ToolPicker: ({ open }: any) =>
+    open
+      ? createElement("div", { "data-testid": "tool-picker" }, "Tool Picker")
+      : null,
+}));
+
+import { AgentPropertyPanel } from "../AgentPropertyPanel";
+import type { AgentNodeData } from "../AgentNode";
+
+function makeAgent(overrides: Partial<AgentNodeData> = {}): AgentNodeData {
+  return {
+    name: "Writer Agent",
+    description: "Writes content",
+    instructions: "Write clearly.",
+    model: "gpt-4o",
+    modelSettings: { temperature: 0.7 },
+    isEntryPoint: false,
+    isOptional: false,
+    tools: [],
+    ...overrides,
+  };
+}
+
+describe("AgentPropertyPanel", () => {
+  let onChange: ReturnType<typeof vi.fn>;
+  let onClose: ReturnType<typeof vi.fn>;
+  let onDelete: ReturnType<typeof vi.fn>;
+
+  beforeEach(() => {
+    onChange = vi.fn();
+    onClose = vi.fn();
+    onDelete = vi.fn();
+  });
+
+  function renderPanel(agentOverrides: Partial<AgentNodeData> = {}) {
+    return render(
+      createElement(AgentPropertyPanel, {
+        agent: makeAgent(agentOverrides),
+        onChange,
+        onClose,
+        onDelete,
+      }),
+    );
+  }
+
+  it("displays selected agent name in editable field", () => {
+    renderPanel();
+    const input = screen.getByLabelText("Name") as HTMLInputElement;
+    expect(input.value).toBe("Writer Agent");
+  });
+
+  it("displays model input with current model", () => {
+    renderPanel();
+    const input = screen.getByLabelText("Model") as HTMLInputElement;
+    expect(input.value).toBe("gpt-4o");
+  });
+
+  it("displays instructions textarea", () => {
+    renderPanel();
+    const textarea = screen.getByLabelText("Instructions") as HTMLTextAreaElement;
+    expect(textarea.value).toBe("Write clearly.");
+  });
+
+  it("calls onChange when name field changes", () => {
+    renderPanel();
+    const input = screen.getByLabelText("Name");
+    fireEvent.change(input, { target: { value: "New Name" } });
+    expect(onChange).toHaveBeenCalledWith({ name: "New Name" });
+  });
+
+  it("calls onChange when model is changed", () => {
+    renderPanel();
+    const input = screen.getByLabelText("Model");
+    fireEvent.change(input, { target: { value: "claude-sonnet-4-20250514" } });
+    expect(onChange).toHaveBeenCalledWith({ model: "claude-sonnet-4-20250514" });
+  });
+
+  it("calls onChange when instructions change", () => {
+    renderPanel();
+    const textarea = screen.getByLabelText("Instructions");
+    fireEvent.change(textarea, { target: { value: "Updated instructions" } });
+    expect(onChange).toHaveBeenCalledWith({
+      instructions: "Updated instructions",
+    });
+  });
+
+  it("shows isEntryPoint toggle", () => {
+    renderPanel();
+    expect(screen.getByText("Entry Point")).toBeTruthy();
+  });
+
+  it("shows isOptional toggle", () => {
+    renderPanel();
+    expect(screen.getByText("Optional")).toBeTruthy();
+  });
+
+  it("shows tool list with remove buttons", () => {
+    renderPanel({
+      tools: [
+        { toolId: "t1", toolName: "Search" },
+        { toolId: "t2", toolName: "Calculator" },
+      ],
+    });
+
+    expect(screen.getByText("Search")).toBeTruthy();
+    expect(screen.getByText("Calculator")).toBeTruthy();
+  });
+
+  it("opens ToolPicker when add tool button is clicked", () => {
+    renderPanel();
+    const addBtn = screen.getByText("Add Tool");
+    fireEvent.click(addBtn);
+    expect(screen.getByTestId("tool-picker")).toBeTruthy();
+  });
+});
diff --git a/apps/web/client/src/pages/AgencyBuilder.tsx b/apps/web/client/src/pages/AgencyBuilder.tsx
new file mode 100644
index 0000000..c226403
--- /dev/null
+++ b/apps/web/client/src/pages/AgencyBuilder.tsx
@@ -0,0 +1,502 @@
+import { useState, useCallback, useMemo, useEffect, useRef } from "react";
+import { useRoute, useLocation } from "wouter";
+import ReactFlow, {
+  ReactFlowProvider,
+  addEdge,
+  useNodesState,
+  useEdgesState,
+  Controls,
+  MiniMap,
+  Background,
+  BackgroundVariant,
+  MarkerType,
+  type Node,
+  type Edge,
+  type Connection,
+  type NodeTypes,
+  type ReactFlowInstance,
+} from "reactflow";
+import "reactflow/dist/style.css";
+import { toast } from "sonner";
+import { trpc } from "@/lib/trpc";
+import { useAuth } from "@/contexts/AuthContext";
+import { AgentNode, type AgentNodeData } from "@/components/agency/AgentNode";
+import { CommunicationEdge } from "@/components/agency/CommunicationEdge";
+import { AgentPropertyPanel } from "@/components/agency/AgentPropertyPanel";
+import { AgencyToolbar } from "@/components/agency/AgencyToolbar";
+import { Loader2 } from "lucide-react";
+
+const DEFAULT_AGENT_DATA: AgentNodeData = {
+  name: "New Agent",
+  description: "",
+  instructions: "",
+  model: "",
+  modelSettings: {},
+  isEntryPoint: false,
+  isOptional: false,
+  tools: [],
+};
+
+function autoLayout(nodes: Node<AgentNodeData>[], edges: Edge[]): Node<AgentNodeData>[] {
+  if (nodes.length === 0) return nodes;
+
+  // Simple top-to-bottom tree layout without dagre
+  const adjacency = new Map<string, string[]>();
+  const hasIncoming = new Set<string>();
+
+  for (const edge of edges) {
+    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
+    adjacency.get(edge.source)!.push(edge.target);
+    hasIncoming.add(edge.target);
+  }
+
+  // Find roots (no incoming edges)
+  const roots = nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);
+  if (roots.length === 0) roots.push(nodes[0].id);
+
+  // BFS to assign levels
+  const levels = new Map<string, number>();
+  const queue = roots.map((id) => ({ id, level: 0 }));
+  for (const root of roots) levels.set(root, 0);
+
+  while (queue.length > 0) {
+    const { id, level } = queue.shift()!;
+    for (const child of adjacency.get(id) ?? []) {
+      if (!levels.has(child) || levels.get(child)! < level + 1) {
+        levels.set(child, level + 1);
+        queue.push({ id: child, level: level + 1 });
+      }
+    }
+  }
+
+  // Assign default level to unvisited nodes
+  for (const node of nodes) {
+    if (!levels.has(node.id)) {
+      levels.set(node.id, 0);
+    }
+  }
+
+  // Group by level
+  const levelGroups = new Map<number, string[]>();
+  for (const [id, level] of levels) {
+    if (!levelGroups.has(level)) levelGroups.set(level, []);
+    levelGroups.get(level)!.push(id);
+  }
+
+  const NODE_WIDTH = 240;
+  const NODE_HEIGHT = 100;
+  const H_GAP = 40;
+  const V_GAP = 60;
+
+  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
+  const updated: Node<AgentNodeData>[] = [];
+
+  for (const [level, ids] of levelGroups) {
+    const totalWidth = ids.length * NODE_WIDTH + (ids.length - 1) * H_GAP;
+    const startX = -totalWidth / 2;
+
+    ids.forEach((id, i) => {
+      const node = nodeMap.get(id);
+      if (node) {
+        updated.push({
+          ...node,
+          position: {
+            x: startX + i * (NODE_WIDTH + H_GAP),
+            y: level * (NODE_HEIGHT + V_GAP),
+          },
+        });
+        nodeMap.delete(id);
+      }
+    });
+  }
+
+  // Include any remaining nodes
+  for (const node of nodeMap.values()) {
+    updated.push(node);
+  }
+
+  return updated;
+}
+
+function AgencyCanvas() {
+  const [, setLocation] = useLocation();
+  const [matched, params] = useRoute("/agencies/:id/edit");
+  const agencyId = (params as Record<string, string>)?.id as string | undefined;
+  const isNew = agencyId === "new";
+
+  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNodeData>([]);
+  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
+  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
+  const [agencyName, setAgencyName] = useState("Untitled Agency");
+  const [agencyStatus, setAgencyStatus] = useState<"draft" | "published" | "archived">("draft");
+  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
+  const canvasInitRef = useRef(false);
+  const nodeCounterRef = useRef(0);
+
+  // Auth check
+  const { isLoading: authLoading, isAuthenticated } = useAuth();
+  useEffect(() => {
+    if (!authLoading && !isAuthenticated) {
+      setLocation("/login");
+    }
+  }, [authLoading, isAuthenticated, setLocation]);
+
+  // Load existing agency
+  const { data: agencyData, isLoading: agencyLoading } = (
+    trpc as any
+  ).agency.getById.useQuery(
+    { id: agencyId },
+    {
+      enabled: !!agencyId && !isNew,
+      staleTime: Infinity,
+      refetchOnWindowFocus: false,
+      refetchOnReconnect: false,
+    },
+  );
+
+  // Hydrate canvas from loaded data
+  useEffect(() => {
+    if (!agencyData || canvasInitRef.current) return;
+    canvasInitRef.current = true;
+
+    setAgencyName(agencyData.name ?? "Untitled Agency");
+    setAgencyStatus(agencyData.status ?? "draft");
+
+    // Convert agents to nodes
+    const agentNodes: Node<AgentNodeData>[] = (agencyData.agents ?? []).map(
+      (agent: any) => ({
+        id: agent.id,
+        type: "agent",
+        position: agent.position ?? { x: 0, y: 0 },
+        data: {
+          name: agent.name,
+          description: agent.description ?? "",
+          instructions: agent.instructions ?? "",
+          model: agent.model ?? "",
+          modelSettings: agent.modelSettings ?? {},
+          isEntryPoint: agent.isEntryPoint ?? false,
+          isOptional: agent.isOptional ?? false,
+          tools: (agencyData.agentToolAssignments ?? [])
+            .filter((t: any) => t.agentId === agent.id)
+            .map((t: any) => ({ toolId: t.toolId, toolName: t.toolName ?? t.toolId })),
+        },
+      }),
+    );
+
+    // Convert flows to edges
+    const flowEdges: Edge[] = (agencyData.communicationFlows ?? []).map(
+      (flow: any) => ({
+        id: flow.id,
+        source: flow.fromAgentId,
+        target: flow.toAgentId,
+        type: "communication",
+        data: { flowType: flow.flowType ?? "delegation" },
+        markerEnd: { type: MarkerType.ArrowClosed },
+      }),
+    );
+
+    setNodes(agentNodes);
+    setEdges(flowEdges);
+    nodeCounterRef.current = agentNodes.length;
+  }, [agencyData, setNodes, setEdges]);
+
+  // Node types
+  const nodeTypes: NodeTypes = useMemo(
+    () => ({ agent: AgentNode }),
+    [],
+  );
+
+  const edgeTypes = useMemo(
+    () => ({ communication: CommunicationEdge }),
+    [],
+  );
+
+  // Handlers
+  const onConnect = useCallback(
+    (connection: Connection) => {
+      const newEdge = {
+        ...connection,
+        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
+        type: "communication",
+        data: { flowType: "delegation" as const },
+        markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
+      };
+      setEdges((eds) => addEdge(newEdge, eds));
+    },
+    [setEdges],
+  );
+
+  const onNodeClick = useCallback((_: any, node: Node) => {
+    setSelectedNodeId(node.id);
+  }, []);
+
+  const onPaneClick = useCallback(() => {
+    setSelectedNodeId(null);
+  }, []);
+
+  const handleAddAgent = useCallback(() => {
+    nodeCounterRef.current += 1;
+    const isFirst = nodes.length === 0;
+    const newNode: Node<AgentNodeData> = {
+      id: crypto.randomUUID(),
+      type: "agent",
+      position: {
+        x: 100 + (nodeCounterRef.current % 4) * 280,
+        y: 100 + Math.floor(nodeCounterRef.current / 4) * 160,
+      },
+      data: {
+        ...DEFAULT_AGENT_DATA,
+        name: `Agent ${nodeCounterRef.current}`,
+        isEntryPoint: isFirst,
+      },
+    };
+    setNodes((nds) => [...nds, newNode]);
+    setSelectedNodeId(newNode.id);
+  }, [nodes.length, setNodes]);
+
+  const handleNodeDataChange = useCallback(
+    (nodeId: string, updates: Partial<AgentNodeData>) => {
+      setNodes((nds) =>
+        nds.map((node) => {
+          if (node.id !== nodeId) {
+            // If entry point toggled on for this node, toggle off others
+            if (updates.isEntryPoint) {
+              return {
+                ...node,
+                data: { ...node.data, isEntryPoint: false },
+              };
+            }
+            return node;
+          }
+          return { ...node, data: { ...node.data, ...updates } };
+        }),
+      );
+    },
+    [setNodes],
+  );
+
+  const handleDeleteNode = useCallback(
+    (nodeId: string) => {
+      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
+      setEdges((eds) =>
+        eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
+      );
+      setSelectedNodeId(null);
+    },
+    [setNodes, setEdges],
+  );
+
+  // Save mutation
+  const createMutation = (trpc as any).agency.create.useMutation();
+  const updateMutation = (trpc as any).agency.update.useMutation();
+
+  const handleSave = useCallback(async () => {
+    try {
+      const agents = nodes.map((n) => ({
+        ...(isNew ? {} : { id: n.id }),
+        name: n.data.name,
+        description: n.data.description || undefined,
+        instructions: n.data.instructions,
+        model: n.data.model,
+        modelSettings: n.data.modelSettings,
+        isEntryPoint: n.data.isEntryPoint,
+        isOptional: n.data.isOptional,
+        position: n.position,
+        toolIds: n.data.tools.map((t) => t.toolId),
+      }));
+
+      const communicationFlows = edges.map((e) => ({
+        fromAgentName: nodes.find((n) => n.id === e.source)?.data.name ?? "",
+        toAgentName: nodes.find((n) => n.id === e.target)?.data.name ?? "",
+        flowType: (e.data?.flowType ?? "delegation") as "delegation" | "handoff",
+      }));
+
+      if (isNew) {
+        const slug = agencyName
+          .toLowerCase()
+          .replace(/[^a-z0-9]+/g, "-")
+          .replace(/^-|-$/g, "")
+          || `agency-${Date.now()}`;
+
+        const result = await createMutation.mutateAsync({
+          name: agencyName,
+          slug,
+          agents,
+          communicationFlows,
+        });
+
+        toast.success("Agency created");
+        setLocation(`/agencies/${result.id}/edit`);
+      } else {
+        await updateMutation.mutateAsync({
+          id: agencyId,
+          name: agencyName,
+          status: agencyStatus,
+        });
+        toast.success("Agency saved");
+      }
+    } catch (err: any) {
+      toast.error(err?.message ?? "Failed to save agency");
+    }
+  }, [
+    nodes,
+    edges,
+    isNew,
+    agencyId,
+    agencyName,
+    agencyStatus,
+    createMutation,
+    updateMutation,
+    setLocation,
+  ]);
+
+  const handlePublish = useCallback(async () => {
+    // Validation
+    const entryPoints = nodes.filter((n) => n.data.isEntryPoint);
+    if (entryPoints.length === 0) {
+      toast.error("At least one agent must be the entry point");
+      return;
+    }
+    if (edges.length === 0 && nodes.length > 1) {
+      toast.error("Add communication flows between agents");
+      return;
+    }
+    const missingModel = nodes.find((n) => !n.data.model);
+    if (missingModel) {
+      toast.error(`Agent "${missingModel.data.name}" needs a model`);
+      return;
+    }
+    const missingInstructions = nodes.find((n) => !n.data.instructions);
+    if (missingInstructions) {
+      toast.error(`Agent "${missingInstructions.data.name}" needs instructions`);
+      return;
+    }
+
+    try {
+      if (isNew) {
+        // Save first, then publish
+        toast.error("Save the agency first before publishing");
+        return;
+      }
+      await updateMutation.mutateAsync({
+        id: agencyId,
+        status: "published",
+      });
+      setAgencyStatus("published");
+      toast.success("Agency published");
+    } catch (err: any) {
+      toast.error(err?.message ?? "Failed to publish agency");
+    }
+  }, [nodes, edges, isNew, agencyId, updateMutation]);
+
+  const handleAutoLayout = useCallback(() => {
+    const layouted = autoLayout(nodes, edges);
+    setNodes(layouted);
+    setTimeout(() => rfInstance?.fitView({ padding: 0.2 }), 50);
+    toast.success("Layout applied");
+  }, [nodes, edges, setNodes, rfInstance]);
+
+  const handleTest = useCallback(() => {
+    if (agencyId && !isNew) {
+      setLocation(`/agencies/${agencyId}`);
+    } else {
+      toast.error("Save the agency first to test it");
+    }
+  }, [agencyId, isNew, setLocation]);
+
+  const handleBack = useCallback(() => {
+    setLocation("/agencies");
+  }, [setLocation]);
+
+  const selectedNode = selectedNodeId
+    ? nodes.find((n) => n.id === selectedNodeId)
+    : null;
+
+  const isSaving = createMutation.isPending || updateMutation.isPending;
+
+  if (authLoading || (!isNew && agencyLoading)) {
+    return (
+      <div className="flex h-screen items-center justify-center">
+        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
+      </div>
+    );
+  }
+
+  return (
+    <div className="flex h-screen flex-col">
+      <AgencyToolbar
+        agencyName={agencyName}
+        agencyStatus={agencyStatus}
+        isSaving={isSaving}
+        onSave={handleSave}
+        onPublish={handlePublish}
+        onAutoLayout={handleAutoLayout}
+        onTest={handleTest}
+        onBack={handleBack}
+      />
+
+      <div className="flex flex-1 overflow-hidden">
+        {/* Canvas */}
+        <div className="flex-1">
+          <ReactFlow
+            nodes={nodes}
+            edges={edges}
+            onNodesChange={onNodesChange}
+            onEdgesChange={onEdgesChange}
+            onConnect={onConnect}
+            onNodeClick={onNodeClick}
+            onPaneClick={onPaneClick}
+            onInit={setRfInstance}
+            nodeTypes={nodeTypes}
+            edgeTypes={edgeTypes}
+            fitView
+            defaultEdgeOptions={{
+              type: "communication",
+              markerEnd: { type: MarkerType.ArrowClosed },
+            }}
+          >
+            <Controls />
+            <MiniMap
+              nodeColor={(node) =>
+                node.data?.isEntryPoint ? "#22c55e" : "#94a3b8"
+              }
+              zoomable
+              pannable
+            />
+            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
+          </ReactFlow>
+        </div>
+
+        {/* Add Agent FAB */}
+        <button
+          type="button"
+          onClick={handleAddAgent}
+          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
+          data-testid="add-agent-btn"
+        >
+          + Add Agent
+        </button>
+
+        {/* Property Panel */}
+        {selectedNode && (
+          <AgentPropertyPanel
+            agent={selectedNode.data}
+            onChange={(updates) =>
+              handleNodeDataChange(selectedNode.id, updates)
+            }
+            onClose={() => setSelectedNodeId(null)}
+            onDelete={() => handleDeleteNode(selectedNode.id)}
+          />
+        )}
+      </div>
+    </div>
+  );
+}
+
+export default function AgencyBuilder() {
+  return (
+    <ReactFlowProvider>
+      <AgencyCanvas />
+    </ReactFlowProvider>
+  );
+}
