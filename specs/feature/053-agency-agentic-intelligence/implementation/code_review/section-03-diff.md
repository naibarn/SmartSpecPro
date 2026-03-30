diff --git a/apps/web/client/src/components/agency/NodePropertyPanel.tsx b/apps/web/client/src/components/agency/NodePropertyPanel.tsx
index f2f8f5f4..bfb905c7 100644
--- a/apps/web/client/src/components/agency/NodePropertyPanel.tsx
+++ b/apps/web/client/src/components/agency/NodePropertyPanel.tsx
@@ -52,7 +52,7 @@ import { BROWSER_SESSION_COPY } from "@shared/browserSession";
 import {
   X, Wrench, ChevronDown, ChevronRight, Trash2, Plus,
   Search, Loader2, Zap, GripVertical, Check, ChevronsUpDown,
-  BookOpen, Shield, Server,
+  BookOpen, Shield, Server, Brain,
 } from "lucide-react";
 
 const PANEL_MIN_W = 340;
@@ -241,6 +241,7 @@ function AgentSupervisorForm({
   const [kbOpen, setKbOpen] = useState(false);
   const [guardrailsOpen, setGuardrailsOpen] = useState(false);
   const [mcpServersOpen, setMcpServersOpen] = useState(false);
+  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
   const [kbDocPickerOpen, setKbDocPickerOpen] = useState(false);
   const [kbSettingsOpen, setKbSettingsOpen] = useState(false);
   const [kbDocTypeFilter, setKbDocTypeFilter] = useState<string>("all");
@@ -752,6 +753,94 @@ function AgentSupervisorForm({
 
       <Separator />
 
+      {/* Intelligence */}
+      <div>
+        <button
+          type="button"
+          onClick={() => setIntelligenceOpen(!intelligenceOpen)}
+          className="flex w-full items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
+        >
+          <span className="flex items-center gap-1.5">
+            <Brain className="h-3.5 w-3.5" />
+            Intelligence
+          </span>
+          {intelligenceOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
+        </button>
+
+        {intelligenceOpen && (
+          <div className="mt-2 space-y-3">
+            <div className="space-y-1.5">
+              <Label className="text-xs">Execution Mode</Label>
+              <Select
+                value={ncGet(node, "executionMode", "single_shot")}
+                onValueChange={(v) => onChange(ncSet(node, "executionMode", v))}
+              >
+                <SelectTrigger className="h-8 text-xs">
+                  <SelectValue />
+                </SelectTrigger>
+                <SelectContent>
+                  <SelectItem value="single_shot">Standard</SelectItem>
+                  <SelectItem value="agentic">Agentic</SelectItem>
+                </SelectContent>
+              </Select>
+            </div>
+
+            {ncGet(node, "executionMode", "single_shot") === "agentic" && (
+              <>
+                <div className="space-y-1.5">
+                  <Label className="text-xs">Planning Strategy</Label>
+                  <Select
+                    value={ncGet(node, "planningStrategy", "basic")}
+                    onValueChange={(v) => onChange(ncSet(node, "planningStrategy", v))}
+                  >
+                    <SelectTrigger className="h-8 text-xs">
+                      <SelectValue />
+                    </SelectTrigger>
+                    <SelectContent>
+                      <SelectItem value="basic">Basic</SelectItem>
+                      <SelectItem value="cot">Chain-of-Thought</SelectItem>
+                      <SelectItem value="react">ReAct</SelectItem>
+                    </SelectContent>
+                  </Select>
+                </div>
+
+                <div className="space-y-1.5">
+                  <div className="flex items-center justify-between">
+                    <Label className="text-xs">Max Reflection Cycles</Label>
+                    <span className="text-xs text-muted-foreground font-mono">
+                      {ncGet(node, "maxReflectionCycles", 3)}
+                    </span>
+                  </div>
+                  <input
+                    type="range"
+                    min={1}
+                    max={10}
+                    value={ncGet(node, "maxReflectionCycles", 3)}
+                    onChange={(e) => onChange(ncSet(node, "maxReflectionCycles", Number(e.target.value)))}
+                    className="w-full accent-blue-600"
+                  />
+                </div>
+
+                <div className="flex items-center justify-between">
+                  <Label className="text-xs">Show reasoning steps in output</Label>
+                  <Switch
+                    checked={ncGet(node, "showReasoning", false)}
+                    onCheckedChange={(v) => onChange(ncSet(node, "showReasoning", v))}
+                  />
+                </div>
+
+                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-2 text-xs flex items-center gap-1.5">
+                  <Zap className="h-3.5 w-3.5 shrink-0" />
+                  Agentic mode may use 2-5x more credits per run
+                </div>
+              </>
+            )}
+          </div>
+        )}
+      </div>
+
+      <Separator />
+
       {/* Guardrails */}
       {agencyId && (
         <div>
diff --git a/apps/web/client/src/components/agency/__tests__/AgenticConfig.test.tsx b/apps/web/client/src/components/agency/__tests__/AgenticConfig.test.tsx
new file mode 100644
index 00000000..1891ae2f
--- /dev/null
+++ b/apps/web/client/src/components/agency/__tests__/AgenticConfig.test.tsx
@@ -0,0 +1,116 @@
+/**
+ * @vitest-environment jsdom
+ */
+
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent } from "@testing-library/react";
+import { createElement } from "react";
+
+// Mock sub-components that use trpc / external dependencies
+vi.mock("../ToolPicker", () => ({ ToolPicker: () => null }));
+vi.mock("../ModelPicker", () => ({ ModelPicker: () => null }));
+vi.mock("../guardrails/GuardrailsPanel", () => ({ GuardrailsPanel: () => null }));
+vi.mock("../McpServersPanel", () => ({ McpServersPanel: () => null }));
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    library: {
+      listDocuments: { useQuery: () => ({ data: null, isLoading: false }) },
+      search: { useQuery: () => ({ data: null, isLoading: false }) },
+    },
+  },
+}));
+
+import { NodePropertyPanel } from "../NodePropertyPanel";
+import type { AgencyNodeData } from "../nodes/types";
+
+function makeNode(overrides: Partial<AgencyNodeData> = {}): AgencyNodeData {
+  return {
+    nodeType: "agent",
+    name: "Test Agent",
+    description: "A test agent",
+    instructions: "Do the thing.",
+    model: "gpt-4o",
+    isEntryPoint: false,
+    tools: [],
+    ...overrides,
+  };
+}
+
+describe("AgenticConfig - Intelligence Section", () => {
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
+  function renderPanel(nodeOverrides: Partial<AgencyNodeData> = {}) {
+    return render(
+      createElement(NodePropertyPanel, {
+        node: makeNode(nodeOverrides),
+        onChange,
+        onClose,
+        onDelete,
+      }),
+    );
+  }
+
+  function openIntelligence() {
+    const btn = screen.getByText("Intelligence");
+    fireEvent.click(btn);
+  }
+
+  it("renders Intelligence section header for agent nodes", () => {
+    renderPanel();
+    expect(screen.getByText("Intelligence")).toBeTruthy();
+  });
+
+  it("renders execution mode dropdown when Intelligence section opened", () => {
+    renderPanel();
+    openIntelligence();
+    expect(screen.getByText("Execution Mode")).toBeTruthy();
+  });
+
+  it("shows agentic sub-options when agentic mode selected", () => {
+    renderPanel({
+      nodeConfig: { executionMode: "agentic" },
+    });
+    openIntelligence();
+    expect(screen.getByText("Planning Strategy")).toBeTruthy();
+    expect(screen.getByText("Max Reflection Cycles")).toBeTruthy();
+    expect(screen.getByText("Show reasoning steps in output")).toBeTruthy();
+  });
+
+  it("hides agentic sub-options when standard mode selected", () => {
+    renderPanel({
+      nodeConfig: { executionMode: "single_shot" },
+    });
+    openIntelligence();
+    expect(screen.queryByText("Planning Strategy")).toBeNull();
+    expect(screen.queryByText("Max Reflection Cycles")).toBeNull();
+  });
+
+  it("slider range is 1-10 for max reflection cycles", () => {
+    renderPanel({
+      nodeConfig: { executionMode: "agentic" },
+    });
+    openIntelligence();
+    const slider = screen.getByRole("slider") as HTMLInputElement;
+    expect(slider.min).toBe("1");
+    expect(slider.max).toBe("10");
+  });
+
+  it("shows cost warning banner when agentic enabled", () => {
+    renderPanel({
+      nodeConfig: { executionMode: "agentic" },
+    });
+    openIntelligence();
+    expect(
+      screen.getByText("Agentic mode may use 2-5x more credits per run"),
+    ).toBeTruthy();
+  });
+});
diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index 02d64286..5a524988 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -1184,6 +1184,27 @@ export const agencyRouter = router({
             if (["agent", "supervisor"].includes(data.nodeType)) {
               if (!data.model) ctx.addIssue({ code: "custom", path: ["model"], message: "model is required for agent/supervisor" });
               if (!data.instructions) ctx.addIssue({ code: "custom", path: ["instructions"], message: "instructions are required for agent/supervisor" });
+              // Validate agentic nodeConfig fields
+              const nc = data.nodeConfig as Record<string, unknown> | undefined;
+              const executionMode = nc?.executionMode;
+              if (executionMode !== undefined && executionMode !== "single_shot" && executionMode !== "agentic") {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "executionMode"], message: "executionMode must be 'single_shot' or 'agentic'" });
+              }
+              const maxCycles = nc?.maxReflectionCycles;
+              if (maxCycles !== undefined) {
+                const n = Number(maxCycles);
+                if (!Number.isInteger(n) || n < 1 || n > 10) {
+                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "maxReflectionCycles"], message: "maxReflectionCycles must be an integer between 1 and 10" });
+                }
+              }
+              const strategy = nc?.planningStrategy;
+              if (strategy !== undefined && !["basic", "cot", "react"].includes(String(strategy))) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "planningStrategy"], message: "planningStrategy must be 'basic', 'cot', or 'react'" });
+              }
+              const showReasoning = nc?.showReasoning;
+              if (showReasoning !== undefined && typeof showReasoning !== "boolean") {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "showReasoning"], message: "showReasoning must be a boolean" });
+              }
             }
             if (data.nodeType === "router" && !(data.nodeConfig as any)?.routes?.length) {
               ctx.addIssue({ code: "custom", path: ["nodeConfig"], message: "router requires at least 1 route" });
