diff --git a/apps/web/client/src/components/agency/ExportAsSkillDialog.tsx b/apps/web/client/src/components/agency/ExportAsSkillDialog.tsx
new file mode 100644
index 00000000..1f7c69bb
--- /dev/null
+++ b/apps/web/client/src/components/agency/ExportAsSkillDialog.tsx
@@ -0,0 +1,134 @@
+/**
+ * ExportAsSkillDialog — Export a sub-graph of agency nodes as a reusable skill definition.
+ *
+ * Accessible from the AgencyBuilder toolbar when nodes are selected.
+ * Generates skill.md, input.schema.json, and registers in skill registry.
+ */
+
+import { useState } from "react";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
+import { Textarea } from "@/components/ui/textarea";
+import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
+import { Package } from "lucide-react";
+import type { AgencyNodeData } from "./nodes/types";
+
+interface ExportAsSkillDialogProps {
+  open: boolean;
+  onOpenChange: (open: boolean) => void;
+  selectedNodes: Array<{ id: string; data: AgencyNodeData }>;
+  onExport: (config: ExportConfig) => void;
+}
+
+interface ExportConfig {
+  name: string;
+  description: string;
+  category: string;
+}
+
+const CATEGORIES = [
+  { value: "prompt_enhancement", label: "Prompt Enhancement" },
+  { value: "image_generation", label: "Image Generation" },
+  { value: "video_generation", label: "Video Generation" },
+  { value: "audio_generation", label: "Audio Generation" },
+  { value: "chat_assistant", label: "Chat Assistant" },
+];
+
+export function ExportAsSkillDialog({
+  open,
+  onOpenChange,
+  selectedNodes,
+  onExport,
+}: ExportAsSkillDialogProps) {
+  const entryNode = selectedNodes[0];
+  const defaultName = entryNode
+    ? entryNode.data.name.toLowerCase().replace(/\s+/g, "-")
+    : "exported-skill";
+
+  const defaultDescription = selectedNodes
+    .map((n) => n.data.instructions || n.data.description || "")
+    .filter(Boolean)
+    .join("; ")
+    .slice(0, 200);
+
+  const [name, setName] = useState(defaultName);
+  const [description, setDescription] = useState(defaultDescription);
+  const [category, setCategory] = useState("prompt_enhancement");
+
+  const handleExport = () => {
+    onExport({ name, description, category });
+    onOpenChange(false);
+  };
+
+  return (
+    <Dialog open={open} onOpenChange={onOpenChange}>
+      <DialogContent className="max-w-md">
+        <DialogHeader>
+          <DialogTitle className="flex items-center gap-2">
+            <Package className="h-4 w-4 text-teal-500" />
+            Export as Skill
+          </DialogTitle>
+        </DialogHeader>
+
+        <div className="space-y-3 py-2">
+          <div className="space-y-1.5">
+            <Label>Skill Name</Label>
+            <Input
+              value={name}
+              onChange={(e) => setName(e.target.value)}
+              placeholder="my-skill-name"
+            />
+          </div>
+
+          <div className="space-y-1.5">
+            <Label>Description</Label>
+            <Textarea
+              value={description}
+              onChange={(e) => setDescription(e.target.value)}
+              placeholder="What does this skill do?"
+              rows={3}
+            />
+          </div>
+
+          <div className="space-y-1.5">
+            <Label>Category</Label>
+            <select
+              value={category}
+              onChange={(e) => setCategory(e.target.value)}
+              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
+            >
+              {CATEGORIES.map((cat) => (
+                <option key={cat.value} value={cat.value}>
+                  {cat.label}
+                </option>
+              ))}
+            </select>
+          </div>
+
+          <div className="bg-muted/50 rounded-md p-2">
+            <p className="text-[10px] text-muted-foreground">
+              {selectedNodes.length} node{selectedNodes.length > 1 ? "s" : ""} selected:
+              {" "}{selectedNodes.map((n) => n.data.name).join(", ")}
+            </p>
+          </div>
+
+          <div className="bg-slate-50 rounded-md p-2 border">
+            <p className="text-[10px] font-mono text-slate-600 whitespace-pre-wrap">
+              {`---\nname: ${name}\ncategory: ${category}\ndescription: |\n  ${description.slice(0, 100)}\n---\n\n# ${name}\n\n${description}`}
+            </p>
+          </div>
+        </div>
+
+        <DialogFooter>
+          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
+            Cancel
+          </Button>
+          <Button size="sm" onClick={handleExport} disabled={!name.trim()}>
+            Export Skill
+          </Button>
+        </DialogFooter>
+      </DialogContent>
+    </Dialog>
+  );
+}
diff --git a/apps/web/client/src/components/agency/NodePropertyPanel.tsx b/apps/web/client/src/components/agency/NodePropertyPanel.tsx
index a12012da..902d2aae 100644
--- a/apps/web/client/src/components/agency/NodePropertyPanel.tsx
+++ b/apps/web/client/src/components/agency/NodePropertyPanel.tsx
@@ -201,6 +201,7 @@ export function NodePropertyPanel({ node, nodeId, siblingNodes = [], agencyId, o
           {nodeType === "conditional_branch" && <ConditionalBranchForm node={node} onChange={onChange} siblingNodes={siblingNodes} />}
           {nodeType === "parallel_fan_out" && <ParallelFanOutForm node={node} onChange={onChange} siblingNodes={siblingNodes} />}
           {nodeType === "loop_retry" && <LoopRetryForm node={node} onChange={onChange} siblingNodes={siblingNodes} />}
+          {nodeType === "skill_discovery" && <SkillDiscoveryForm node={node} onChange={onChange} />}
 
           <Separator />
 
@@ -2971,3 +2972,133 @@ function LoopRetryForm({
     </>
   );
 }
+
+// ── Skill Discovery Form ────────────────────────────────────────────────────
+
+const SKILL_CATEGORIES = [
+  { value: "prompt_enhancement", label: "Prompt Enhancement" },
+  { value: "image_generation", label: "Image Generation" },
+  { value: "video_generation", label: "Video Generation" },
+  { value: "audio_generation", label: "Audio Generation" },
+  { value: "chat_assistant", label: "Chat Assistant" },
+] as const;
+
+function SkillDiscoveryForm({
+  node,
+  onChange,
+}: {
+  node: AgencyNodeData;
+  onChange: (updates: Partial<AgencyNodeData>) => void;
+}) {
+  const taskSource = ncGet<string>(node, "taskSource", "static");
+  const taskValue = ncGet<string>(node, "taskValue", "");
+  const contextKey = ncGet<string>(node, "contextKey", "");
+  const confidenceThreshold = ncGet<number>(node, "confidenceThreshold", 0.7);
+  const maxResults = ncGet<number>(node, "maxResults", 5);
+  const skillCategories = ncGet<string[]>(node, "skillCategories", []);
+
+  const toggleCategory = (cat: string) => {
+    const next = skillCategories.includes(cat)
+      ? skillCategories.filter((c) => c !== cat)
+      : [...skillCategories, cat];
+    onChange(ncSet(node, "skillCategories", next));
+  };
+
+  return (
+    <>
+      <div className="space-y-1.5">
+        <Label>Name</Label>
+        <Input
+          value={node.name}
+          onChange={(e) => onChange({ name: e.target.value })}
+          placeholder="Skill discovery node"
+        />
+      </div>
+
+      <div className="space-y-1.5">
+        <Label>Task Source</Label>
+        <select
+          value={taskSource}
+          onChange={(e) => onChange(ncSet(node, "taskSource", e.target.value))}
+          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
+        >
+          <option value="static">Static text</option>
+          <option value="context">From context key</option>
+          <option value="previous_output">Previous node output</option>
+        </select>
+      </div>
+
+      {taskSource === "static" && (
+        <div className="space-y-1.5">
+          <Label>Task Description</Label>
+          <Input
+            value={taskValue}
+            onChange={(e) => onChange(ncSet(node, "taskValue", e.target.value))}
+            placeholder="e.g. generate a product image"
+            maxLength={500}
+          />
+        </div>
+      )}
+
+      {taskSource === "context" && (
+        <div className="space-y-1.5">
+          <Label>Context Key</Label>
+          <Input
+            value={contextKey}
+            onChange={(e) => onChange(ncSet(node, "contextKey", e.target.value))}
+            placeholder="e.g. task_description"
+            maxLength={100}
+          />
+        </div>
+      )}
+
+      <Separator />
+
+      <div className="space-y-1.5">
+        <Label>Confidence Threshold</Label>
+        <Input
+          type="number"
+          value={confidenceThreshold}
+          onChange={(e) => onChange(ncSet(node, "confidenceThreshold", Number(e.target.value)))}
+          min={0}
+          max={1}
+          step={0.05}
+          className="text-xs h-7"
+        />
+        <p className="text-[10px] text-muted-foreground">Minimum confidence score (0.0 - 1.0)</p>
+      </div>
+
+      <div className="space-y-1.5">
+        <Label>Max Results</Label>
+        <Input
+          type="number"
+          value={maxResults}
+          onChange={(e) => onChange(ncSet(node, "maxResults", Number(e.target.value)))}
+          min={1}
+          max={10}
+          className="text-xs h-7"
+        />
+      </div>
+
+      <div className="space-y-1.5">
+        <Label>Skill Categories (optional filter)</Label>
+        <div className="flex flex-wrap gap-1.5">
+          {SKILL_CATEGORIES.map((cat) => (
+            <button
+              key={cat.value}
+              type="button"
+              onClick={() => toggleCategory(cat.value)}
+              className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
+                skillCategories.includes(cat.value)
+                  ? "bg-teal-50 border-teal-300 text-teal-700"
+                  : "bg-background border-input text-muted-foreground hover:bg-accent/50"
+              }`}
+            >
+              {cat.label}
+            </button>
+          ))}
+        </div>
+      </div>
+    </>
+  );
+}
diff --git a/apps/web/client/src/components/agency/SkillInputMapper.tsx b/apps/web/client/src/components/agency/SkillInputMapper.tsx
new file mode 100644
index 00000000..ee4eaa4d
--- /dev/null
+++ b/apps/web/client/src/components/agency/SkillInputMapper.tsx
@@ -0,0 +1,137 @@
+/**
+ * SkillInputMapper — Per-field input mapping UI for skill_call nodes.
+ *
+ * For each field in a skill's input schema, allows selecting the source:
+ *   - "static" — user enters a fixed value
+ *   - "node_output" — selects a sibling node + output field
+ *   - "context" — enters a context key name
+ */
+
+import { useState } from "react";
+import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
+
+interface InputMapping {
+  source: "static" | "node_output" | "context";
+  value?: unknown;
+  nodeId?: string;
+  outputField?: string;
+  contextKey?: string;
+}
+
+interface SkillInputMapperProps {
+  /** Current input mappings from nodeConfig */
+  inputMappings: Record<string, InputMapping>;
+  /** List of sibling node IDs + names for node_output references */
+  siblingNodes: Array<{ id: string; name: string }>;
+  /** Callback when mappings change */
+  onChange: (mappings: Record<string, InputMapping>) => void;
+  /** Skill input schema fields (field name → type label) */
+  fields: Array<{ name: string; type: string; description?: string }>;
+}
+
+export function SkillInputMapper({
+  inputMappings,
+  siblingNodes,
+  onChange,
+  fields,
+}: SkillInputMapperProps) {
+  const [expandedField, setExpandedField] = useState<string | null>(null);
+
+  const updateField = (fieldName: string, mapping: InputMapping) => {
+    onChange({ ...inputMappings, [fieldName]: mapping });
+  };
+
+  if (fields.length === 0) {
+    return (
+      <p className="text-xs text-muted-foreground py-2">
+        No input fields defined for this skill.
+      </p>
+    );
+  }
+
+  return (
+    <div className="space-y-2">
+      <Label className="text-xs font-medium">Input Mappings</Label>
+      {fields.map((field) => {
+        const mapping = inputMappings[field.name] ?? { source: "static", value: "" };
+        const isExpanded = expandedField === field.name;
+
+        return (
+          <div key={field.name} className="border rounded-md p-2 space-y-1.5 bg-muted/30">
+            <button
+              type="button"
+              className="w-full flex items-center justify-between text-left"
+              onClick={() => setExpandedField(isExpanded ? null : field.name)}
+            >
+              <div className="flex items-center gap-1.5">
+                <span className="text-xs font-medium">{field.name}</span>
+                <span className="text-[10px] text-muted-foreground">({field.type})</span>
+              </div>
+              <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">
+                {mapping.source}
+              </span>
+            </button>
+
+            {isExpanded && (
+              <div className="space-y-1.5 pt-1">
+                {field.description && (
+                  <p className="text-[10px] text-muted-foreground">{field.description}</p>
+                )}
+
+                <select
+                  value={mapping.source}
+                  onChange={(e) => updateField(field.name, { source: e.target.value as InputMapping["source"] })}
+                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
+                >
+                  <option value="static">Static value</option>
+                  <option value="node_output">Node output</option>
+                  <option value="context">Context key</option>
+                </select>
+
+                {mapping.source === "static" && (
+                  <Input
+                    value={String(mapping.value ?? "")}
+                    onChange={(e) => updateField(field.name, { ...mapping, value: e.target.value })}
+                    placeholder="Enter value..."
+                    className="text-xs h-7"
+                  />
+                )}
+
+                {mapping.source === "node_output" && (
+                  <div className="flex gap-1.5">
+                    <select
+                      value={mapping.nodeId ?? ""}
+                      onChange={(e) => updateField(field.name, { ...mapping, nodeId: e.target.value })}
+                      className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
+                    >
+                      <option value="">Select node...</option>
+                      {siblingNodes.map((n) => (
+                        <option key={n.id} value={n.id}>{n.name}</option>
+                      ))}
+                    </select>
+                    <Input
+                      value={mapping.outputField ?? ""}
+                      onChange={(e) => updateField(field.name, { ...mapping, outputField: e.target.value })}
+                      placeholder="Output field"
+                      className="flex-1 text-xs h-7"
+                    />
+                  </div>
+                )}
+
+                {mapping.source === "context" && (
+                  <Input
+                    value={mapping.contextKey ?? ""}
+                    onChange={(e) => updateField(field.name, { ...mapping, contextKey: e.target.value })}
+                    placeholder="Context key name"
+                    className="text-xs h-7"
+                  />
+                )}
+              </div>
+            )}
+          </div>
+        );
+      })}
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx b/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx
index e60348cd..9a493a44 100644
--- a/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx
+++ b/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx
@@ -12,6 +12,7 @@ import { BrowserSessionNodeCard } from "./BrowserSessionNodeCard";
 import { ConditionalBranchNodeCard } from "./ConditionalBranchNodeCard";
 import { ParallelFanOutNodeCard } from "./ParallelFanOutNodeCard";
 import { LoopRetryNodeCard } from "./LoopRetryNodeCard";
+import { SkillDiscoveryNodeCard } from "./SkillDiscoveryNodeCard";
 
 /**
  * Single ReactFlow node type dispatcher.
@@ -42,6 +43,8 @@ export const BaseAgencyNode = memo(function BaseAgencyNode(props: NodeProps<Agen
       return <ParallelFanOutNodeCard {...props} />;
     case "loop_retry":
       return <LoopRetryNodeCard {...props} />;
+    case "skill_discovery":
+      return <SkillDiscoveryNodeCard {...props} />;
     default:
       return <AgentNodeCard {...props} />;
   }
diff --git a/apps/web/client/src/components/agency/nodes/SkillDiscoveryNodeCard.tsx b/apps/web/client/src/components/agency/nodes/SkillDiscoveryNodeCard.tsx
new file mode 100644
index 00000000..b32bf426
--- /dev/null
+++ b/apps/web/client/src/components/agency/nodes/SkillDiscoveryNodeCard.tsx
@@ -0,0 +1,60 @@
+import { memo } from "react";
+import { Handle, Position } from "reactflow";
+import type { NodeProps } from "reactflow";
+import { Search, AlertCircle } from "lucide-react";
+import { cn } from "@/lib/utils";
+import type { AgencyNodeData } from "./types";
+
+export const SkillDiscoveryNodeCard = memo(function SkillDiscoveryNodeCard({
+  data,
+  selected,
+}: NodeProps<AgencyNodeData>) {
+  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
+  const taskSource = (data.nodeConfig?.taskSource as string) ?? "";
+  const threshold = (data.nodeConfig?.confidenceThreshold as number) ?? 0.7;
+
+  return (
+    <div
+      className={cn(
+        "w-52 rounded-lg border-2 bg-white shadow-sm transition-all",
+        "border-teal-300",
+        selected && "ring-2 ring-teal-500 shadow-md border-teal-500",
+      )}
+    >
+      <Handle
+        type="target"
+        position={Position.Top}
+        className="!h-2.5 !w-2.5 !border-2 !border-teal-400 !bg-white"
+      />
+
+      <div className="px-3 py-2.5">
+        <div className="flex items-start justify-between gap-1 mb-1">
+          <div className="flex items-center gap-1.5 min-w-0">
+            <Search className="h-3.5 w-3.5 shrink-0 text-teal-500" />
+            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
+          </div>
+          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
+        </div>
+
+        {taskSource ? (
+          <div className="space-y-0.5">
+            <p className="truncate text-[11px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">
+              Source: {taskSource.replace(/_/g, " ")}
+            </p>
+            <p className="text-[10px] text-slate-400">
+              Threshold: {threshold}
+            </p>
+          </div>
+        ) : (
+          <p className="text-[11px] text-amber-500">Not configured</p>
+        )}
+      </div>
+
+      <Handle
+        type="source"
+        position={Position.Bottom}
+        className="!h-2.5 !w-2.5 !border-2 !border-teal-400 !bg-white"
+      />
+    </div>
+  );
+});
diff --git a/apps/web/client/src/components/agency/nodes/types.ts b/apps/web/client/src/components/agency/nodes/types.ts
index 48867453..0d4a4543 100644
--- a/apps/web/client/src/components/agency/nodes/types.ts
+++ b/apps/web/client/src/components/agency/nodes/types.ts
@@ -9,7 +9,8 @@ export type AgencyNodeType =
   | "browser_session"
   | "conditional_branch"
   | "parallel_fan_out"
-  | "loop_retry";
+  | "loop_retry"
+  | "skill_discovery";
 
 export interface AgencyNodeData {
   nodeType: AgencyNodeType;
diff --git a/apps/web/server/lib/agencySvgGenerator.ts b/apps/web/server/lib/agencySvgGenerator.ts
index 08cbc1ef..5da7041a 100644
--- a/apps/web/server/lib/agencySvgGenerator.ts
+++ b/apps/web/server/lib/agencySvgGenerator.ts
@@ -26,6 +26,7 @@ const NODE_TYPE_COLORS: Record<string, string> = {
   knowledge_base: "#10B981",  // green
   skill_call: "#F59E0B",      // amber
   human_approval: "#EF4444",  // red
+  skill_discovery: "#14B8A6",  // teal
 };
 
 const DEFAULT_COLOR = "#6B7280";
diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index 069de44d..a7c79c69 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -808,7 +808,7 @@ export const agencyRouter = router({
               description: z.string().optional(),
               nodeType: z.enum([
                 "agent", "supervisor", "router", "aggregator",
-                "knowledge_base", "skill_call", "human_approval", "browser_session", "conditional_branch", "parallel_fan_out", "loop_retry",
+                "knowledge_base", "skill_call", "human_approval", "browser_session", "conditional_branch", "parallel_fan_out", "loop_retry", "skill_discovery",
               ]).default("agent"),
               instructions: z.string().max(50000).optional(),
               model: z.string().max(100).regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid model identifier").optional(),
@@ -1062,7 +1062,7 @@ export const agencyRouter = router({
             description: z.string().optional(),
             nodeType: z.enum([
               "agent", "supervisor", "router", "aggregator",
-              "knowledge_base", "skill_call", "human_approval", "browser_session", "conditional_branch", "parallel_fan_out", "loop_retry",
+              "knowledge_base", "skill_call", "human_approval", "browser_session", "conditional_branch", "parallel_fan_out", "loop_retry", "skill_discovery",
             ]).default("agent"),
             instructions: z.string().max(50000).optional(),
             model: z.string().max(100).regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid model identifier").optional(),
@@ -1201,6 +1201,47 @@ export const agencyRouter = router({
                 ctx.addIssue({ code: "custom", path: ["nodeConfig", "feedbackPrompt"], message: "feedbackPrompt max 500 chars" });
               }
             }
+            // Validate skill_discovery config
+            if (data.nodeType === "skill_discovery") {
+              const cfg = data.nodeConfig as any;
+              const taskSource = cfg?.taskSource;
+              if (!taskSource || !["static", "context", "previous_output"].includes(taskSource)) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "taskSource"], message: "skill_discovery requires taskSource (static, context, or previous_output)" });
+              }
+              if (taskSource === "static" && !cfg?.taskValue) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "taskValue"], message: "taskValue is required when taskSource is static" });
+              }
+              if (taskSource === "context" && !cfg?.contextKey) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "contextKey"], message: "contextKey is required when taskSource is context" });
+              }
+              const threshold = cfg?.confidenceThreshold;
+              if (threshold !== undefined && (typeof threshold !== "number" || threshold < 0 || threshold > 1)) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "confidenceThreshold"], message: "confidenceThreshold must be 0.0 to 1.0" });
+              }
+              const maxResults = cfg?.maxResults;
+              if (maxResults !== undefined && (typeof maxResults !== "number" || maxResults < 1 || maxResults > 10)) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "maxResults"], message: "maxResults must be 1-10" });
+              }
+            }
+            // Validate skill_call inputMappings
+            if (data.nodeType === "skill_call") {
+              const cfg = data.nodeConfig as any;
+              const mappings = cfg?.inputMappings;
+              if (mappings && typeof mappings === "object") {
+                for (const [field, mapping] of Object.entries(mappings)) {
+                  const m = mapping as any;
+                  if (!m?.source || !["static", "node_output", "context"].includes(m.source)) {
+                    ctx.addIssue({ code: "custom", path: ["nodeConfig", "inputMappings", field], message: `Invalid source type for field "${field}"` });
+                  }
+                  if (m?.source === "node_output" && (!m?.nodeId || !m?.outputField)) {
+                    ctx.addIssue({ code: "custom", path: ["nodeConfig", "inputMappings", field], message: `node_output requires nodeId and outputField for field "${field}"` });
+                  }
+                  if (m?.source === "context" && !m?.contextKey) {
+                    ctx.addIssue({ code: "custom", path: ["nodeConfig", "inputMappings", field], message: `context source requires contextKey for field "${field}"` });
+                  }
+                }
+              }
+            }
             // Validate knowledgeBase config
             const kb = (data.nodeConfig as any)?.knowledgeBase;
             if (kb && ["agent", "supervisor"].includes(data.nodeType)) {
diff --git a/python-backend/app/services/agency_orchestrator.py b/python-backend/app/services/agency_orchestrator.py
index c20d1964..7da443e4 100644
--- a/python-backend/app/services/agency_orchestrator.py
+++ b/python-backend/app/services/agency_orchestrator.py
@@ -35,6 +35,8 @@ from app.services.agency_conditional_branch import (
     evaluate_rule_based,
 )
 from app.services.agency_run_context import AgencyRunContext
+from app.services.agency_skill_discovery import execute_skill_discovery
+from app.services.agency_skill_input_mapper import resolve_skill_input_mappings
 from app.services.agency_trace_collector import TraceCollector
 
 logger = structlog.get_logger(__name__)
@@ -290,6 +292,15 @@ class AgencyOrchestrator:
             case "skill_call":
                 result = await self._call_skill(node, ctx)
 
+            case "skill_discovery":
+                cfg = node.get("node_config") or {}
+                result = await execute_skill_discovery(
+                    node_name=node.get("name", node_id),
+                    node_config=cfg,
+                    context=ctx.shared_context or AgencyRunContext(),
+                    results=ctx.results,
+                )
+
             case "human_approval":
                 result = await self._await_approval(node, ctx)
 
@@ -1073,9 +1084,20 @@ class AgencyOrchestrator:
         cfg: dict = skill_node.get("node_config") or {}
         skill_slug: str | None = cfg.get("skillSlug")
         skill_id: str | None = cfg.get("skillId")
+        node_name = skill_node.get("name", skill_node.get("id", ""))
 
         if not skill_slug and not skill_id:
-            return f"[Skill node '{skill_node.get('name')}': no skillSlug configured]"
+            return f"[Skill node '{node_name}': no skillSlug configured]"
+
+        # Resolve input mappings (section-20 enhancement)
+        input_mappings = cfg.get("inputMappings")
+        resolved_input: str | dict = ctx.input
+        if input_mappings and ctx.shared_context:
+            mapped = await resolve_skill_input_mappings(
+                input_mappings, ctx.shared_context, ctx.results
+            )
+            if mapped is not None:
+                resolved_input = mapped
 
         python_backend = os.getenv("PYTHON_BACKEND_INTERNAL_URL", "http://127.0.0.1:8000")
         try:
@@ -1084,19 +1106,48 @@ class AgencyOrchestrator:
                     f"{python_backend}/api/v1/skills/execute",
                     json={
                         "skill_slug": skill_slug or skill_id,
-                        "input": ctx.input,
+                        "input": resolved_input,
                         "context": ctx.get_context_text(),
                     },
                     headers={"Authorization": f"Bearer {ctx.user_token}"},
                 )
                 if resp.status_code == 200:
                     data = resp.json()
-                    return data.get("output", "") or data.get("result", "")
+                    result_text = data.get("output", "") or data.get("result", "")
+                    # Output routing by skill category
+                    category = data.get("category", "")
+                    await self._route_skill_output(
+                        node_name, category, result_text, data, ctx
+                    )
+                    # Chain metadata
+                    chain_to = data.get("chainTo")
+                    if chain_to and ctx.shared_context:
+                        await ctx.shared_context.set(f"{node_name}_chainTo", chain_to)
+                        logger.info("agency_skill_chain_detected", node=node_name, chain_to=chain_to)
+                    return result_text
                 return f"[Skill '{skill_slug}' returned HTTP {resp.status_code}]"
         except Exception as exc:
             logger.error("agency_skill_call_failed", skill=skill_slug, error=str(exc)[:100])
             return f"[Skill '{skill_slug}' failed: {str(exc)[:100]}]"
 
+    async def _route_skill_output(
+        self,
+        node_name: str,
+        category: str,
+        result_text: str,
+        data: dict[str, Any],
+        ctx: ExecutionContext,
+    ) -> None:
+        """Route skill output to context based on skill category."""
+        if not ctx.shared_context or not category:
+            return
+        if category in ("image_generation", "audio_generation"):
+            media_url = data.get("media_url") or data.get("url") or result_text
+            await ctx.shared_context.set(f"{node_name}_media_url", media_url)
+        elif category == "video_generation":
+            job_ref = data.get("job_id") or data.get("task_id") or result_text
+            await ctx.shared_context.set(f"{node_name}_job", job_ref)
+
     async def _await_approval(self, approval_node: NodeRow, ctx: ExecutionContext) -> str:
         """Create an approval request and wait for decision via SSE + context polling."""
         from app.services.agency_approval_tool import (
diff --git a/python-backend/app/services/agency_skill_discovery.py b/python-backend/app/services/agency_skill_discovery.py
new file mode 100644
index 00000000..bb7c9bcb
--- /dev/null
+++ b/python-backend/app/services/agency_skill_discovery.py
@@ -0,0 +1,122 @@
+"""Skill discovery node handler for agency orchestrator.
+
+Calls the Node.js skill-discovery internal endpoint to find matching skills,
+filters by confidence threshold, and stores results in AgencyRunContext.
+"""
+
+from __future__ import annotations
+
+import os
+from typing import Any
+
+import httpx
+import structlog
+
+from app.services.agency_run_context import AgencyRunContext
+
+logger = structlog.get_logger(__name__)
+
+MAX_RESULTS_CAP = 10
+
+
+async def execute_skill_discovery(
+    *,
+    node_name: str,
+    node_config: dict[str, Any],
+    context: AgencyRunContext,
+    results: dict[str, Any],
+) -> str:
+    """Execute a skill_discovery node: find skills matching a task description.
+
+    Returns a summary string as node output and stores the full result list
+    in context under '{node_name}_discovered'.
+    """
+    task_source = node_config.get("taskSource", "static")
+    confidence_threshold = float(node_config.get("confidenceThreshold", 0.7))
+    max_results = min(int(node_config.get("maxResults", 5)), MAX_RESULTS_CAP)
+    skill_categories: list[str] = node_config.get("skillCategories") or []
+
+    # Resolve task description
+    task_description = await _resolve_task(task_source, node_config, context, results)
+    if not task_description:
+        await context.set(f"{node_name}_discovered", [])
+        return "Skill discovery: no task description provided"
+
+    # Build request
+    nodejs_url = os.getenv("NODEJS_INTERNAL_URL", "http://127.0.0.1:3000")
+    internal_token = os.getenv("INTERNAL_API_TOKEN", "")
+    request_body: dict[str, Any] = {
+        "description": task_description,
+        "limit": max_results,
+    }
+    if skill_categories:
+        request_body["category"] = skill_categories[0]
+
+    try:
+        async with httpx.AsyncClient(timeout=30.0) as client:
+            resp = await client.post(
+                f"{nodejs_url}/api/internal/tools/skill-discovery",
+                json=request_body,
+                headers={"X-Internal-Token": internal_token},
+            )
+            if resp.status_code != 200:
+                logger.warning(
+                    "skill_discovery_endpoint_error",
+                    status=resp.status_code,
+                    node=node_name,
+                )
+                await context.set(f"{node_name}_discovered", [])
+                return f"Skill discovery failed: HTTP {resp.status_code}"
+
+            data = resp.json()
+            all_skills: list[dict] = data.get("skills", [])
+    except Exception as exc:
+        logger.error("skill_discovery_request_failed", error=str(exc)[:200], node=node_name)
+        await context.set(f"{node_name}_discovered", [])
+        return f"Skill discovery error: {str(exc)[:100]}"
+
+    # Filter by confidence threshold
+    filtered = [s for s in all_skills if float(s.get("confidence", 0)) >= confidence_threshold]
+
+    # Store in context
+    await context.set(f"{node_name}_discovered", filtered)
+
+    # Also store no_match flag for downstream conditional_branch nodes
+    if not filtered:
+        await context.set(f"{node_name}_no_match", True)
+        return "Discovered 0 skills matching the task (no_match)"
+
+    await context.set(f"{node_name}_no_match", False)
+
+    # Build summary
+    skill_summaries = ", ".join(
+        f"{s.get('name', s.get('id', '?'))} ({s.get('confidence', 0):.2f})"
+        for s in filtered[:5]
+    )
+    return f"Discovered {len(filtered)} skills: {skill_summaries}"
+
+
+async def _resolve_task(
+    task_source: str,
+    node_config: dict[str, Any],
+    context: AgencyRunContext,
+    results: dict[str, Any],
+) -> str:
+    """Resolve task description from the configured source."""
+    if task_source == "static":
+        return node_config.get("taskValue", "")
+
+    if task_source == "context":
+        context_key = node_config.get("contextKey", "")
+        val = await context.get(context_key)
+        return str(val) if val else ""
+
+    if task_source == "previous_output":
+        # Use the last result in the results dict
+        if results:
+            last_key = list(results.keys())[-1]
+            val = results[last_key]
+            return str(val) if val else ""
+        return ""
+
+    return ""
diff --git a/python-backend/app/services/agency_skill_input_mapper.py b/python-backend/app/services/agency_skill_input_mapper.py
new file mode 100644
index 00000000..0afbf5f5
--- /dev/null
+++ b/python-backend/app/services/agency_skill_input_mapper.py
@@ -0,0 +1,77 @@
+"""Resolve field-level input mappings for skill_call nodes.
+
+Supports three source types:
+- static: use the value directly
+- node_output: look up a previous node's output by nodeId + dot-path outputField
+- context: read from AgencyRunContext by key
+"""
+
+from __future__ import annotations
+
+from typing import Any
+
+from app.services.agency_run_context import AgencyRunContext
+
+
+async def resolve_skill_input_mappings(
+    mappings: dict[str, dict] | None,
+    context: AgencyRunContext,
+    results: dict[str, Any],
+) -> dict[str, Any] | None:
+    """Resolve input mappings to concrete values.
+
+    Returns None if mappings is None or empty (caller should use existing behavior).
+    """
+    if not mappings:
+        return None
+
+    resolved: dict[str, Any] = {}
+    for field_name, mapping in mappings.items():
+        source = mapping.get("source", "static")
+        resolved[field_name] = await _resolve_single(source, mapping, context, results)
+
+    return resolved
+
+
+async def _resolve_single(
+    source: str,
+    mapping: dict[str, Any],
+    context: AgencyRunContext,
+    results: dict[str, Any],
+) -> Any:
+    """Resolve a single mapping entry."""
+    if source == "static":
+        return mapping.get("value")
+
+    if source == "node_output":
+        node_id = mapping.get("nodeId", "")
+        output_field = mapping.get("outputField", "")
+        node_result = results.get(node_id)
+        if node_result is None:
+            return None
+        return _traverse_dot_path(node_result, output_field)
+
+    if source == "context":
+        context_key = mapping.get("contextKey", "")
+        return await context.get(context_key)
+
+    return None
+
+
+def _traverse_dot_path(obj: Any, path: str) -> Any:
+    """Navigate a dot-separated path into nested dicts.
+
+    Returns None if any segment is missing.
+    """
+    if not path:
+        return obj
+    parts = path.split(".")
+    current = obj
+    for part in parts:
+        if isinstance(current, dict):
+            current = current.get(part)
+        else:
+            return None
+        if current is None:
+            return None
+    return current
diff --git a/python-backend/tests/unit/test_agency_skill_discovery.py b/python-backend/tests/unit/test_agency_skill_discovery.py
new file mode 100644
index 00000000..c9d993b8
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_skill_discovery.py
@@ -0,0 +1,243 @@
+"""Unit tests for agency skill discovery node handler."""
+
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+from app.services.agency_run_context import AgencyRunContext
+from app.services.agency_skill_discovery import execute_skill_discovery
+
+
+def _make_discovery_response(skills: list[dict]) -> dict:
+    return {"skills": skills}
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_discovery_returns_ranked_skills():
+    """Skill discovery returns ranked list from endpoint."""
+    mock_skills = [
+        {"id": "img-gen", "name": "Image Generator", "confidence": 0.9},
+        {"id": "vid-gen", "name": "Video Generator", "confidence": 0.7},
+    ]
+    ctx = AgencyRunContext()
+    results: dict = {}
+    node_config = {
+        "taskSource": "static",
+        "taskValue": "generate product image",
+        "confidenceThreshold": 0.5,
+        "maxResults": 5,
+    }
+
+    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
+        mock_client = AsyncMock()
+        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+        mock_resp = MagicMock()
+        mock_resp.status_code = 200
+        mock_resp.json.return_value = _make_discovery_response(mock_skills)
+        mock_client.post.return_value = mock_resp
+
+        output = await execute_skill_discovery(
+            node_name="discover_1", node_config=node_config, context=ctx, results=results
+        )
+
+    assert "Image Generator" in output
+    discovered = await ctx.get("discover_1_discovered")
+    assert len(discovered) == 2
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_discovery_filters_by_confidence_threshold():
+    """Skills below confidenceThreshold are filtered out."""
+    mock_skills = [
+        {"id": "s1", "name": "Skill A", "confidence": 0.9},
+        {"id": "s2", "name": "Skill B", "confidence": 0.6},
+        {"id": "s3", "name": "Skill C", "confidence": 0.3},
+    ]
+    ctx = AgencyRunContext()
+    node_config = {
+        "taskSource": "static",
+        "taskValue": "test",
+        "confidenceThreshold": 0.7,
+        "maxResults": 10,
+    }
+
+    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
+        mock_client = AsyncMock()
+        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+        mock_resp = MagicMock()
+        mock_resp.status_code = 200
+        mock_resp.json.return_value = _make_discovery_response(mock_skills)
+        mock_client.post.return_value = mock_resp
+
+        output = await execute_skill_discovery(
+            node_name="disc", node_config=node_config, context=ctx, results={}
+        )
+
+    discovered = await ctx.get("disc_discovered")
+    assert len(discovered) == 1
+    assert discovered[0]["id"] == "s1"
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_discovery_caps_max_results():
+    """maxResults is capped at 10 server-side."""
+    ctx = AgencyRunContext()
+    node_config = {
+        "taskSource": "static",
+        "taskValue": "test",
+        "confidenceThreshold": 0.0,
+        "maxResults": 50,
+    }
+
+    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
+        mock_client = AsyncMock()
+        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+        mock_resp = MagicMock()
+        mock_resp.status_code = 200
+        mock_resp.json.return_value = _make_discovery_response([])
+        mock_client.post.return_value = mock_resp
+
+        await execute_skill_discovery(
+            node_name="disc", node_config=node_config, context=ctx, results={}
+        )
+
+    # Verify the request used capped limit
+    call_kwargs = mock_client.post.call_args
+    request_json = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
+    assert request_json["limit"] <= 10
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_discovery_stores_in_context():
+    """Discovery results stored in context under '{nodeName}_discovered'."""
+    mock_skills = [{"id": "s1", "name": "Skill A", "confidence": 0.9}]
+    ctx = AgencyRunContext()
+    node_config = {
+        "taskSource": "static",
+        "taskValue": "test",
+        "confidenceThreshold": 0.5,
+        "maxResults": 5,
+    }
+
+    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
+        mock_client = AsyncMock()
+        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+        mock_resp = MagicMock()
+        mock_resp.status_code = 200
+        mock_resp.json.return_value = _make_discovery_response(mock_skills)
+        mock_client.post.return_value = mock_resp
+
+        await execute_skill_discovery(
+            node_name="my_node", node_config=node_config, context=ctx, results={}
+        )
+
+    stored = await ctx.get("my_node_discovered")
+    assert stored is not None
+    assert len(stored) == 1
+    assert stored[0]["name"] == "Skill A"
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_discovery_with_category_filter():
+    """Category filter is passed to the discovery endpoint."""
+    ctx = AgencyRunContext()
+    node_config = {
+        "taskSource": "static",
+        "taskValue": "test",
+        "confidenceThreshold": 0.5,
+        "maxResults": 5,
+        "skillCategories": ["image_generation"],
+    }
+
+    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
+        mock_client = AsyncMock()
+        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+        mock_resp = MagicMock()
+        mock_resp.status_code = 200
+        mock_resp.json.return_value = _make_discovery_response([])
+        mock_client.post.return_value = mock_resp
+
+        await execute_skill_discovery(
+            node_name="disc", node_config=node_config, context=ctx, results={}
+        )
+
+    call_kwargs = mock_client.post.call_args
+    request_json = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
+    assert request_json.get("category") == "image_generation"
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_discovery_no_matches_returns_empty():
+    """No matching skills returns empty list, not an error."""
+    ctx = AgencyRunContext()
+    node_config = {
+        "taskSource": "static",
+        "taskValue": "obscure task",
+        "confidenceThreshold": 0.9,
+        "maxResults": 5,
+    }
+
+    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
+        mock_client = AsyncMock()
+        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+        mock_resp = MagicMock()
+        mock_resp.status_code = 200
+        mock_resp.json.return_value = _make_discovery_response([])
+        mock_client.post.return_value = mock_resp
+
+        output = await execute_skill_discovery(
+            node_name="disc", node_config=node_config, context=ctx, results={}
+        )
+
+    discovered = await ctx.get("disc_discovered")
+    assert discovered == []
+    assert "no_match" in output.lower() or "0 skills" in output.lower()
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_discovery_context_task_source():
+    """taskSource='context' reads task from context key."""
+    ctx = AgencyRunContext({"task_description": "create a banner"})
+    node_config = {
+        "taskSource": "context",
+        "contextKey": "task_description",
+        "confidenceThreshold": 0.5,
+        "maxResults": 5,
+    }
+
+    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
+        mock_client = AsyncMock()
+        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
+        mock_resp = MagicMock()
+        mock_resp.status_code = 200
+        mock_resp.json.return_value = _make_discovery_response([])
+        mock_client.post.return_value = mock_resp
+
+        await execute_skill_discovery(
+            node_name="disc", node_config=node_config, context=ctx, results={}
+        )
+
+    call_kwargs = mock_client.post.call_args
+    request_json = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
+    assert request_json["description"] == "create a banner"
diff --git a/python-backend/tests/unit/test_agency_skill_input_mapper.py b/python-backend/tests/unit/test_agency_skill_input_mapper.py
new file mode 100644
index 00000000..c3567db7
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_skill_input_mapper.py
@@ -0,0 +1,126 @@
+"""Unit tests for agency skill input mapper — resolve field-level input mappings."""
+
+import pytest
+
+from app.services.agency_run_context import AgencyRunContext
+from app.services.agency_skill_input_mapper import resolve_skill_input_mappings
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_resolve_static_values_unchanged():
+    """Static source returns value directly."""
+    mappings = {"title": {"source": "static", "value": "Hello"}}
+    ctx = AgencyRunContext()
+    result = await resolve_skill_input_mappings(mappings, ctx, {})
+    assert result == {"title": "Hello"}
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_resolve_node_output_references():
+    """node_output source looks up results dict by nodeId and outputField."""
+    mappings = {
+        "content": {
+            "source": "node_output",
+            "nodeId": "node-1",
+            "outputField": "result",
+        }
+    }
+    results = {"node-1": {"result": "Generated text"}}
+    ctx = AgencyRunContext()
+    result = await resolve_skill_input_mappings(mappings, ctx, results)
+    assert result == {"content": "Generated text"}
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_resolve_context_keys():
+    """context source reads from AgencyRunContext."""
+    mappings = {"lang": {"source": "context", "contextKey": "user_language"}}
+    ctx = AgencyRunContext({"user_language": "en"})
+    result = await resolve_skill_input_mappings(mappings, ctx, {})
+    assert result == {"lang": "en"}
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_backward_compatible_no_mappings():
+    """When mappings is None or empty, returns None (caller uses existing behavior)."""
+    ctx = AgencyRunContext()
+    assert await resolve_skill_input_mappings(None, ctx, {}) is None
+    assert await resolve_skill_input_mappings({}, ctx, {}) is None
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_missing_node_output_returns_none():
+    """Missing node output reference returns None gracefully."""
+    mappings = {
+        "field": {
+            "source": "node_output",
+            "nodeId": "node-99",
+            "outputField": "result",
+        }
+    }
+    ctx = AgencyRunContext()
+    result = await resolve_skill_input_mappings(mappings, ctx, {})
+    assert result == {"field": None}
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_missing_context_key_returns_none():
+    """Missing context key returns None gracefully."""
+    mappings = {"field": {"source": "context", "contextKey": "nonexistent"}}
+    ctx = AgencyRunContext()
+    result = await resolve_skill_input_mappings(mappings, ctx, {})
+    assert result == {"field": None}
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_mixed_mapping_sources():
+    """Multiple fields with different sources all resolve correctly."""
+    mappings = {
+        "title": {"source": "static", "value": "My Title"},
+        "content": {
+            "source": "node_output",
+            "nodeId": "node-1",
+            "outputField": "text",
+        },
+        "lang": {"source": "context", "contextKey": "language"},
+    }
+    results = {"node-1": {"text": "From node"}}
+    ctx = AgencyRunContext({"language": "th"})
+    result = await resolve_skill_input_mappings(mappings, ctx, results)
+    assert result == {
+        "title": "My Title",
+        "content": "From node",
+        "lang": "th",
+    }
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_nested_dot_path_navigation():
+    """node_output with dot-path outputField traverses nested dicts."""
+    mappings = {
+        "data": {
+            "source": "node_output",
+            "nodeId": "node-1",
+            "outputField": "outputs.result.text",
+        }
+    }
+    results = {"node-1": {"outputs": {"result": {"text": "Deep value"}}}}
+    ctx = AgencyRunContext()
+    result = await resolve_skill_input_mappings(mappings, ctx, results)
+    assert result == {"data": "Deep value"}
