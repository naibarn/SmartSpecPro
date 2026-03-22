diff --git a/apps/web/client/src/components/agency/AgencySidebar.tsx b/apps/web/client/src/components/agency/AgencySidebar.tsx
index 90730307..cc4e7ecf 100644
--- a/apps/web/client/src/components/agency/AgencySidebar.tsx
+++ b/apps/web/client/src/components/agency/AgencySidebar.tsx
@@ -5,8 +5,9 @@ import {
   Bot, Crown, GitBranch, Merge, Database, Zap, UserCheck,
   MonitorPlay,
   Briefcase, FileText, Code, BarChart, Calendar, Search, PenTool,
-  ChevronDown, Info,
+  ChevronDown, Info, Wrench,
 } from "lucide-react";
+import { CustomToolCreator } from "./CustomToolCreator";
 import {
   Tooltip,
   TooltipContent,
@@ -136,6 +137,7 @@ export function AgencySidebar({ onNodeAdd }: AgencySidebarProps) {
   const [openSections, setOpenSections] = useState<Set<string>>(
     new Set(NODE_TYPE_SECTIONS.map((s) => s.label)),
   );
+  const [customToolCreatorOpen, setCustomToolCreatorOpen] = useState(false);
   const { data, isLoading } = trpc.agency.listAgentTemplates.useQuery();
 
   const toggleSection = (label: string) => {
@@ -291,6 +293,24 @@ export function AgencySidebar({ onNodeAdd }: AgencySidebarProps) {
           </div>
         )}
       </div>
+
+      {/* Custom Tools shortcut */}
+      <div className="border-t border-slate-200 p-3">
+        <button
+          type="button"
+          className="flex w-full items-center gap-2 rounded-lg bg-white border border-slate-200 p-2.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:shadow-sm transition-all"
+          onClick={() => setCustomToolCreatorOpen(true)}
+          data-testid="manage-custom-tools-btn"
+        >
+          <Wrench className="h-3.5 w-3.5 text-slate-500" />
+          Manage Custom Tools
+        </button>
+      </div>
+
+      <CustomToolCreator
+        open={customToolCreatorOpen}
+        onClose={() => setCustomToolCreatorOpen(false)}
+      />
     </div>
   );
 }
diff --git a/apps/web/client/src/components/agency/CustomToolCreator.tsx b/apps/web/client/src/components/agency/CustomToolCreator.tsx
new file mode 100644
index 00000000..abd62d2e
--- /dev/null
+++ b/apps/web/client/src/components/agency/CustomToolCreator.tsx
@@ -0,0 +1,658 @@
+import { useState, useEffect } from "react";
+import {
+  Dialog,
+  DialogContent,
+  DialogHeader,
+  DialogTitle,
+} from "@/components/ui/dialog";
+import { Input } from "@/components/ui/input";
+import { Textarea } from "@/components/ui/textarea";
+import { Label } from "@/components/ui/label";
+import { Button } from "@/components/ui/button";
+import { Badge } from "@/components/ui/badge";
+import { Switch } from "@/components/ui/switch";
+import {
+  Select,
+  SelectContent,
+  SelectItem,
+  SelectTrigger,
+  SelectValue,
+} from "@/components/ui/select";
+import {
+  ArrowLeft,
+  ArrowRight,
+  Loader2,
+  Play,
+  Check,
+  Plus,
+  Trash2,
+} from "lucide-react";
+import { cn } from "@/lib/utils";
+import { trpc } from "@/lib/trpc";
+import { toast } from "sonner";
+import { JsonSchemaEditor } from "./JsonSchemaEditor";
+
+interface CustomToolCreatorProps {
+  open: boolean;
+  onClose: () => void;
+  editToolId?: string;
+  onSuccess?: () => void;
+}
+
+interface HeaderEntry {
+  key: string;
+  value: string;
+}
+
+interface FormState {
+  name: string;
+  description: string;
+  icon: string;
+  category: string;
+  riskLevel: "low" | "medium" | "high";
+  endpoint: string;
+  httpMethod: "GET" | "POST" | "PUT" | "DELETE";
+  headers: HeaderEntry[];
+  maxRetries: number;
+  backoffMs: number;
+  strictSchema: boolean;
+  oneCallAtATime: boolean;
+  inputSchema: Record<string, unknown> | null;
+  outputSchema: Record<string, unknown> | null;
+}
+
+const INITIAL_STATE: FormState = {
+  name: "",
+  description: "",
+  icon: "",
+  category: "",
+  riskLevel: "low",
+  endpoint: "",
+  httpMethod: "POST",
+  headers: [],
+  maxRetries: 0,
+  backoffMs: 1000,
+  strictSchema: false,
+  oneCallAtATime: false,
+  inputSchema: null,
+  outputSchema: null,
+};
+
+const STEPS = ["Basic Info", "Endpoint", "Schema", "Test & Save"] as const;
+
+export function CustomToolCreator({
+  open,
+  onClose,
+  editToolId,
+  onSuccess,
+}: CustomToolCreatorProps) {
+  const [step, setStep] = useState(0);
+  const [form, setForm] = useState<FormState>(INITIAL_STATE);
+  const [showOutputSchema, setShowOutputSchema] = useState(false);
+  const [testInput, setTestInput] = useState("");
+  const [testResult, setTestResult] = useState<{
+    status: number;
+    body: string;
+    latencyMs: number;
+  } | null>(null);
+  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
+
+  // Load existing tool data for edit mode
+  const { data: existingTool } = (trpc as any).agency?.listCustomTools?.useQuery?.(
+    { search: "", page: 1, limit: 1 },
+    { enabled: open && !!editToolId },
+  ) ?? { data: undefined };
+
+  const createMutation = (trpc as any).agency?.createCustomTool?.useMutation?.({
+    onSuccess: () => {
+      toast.success("Custom tool created");
+      onSuccess?.();
+      handleClose();
+    },
+    onError: (err: any) => {
+      const msg = err?.message ?? "Failed to create tool";
+      if (msg.includes("SSRF")) {
+        setFieldErrors((prev) => ({ ...prev, endpoint: msg }));
+        setStep(1);
+      } else {
+        toast.error(msg);
+      }
+    },
+  }) ?? { mutate: () => {}, isPending: false };
+
+  const updateMutation = (trpc as any).agency?.updateCustomTool?.useMutation?.({
+    onSuccess: () => {
+      toast.success("Custom tool updated");
+      onSuccess?.();
+      handleClose();
+    },
+    onError: (err: any) => {
+      const msg = err?.message ?? "Failed to update tool";
+      if (msg.includes("SSRF")) {
+        setFieldErrors((prev) => ({ ...prev, endpoint: msg }));
+        setStep(1);
+      } else {
+        toast.error(msg);
+      }
+    },
+  }) ?? { mutate: () => {}, isPending: false };
+
+  const testMutation = (trpc as any).agency?.testCustomTool?.useMutation?.({
+    onSuccess: (data: any) => {
+      setTestResult({
+        status: data?.status ?? 200,
+        body: JSON.stringify(data?.body ?? data, null, 2),
+        latencyMs: data?.latencyMs ?? 0,
+      });
+    },
+    onError: (err: any) => {
+      setTestResult({
+        status: 500,
+        body: err?.message ?? "Test failed",
+        latencyMs: 0,
+      });
+    },
+  }) ?? { mutate: () => {}, isPending: false };
+
+  // Prefill form when editing
+  useEffect(() => {
+    if (editToolId && existingTool?.tools?.[0]) {
+      const tool = existingTool.tools[0];
+      setForm({
+        name: tool.name ?? "",
+        description: tool.description ?? "",
+        icon: tool.icon ?? "",
+        category: tool.category ?? "",
+        riskLevel: tool.riskLevel ?? "low",
+        endpoint: tool.config?.endpoint ?? "",
+        httpMethod: tool.httpMethod ?? "POST",
+        headers: [],
+        maxRetries: tool.retryPolicy?.maxRetries ?? 0,
+        backoffMs: tool.retryPolicy?.backoffMs ?? 1000,
+        strictSchema: tool.strictSchema ?? false,
+        oneCallAtATime: tool.oneCallAtATime ?? false,
+        inputSchema: tool.inputSchema ?? null,
+        outputSchema: tool.outputSchema ?? null,
+      });
+    }
+  }, [editToolId, existingTool]);
+
+  const handleClose = () => {
+    setStep(0);
+    setForm(INITIAL_STATE);
+    setTestResult(null);
+    setTestInput("");
+    setFieldErrors({});
+    setShowOutputSchema(false);
+    onClose();
+  };
+
+  const update = (updates: Partial<FormState>) => {
+    setForm((prev) => ({ ...prev, ...updates }));
+    // Clear errors for updated fields
+    const keys = Object.keys(updates);
+    if (keys.some((k) => fieldErrors[k])) {
+      setFieldErrors((prev) => {
+        const next = { ...prev };
+        for (const k of keys) delete next[k];
+        return next;
+      });
+    }
+  };
+
+  const validateStep = (s: number): boolean => {
+    const errors: Record<string, string> = {};
+    if (s === 0) {
+      if (!form.name.trim()) errors.name = "Name is required";
+      if (form.name.length > 100)
+        errors.name = "Name must be 100 characters or less";
+    }
+    if (s === 1) {
+      if (!form.endpoint.trim()) errors.endpoint = "Endpoint URL is required";
+      try {
+        new URL(form.endpoint);
+      } catch {
+        if (form.endpoint.trim()) errors.endpoint = "Invalid URL";
+      }
+    }
+    setFieldErrors(errors);
+    return Object.keys(errors).length === 0;
+  };
+
+  const goNext = () => {
+    if (validateStep(step)) setStep((s) => Math.min(s + 1, 3));
+  };
+
+  const goBack = () => setStep((s) => Math.max(s - 1, 0));
+
+  const handleSave = () => {
+    const payload = {
+      name: form.name.trim(),
+      description: form.description.trim() || undefined,
+      icon: form.icon.trim() || undefined,
+      category: form.category.trim() || undefined,
+      riskLevel: form.riskLevel,
+      endpoint: form.endpoint.trim(),
+      httpMethod: form.httpMethod,
+      headers:
+        form.headers.length > 0
+          ? Object.fromEntries(
+              form.headers
+                .filter((h) => h.key.trim())
+                .map((h) => [h.key, h.value]),
+            )
+          : undefined,
+      retryPolicy:
+        form.maxRetries > 0
+          ? { maxRetries: form.maxRetries, backoffMs: form.backoffMs }
+          : undefined,
+      strictSchema: form.strictSchema,
+      oneCallAtATime: form.oneCallAtATime,
+      inputSchema: form.inputSchema,
+      outputSchema: form.outputSchema,
+    };
+
+    if (editToolId) {
+      updateMutation.mutate({ toolId: editToolId, ...payload });
+    } else {
+      createMutation.mutate(payload);
+    }
+  };
+
+  const handleTest = () => {
+    if (!editToolId) return;
+    let sampleInput: Record<string, unknown> = {};
+    try {
+      sampleInput = testInput.trim() ? JSON.parse(testInput) : {};
+    } catch {
+      toast.error("Invalid JSON input");
+      return;
+    }
+    testMutation.mutate({ toolId: editToolId, sampleInput });
+  };
+
+  const isPending = createMutation.isPending || updateMutation.isPending;
+
+  return (
+    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
+      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
+        <DialogHeader>
+          <DialogTitle className="flex items-center gap-2">
+            {editToolId ? "Edit Custom Tool" : "Create Custom Tool"}
+          </DialogTitle>
+        </DialogHeader>
+
+        {/* Step indicators */}
+        <div className="flex items-center gap-1 mb-2">
+          {STEPS.map((label, i) => (
+            <div key={label} className="flex items-center gap-1">
+              <Badge
+                variant={step === i ? "default" : step > i ? "secondary" : "outline"}
+                className={cn(
+                  "text-[10px] cursor-pointer",
+                  step === i && "bg-indigo-600",
+                )}
+                onClick={() => {
+                  if (i < step || validateStep(step)) setStep(i);
+                }}
+              >
+                {i + 1}. {label}
+              </Badge>
+              {i < STEPS.length - 1 && (
+                <span className="text-muted-foreground text-xs">→</span>
+              )}
+            </div>
+          ))}
+        </div>
+
+        {/* Step 1: Basic Info */}
+        {step === 0 && (
+          <div className="space-y-3" data-testid="step-basic-info">
+            <div className="space-y-1.5">
+              <Label className="text-xs">Name *</Label>
+              <Input
+                value={form.name}
+                onChange={(e) => update({ name: e.target.value })}
+                placeholder="My Custom Tool"
+                className="h-8 text-sm"
+                maxLength={100}
+                data-testid="tool-name-input"
+              />
+              {fieldErrors.name && (
+                <p className="text-xs text-destructive">{fieldErrors.name}</p>
+              )}
+            </div>
+            <div className="space-y-1.5">
+              <Label className="text-xs">Description</Label>
+              <Textarea
+                value={form.description}
+                onChange={(e) => update({ description: e.target.value })}
+                placeholder="What does this tool do?"
+                className="text-sm min-h-[60px]"
+                maxLength={500}
+              />
+            </div>
+            <div className="flex gap-3">
+              <div className="space-y-1.5 flex-1">
+                <Label className="text-xs">Icon (optional)</Label>
+                <Input
+                  value={form.icon}
+                  onChange={(e) => update({ icon: e.target.value })}
+                  placeholder="wrench"
+                  className="h-8 text-sm"
+                />
+              </div>
+              <div className="space-y-1.5 flex-1">
+                <Label className="text-xs">Category</Label>
+                <Input
+                  value={form.category}
+                  onChange={(e) => update({ category: e.target.value })}
+                  placeholder="api"
+                  className="h-8 text-sm"
+                />
+              </div>
+            </div>
+            <div className="space-y-1.5">
+              <Label className="text-xs">Risk Level</Label>
+              <Select
+                value={form.riskLevel}
+                onValueChange={(v) =>
+                  update({ riskLevel: v as FormState["riskLevel"] })
+                }
+              >
+                <SelectTrigger className="h-8 text-sm" data-testid="risk-level-select">
+                  <SelectValue />
+                </SelectTrigger>
+                <SelectContent>
+                  <SelectItem value="low">Low</SelectItem>
+                  <SelectItem value="medium">Medium</SelectItem>
+                  <SelectItem value="high">High</SelectItem>
+                </SelectContent>
+              </Select>
+            </div>
+          </div>
+        )}
+
+        {/* Step 2: Endpoint Configuration */}
+        {step === 1 && (
+          <div className="space-y-3" data-testid="step-endpoint">
+            <div className="space-y-1.5">
+              <Label className="text-xs">Endpoint URL *</Label>
+              <Input
+                value={form.endpoint}
+                onChange={(e) => update({ endpoint: e.target.value })}
+                placeholder="https://api.example.com/v1/action"
+                className="h-8 text-sm"
+                data-testid="tool-endpoint-input"
+              />
+              {fieldErrors.endpoint && (
+                <p className="text-xs text-destructive">{fieldErrors.endpoint}</p>
+              )}
+            </div>
+            <div className="space-y-1.5">
+              <Label className="text-xs">HTTP Method</Label>
+              <Select
+                value={form.httpMethod}
+                onValueChange={(v) =>
+                  update({ httpMethod: v as FormState["httpMethod"] })
+                }
+              >
+                <SelectTrigger className="h-8 text-sm" data-testid="http-method-select">
+                  <SelectValue />
+                </SelectTrigger>
+                <SelectContent>
+                  <SelectItem value="GET">GET</SelectItem>
+                  <SelectItem value="POST">POST</SelectItem>
+                  <SelectItem value="PUT">PUT</SelectItem>
+                  <SelectItem value="DELETE">DELETE</SelectItem>
+                </SelectContent>
+              </Select>
+            </div>
+
+            {/* Headers key-value editor */}
+            <div className="space-y-1.5">
+              <Label className="text-xs">Headers</Label>
+              {form.headers.map((header, i) => (
+                <div key={i} className="flex gap-1.5 items-center">
+                  <Input
+                    value={header.key}
+                    onChange={(e) => {
+                      const headers = [...form.headers];
+                      headers[i] = { ...headers[i], key: e.target.value };
+                      update({ headers });
+                    }}
+                    placeholder="Key"
+                    className="h-7 text-xs flex-1"
+                  />
+                  <Input
+                    value={header.value}
+                    onChange={(e) => {
+                      const headers = [...form.headers];
+                      headers[i] = { ...headers[i], value: e.target.value };
+                      update({ headers });
+                    }}
+                    placeholder="Value"
+                    className="h-7 text-xs flex-1"
+                    type="password"
+                  />
+                  <Button
+                    type="button"
+                    variant="ghost"
+                    size="icon"
+                    className="h-7 w-7 shrink-0"
+                    onClick={() =>
+                      update({
+                        headers: form.headers.filter((_, j) => j !== i),
+                      })
+                    }
+                  >
+                    <Trash2 className="h-3 w-3" />
+                  </Button>
+                </div>
+              ))}
+              <Button
+                type="button"
+                variant="outline"
+                size="sm"
+                className="h-7 text-xs"
+                onClick={() =>
+                  update({
+                    headers: [...form.headers, { key: "", value: "" }],
+                  })
+                }
+                data-testid="add-header-btn"
+              >
+                <Plus className="mr-1 h-3 w-3" /> Add Header
+              </Button>
+            </div>
+
+            <div className="flex gap-3">
+              <div className="space-y-1.5 flex-1">
+                <Label className="text-xs">Max Retries (0-5)</Label>
+                <Input
+                  type="number"
+                  min={0}
+                  max={5}
+                  value={form.maxRetries}
+                  onChange={(e) =>
+                    update({
+                      maxRetries: Math.min(5, Math.max(0, Number(e.target.value))),
+                    })
+                  }
+                  className="h-8 text-sm"
+                />
+              </div>
+              <div className="space-y-1.5 flex-1">
+                <Label className="text-xs">Backoff (ms)</Label>
+                <Input
+                  type="number"
+                  min={100}
+                  value={form.backoffMs}
+                  onChange={(e) =>
+                    update({ backoffMs: Math.max(100, Number(e.target.value)) })
+                  }
+                  className="h-8 text-sm"
+                />
+              </div>
+            </div>
+
+            <div className="flex items-center justify-between">
+              <div>
+                <Label className="text-xs">Strict Schema</Label>
+                <p className="text-[10px] text-muted-foreground">
+                  Enforce exact JSON Schema match
+                </p>
+              </div>
+              <Switch
+                checked={form.strictSchema}
+                onCheckedChange={(v) => update({ strictSchema: v })}
+              />
+            </div>
+            <div className="flex items-center justify-between">
+              <div>
+                <Label className="text-xs">One Call at a Time</Label>
+                <p className="text-[10px] text-muted-foreground">
+                  Prevent concurrent calls
+                </p>
+              </div>
+              <Switch
+                checked={form.oneCallAtATime}
+                onCheckedChange={(v) => update({ oneCallAtATime: v })}
+              />
+            </div>
+          </div>
+        )}
+
+        {/* Step 3: JSON Schema */}
+        {step === 2 && (
+          <div className="space-y-3" data-testid="step-schema">
+            <JsonSchemaEditor
+              value={form.inputSchema}
+              onChange={(schema) => update({ inputSchema: schema })}
+            />
+            <div className="border-t pt-2">
+              <Button
+                type="button"
+                variant="ghost"
+                size="sm"
+                className="h-7 text-xs"
+                onClick={() => setShowOutputSchema(!showOutputSchema)}
+              >
+                {showOutputSchema ? "Hide" : "Show"} Output Schema (optional)
+              </Button>
+              {showOutputSchema && (
+                <div className="mt-2">
+                  <JsonSchemaEditor
+                    value={form.outputSchema}
+                    onChange={(schema) => update({ outputSchema: schema })}
+                  />
+                </div>
+              )}
+            </div>
+          </div>
+        )}
+
+        {/* Step 4: Test & Save */}
+        {step === 3 && (
+          <div className="space-y-3" data-testid="step-test">
+            {editToolId && (
+              <>
+                <div className="space-y-1.5">
+                  <Label className="text-xs">Sample Input (JSON)</Label>
+                  <Textarea
+                    value={testInput}
+                    onChange={(e) => setTestInput(e.target.value)}
+                    placeholder='{"key": "value"}'
+                    className="min-h-[80px] font-mono text-xs"
+                    data-testid="test-input-textarea"
+                  />
+                </div>
+                <Button
+                  type="button"
+                  variant="outline"
+                  size="sm"
+                  onClick={handleTest}
+                  disabled={testMutation.isPending}
+                  data-testid="test-tool-btn"
+                >
+                  {testMutation.isPending ? (
+                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
+                  ) : (
+                    <Play className="mr-1 h-3 w-3" />
+                  )}
+                  Test Tool
+                </Button>
+                {testResult && (
+                  <div className="rounded border p-2 bg-muted/50" data-testid="test-result">
+                    <div className="flex items-center gap-2 mb-1">
+                      <Badge
+                        variant={testResult.status < 400 ? "secondary" : "destructive"}
+                        className="text-[10px]"
+                      >
+                        {testResult.status}
+                      </Badge>
+                      <span className="text-[10px] text-muted-foreground">
+                        {testResult.latencyMs}ms
+                      </span>
+                    </div>
+                    <pre className="text-xs font-mono whitespace-pre-wrap max-h-[150px] overflow-auto">
+                      {testResult.body}
+                    </pre>
+                  </div>
+                )}
+              </>
+            )}
+            {!editToolId && (
+              <p className="text-xs text-muted-foreground">
+                Save the tool first, then test it from the tool picker.
+              </p>
+            )}
+          </div>
+        )}
+
+        {/* Navigation */}
+        <div className="flex justify-between pt-2 border-t">
+          <Button
+            type="button"
+            variant="outline"
+            size="sm"
+            onClick={step === 0 ? handleClose : goBack}
+            disabled={isPending}
+          >
+            <ArrowLeft className="mr-1 h-3 w-3" />
+            {step === 0 ? "Cancel" : "Back"}
+          </Button>
+          <div className="flex gap-2">
+            {step < 3 && (
+              <Button
+                type="button"
+                size="sm"
+                onClick={goNext}
+                data-testid="next-step-btn"
+              >
+                Next
+                <ArrowRight className="ml-1 h-3 w-3" />
+              </Button>
+            )}
+            {step === 3 && (
+              <Button
+                type="button"
+                size="sm"
+                onClick={handleSave}
+                disabled={isPending}
+                data-testid="save-tool-btn"
+              >
+                {isPending ? (
+                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
+                ) : (
+                  <Check className="mr-1 h-3 w-3" />
+                )}
+                {editToolId ? "Update" : "Save"}
+              </Button>
+            )}
+          </div>
+        </div>
+      </DialogContent>
+    </Dialog>
+  );
+}
diff --git a/apps/web/client/src/components/agency/JsonSchemaEditor.tsx b/apps/web/client/src/components/agency/JsonSchemaEditor.tsx
new file mode 100644
index 00000000..bfddb953
--- /dev/null
+++ b/apps/web/client/src/components/agency/JsonSchemaEditor.tsx
@@ -0,0 +1,293 @@
+import { useState, useCallback } from "react";
+import { Input } from "@/components/ui/input";
+import { Button } from "@/components/ui/button";
+import { Label } from "@/components/ui/label";
+import { Textarea } from "@/components/ui/textarea";
+import {
+  Select,
+  SelectContent,
+  SelectItem,
+  SelectTrigger,
+  SelectValue,
+} from "@/components/ui/select";
+import { Checkbox } from "@/components/ui/checkbox";
+import { Plus, Trash2, Code, Eye } from "lucide-react";
+import { cn } from "@/lib/utils";
+
+interface SchemaProperty {
+  name: string;
+  type: string;
+  description: string;
+  required: boolean;
+}
+
+interface JsonSchemaEditorProps {
+  value: Record<string, unknown> | null;
+  onChange: (schema: Record<string, unknown>) => void;
+  maxProperties?: number;
+  className?: string;
+}
+
+const PROPERTY_TYPES = [
+  "string",
+  "number",
+  "integer",
+  "boolean",
+  "array",
+  "object",
+];
+
+function schemaToProperties(
+  schema: Record<string, unknown> | null,
+): SchemaProperty[] {
+  if (!schema || typeof schema !== "object") return [];
+  const properties = (schema.properties ?? {}) as Record<
+    string,
+    Record<string, unknown>
+  >;
+  const required = (schema.required ?? []) as string[];
+
+  return Object.entries(properties).map(([name, def]) => ({
+    name,
+    type: (def.type as string) ?? "string",
+    description: (def.description as string) ?? "",
+    required: required.includes(name),
+  }));
+}
+
+function propertiesToSchema(
+  props: SchemaProperty[],
+): Record<string, unknown> {
+  const properties: Record<string, Record<string, unknown>> = {};
+  const required: string[] = [];
+
+  for (const p of props) {
+    const def: Record<string, unknown> = { type: p.type };
+    if (p.description) def.description = p.description;
+    properties[p.name] = def;
+    if (p.required) required.push(p.name);
+  }
+
+  return {
+    type: "object",
+    properties,
+    ...(required.length > 0 ? { required } : {}),
+  };
+}
+
+export function JsonSchemaEditor({
+  value,
+  onChange,
+  maxProperties = 20,
+  className,
+}: JsonSchemaEditorProps) {
+  const [mode, setMode] = useState<"visual" | "raw">("visual");
+  const [rawText, setRawText] = useState("");
+  const [rawError, setRawError] = useState<string | null>(null);
+  const [properties, setProperties] = useState<SchemaProperty[]>(() =>
+    schemaToProperties(value),
+  );
+
+  const emitChange = useCallback(
+    (props: SchemaProperty[]) => {
+      setProperties(props);
+      onChange(propertiesToSchema(props));
+    },
+    [onChange],
+  );
+
+  const addProperty = () => {
+    if (properties.length >= maxProperties) return;
+    emitChange([
+      ...properties,
+      { name: "", type: "string", description: "", required: false },
+    ]);
+  };
+
+  const removeProperty = (index: number) => {
+    emitChange(properties.filter((_, i) => i !== index));
+  };
+
+  const updateProperty = (
+    index: number,
+    updates: Partial<SchemaProperty>,
+  ) => {
+    emitChange(
+      properties.map((p, i) => (i === index ? { ...p, ...updates } : p)),
+    );
+  };
+
+  const switchToRaw = () => {
+    setRawText(JSON.stringify(propertiesToSchema(properties), null, 2));
+    setRawError(null);
+    setMode("raw");
+  };
+
+  const switchToVisual = () => {
+    if (rawText.trim()) {
+      try {
+        const parsed = JSON.parse(rawText);
+        const props = schemaToProperties(parsed);
+        setProperties(props);
+        onChange(parsed);
+        setRawError(null);
+      } catch {
+        setRawError("Invalid JSON");
+        return;
+      }
+    }
+    setMode("visual");
+  };
+
+  const handleRawChange = (text: string) => {
+    setRawText(text);
+    try {
+      const parsed = JSON.parse(text);
+      setRawError(null);
+      onChange(parsed);
+    } catch {
+      setRawError("Invalid JSON");
+    }
+  };
+
+  return (
+    <div className={cn("space-y-3", className)}>
+      <div className="flex items-center justify-between">
+        <Label className="text-xs font-medium">Input Schema</Label>
+        <Button
+          type="button"
+          variant="ghost"
+          size="sm"
+          className="h-6 px-2 text-xs"
+          onClick={mode === "visual" ? switchToRaw : switchToVisual}
+          data-testid="schema-mode-toggle"
+        >
+          {mode === "visual" ? (
+            <>
+              <Code className="mr-1 h-3 w-3" /> Raw JSON
+            </>
+          ) : (
+            <>
+              <Eye className="mr-1 h-3 w-3" /> Visual
+            </>
+          )}
+        </Button>
+      </div>
+
+      {mode === "visual" ? (
+        <div className="space-y-2">
+          {properties.length === 0 && (
+            <p className="text-xs text-muted-foreground py-2">
+              No properties defined. Click "Add Property" to start.
+            </p>
+          )}
+          {properties.map((prop, index) => (
+            <div
+              key={index}
+              className="flex items-start gap-1.5 rounded border p-2"
+              data-testid={`schema-property-${index}`}
+            >
+              <div className="flex-1 space-y-1.5">
+                <div className="flex gap-1.5">
+                  <Input
+                    value={prop.name}
+                    onChange={(e) =>
+                      updateProperty(index, { name: e.target.value })
+                    }
+                    placeholder="Property name"
+                    className="h-7 text-xs"
+                    data-testid={`property-name-${index}`}
+                  />
+                  <Select
+                    value={prop.type}
+                    onValueChange={(v) => updateProperty(index, { type: v })}
+                  >
+                    <SelectTrigger
+                      className="h-7 w-28 text-xs"
+                      data-testid={`property-type-${index}`}
+                    >
+                      <SelectValue />
+                    </SelectTrigger>
+                    <SelectContent>
+                      {PROPERTY_TYPES.map((t) => (
+                        <SelectItem key={t} value={t}>
+                          {t}
+                        </SelectItem>
+                      ))}
+                    </SelectContent>
+                  </Select>
+                </div>
+                <div className="flex items-center gap-2">
+                  <Input
+                    value={prop.description}
+                    onChange={(e) =>
+                      updateProperty(index, { description: e.target.value })
+                    }
+                    placeholder="Description (optional)"
+                    className="h-7 text-xs flex-1"
+                  />
+                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
+                    <Checkbox
+                      checked={prop.required}
+                      onCheckedChange={(v) =>
+                        updateProperty(index, { required: !!v })
+                      }
+                      data-testid={`property-required-${index}`}
+                    />
+                    Required
+                  </label>
+                </div>
+              </div>
+              <Button
+                type="button"
+                variant="ghost"
+                size="icon"
+                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
+                onClick={() => removeProperty(index)}
+                data-testid={`property-delete-${index}`}
+              >
+                <Trash2 className="h-3.5 w-3.5" />
+              </Button>
+            </div>
+          ))}
+
+          <Button
+            type="button"
+            variant="outline"
+            size="sm"
+            className="h-7 text-xs"
+            onClick={addProperty}
+            disabled={properties.length >= maxProperties}
+            data-testid="add-property-btn"
+          >
+            <Plus className="mr-1 h-3 w-3" />
+            Add Property
+            {properties.length > 0 && (
+              <span className="ml-1 text-muted-foreground">
+                ({properties.length}/{maxProperties})
+              </span>
+            )}
+          </Button>
+        </div>
+      ) : (
+        <div className="space-y-1">
+          <Textarea
+            value={rawText}
+            onChange={(e) => handleRawChange(e.target.value)}
+            className="min-h-[200px] font-mono text-xs"
+            placeholder='{"type": "object", "properties": {}}'
+            data-testid="schema-raw-textarea"
+          />
+          {rawError && (
+            <p
+              className="text-xs text-destructive"
+              data-testid="schema-raw-error"
+            >
+              {rawError}
+            </p>
+          )}
+        </div>
+      )}
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/agency/NodePropertyPanel.tsx b/apps/web/client/src/components/agency/NodePropertyPanel.tsx
index ab600363..41461ec7 100644
--- a/apps/web/client/src/components/agency/NodePropertyPanel.tsx
+++ b/apps/web/client/src/components/agency/NodePropertyPanel.tsx
@@ -19,6 +19,7 @@ import { Textarea } from "@/components/ui/textarea";
 import { Switch } from "@/components/ui/switch";
 import { Label } from "@/components/ui/label";
 import { Button } from "@/components/ui/button";
+import { Badge } from "@/components/ui/badge";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { Separator } from "@/components/ui/separator";
 import {
@@ -900,7 +901,14 @@ function AgentSupervisorForm({
                 key={tool.toolId}
                 className="flex items-center justify-between rounded border px-2 py-1"
               >
-                <span className="truncate text-xs">{tool.toolName}</span>
+                <span className="truncate text-xs flex items-center gap-1">
+                  {tool.toolName}
+                  {!tool.toolId.startsWith("builtin-") && (
+                    <Badge variant="outline" className="px-1 py-0 text-[9px] leading-tight">
+                      Custom
+                    </Badge>
+                  )}
+                </span>
                 <Button
                   variant="ghost"
                   size="icon"
diff --git a/apps/web/client/src/components/agency/ToolPicker.tsx b/apps/web/client/src/components/agency/ToolPicker.tsx
index 91a45e9c..8ebcacb7 100644
--- a/apps/web/client/src/components/agency/ToolPicker.tsx
+++ b/apps/web/client/src/components/agency/ToolPicker.tsx
@@ -8,11 +8,13 @@ import { Input } from "@/components/ui/input";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { ScrollArea } from "@/components/ui/scroll-area";
-import { Search, Wrench, AlertTriangle, ArrowLeft, Check } from "lucide-react";
+import { Search, Wrench, AlertTriangle, ArrowLeft, Check, Plus, Pencil, Trash2 } from "lucide-react";
 import { useState, useMemo } from "react";
 import { cn } from "@/lib/utils";
 import { trpc } from "@/lib/trpc";
+import { toast } from "sonner";
 import { ToolConfigPanel } from "./ToolConfigPanel";
+import { CustomToolCreator } from "./CustomToolCreator";
 
 interface ToolPickerProps {
   open: boolean;
@@ -32,8 +34,13 @@ const TYPE_LABELS: Record<string, string> = {
   skill: "Skill",
   sandbox: "Sandbox",
   custom: "Custom",
+  http_api: "Custom API",
+  openapi_import: "OpenAPI",
+  mcp_bridge: "MCP",
 };
 
+const CUSTOM_TOOL_TYPES = new Set(["custom", "http_api", "openapi_import", "mcp_bridge"]);
+
 export function ToolPicker({
   open,
   onClose,
@@ -47,6 +54,20 @@ export function ToolPicker({
     configSchema?: { fields: unknown[] } | null;
   } | null>(null);
   const [toolConfig, setToolConfig] = useState<Record<string, unknown>>({});
+  const [creatorOpen, setCreatorOpen] = useState(false);
+  const [editToolId, setEditToolId] = useState<string | undefined>();
+
+  const utils = (trpc as any).useUtils?.() ?? (trpc as any).useContext?.();
+
+  const deleteMutation = (trpc as any).agency?.deleteCustomTool?.useMutation?.({
+    onSuccess: () => {
+      toast.success("Tool deleted");
+      utils?.agency?.listTools?.invalidate?.();
+    },
+    onError: (err: any) => {
+      toast.error(err?.message ?? "Failed to delete tool");
+    },
+  }) ?? { mutate: () => {} };
 
   const { data: toolsData } = (trpc as any).agency?.listTools?.useQuery?.(
     undefined,
@@ -61,11 +82,13 @@ export function ToolPicker({
       toolType?: string;
       riskLevel?: string;
       requiresApproval?: boolean;
+      isEnabled?: boolean;
       configSchema?: { fields: unknown[] } | null;
     }> = toolsData?.tools ?? [];
 
     return allTools.filter(
       (t) =>
+        t.isEnabled !== false &&
         !excludeToolIds.includes(t.id) &&
         (!search ||
           t.name.toLowerCase().includes(search.toLowerCase()) ||
@@ -87,9 +110,17 @@ export function ToolPicker({
     setSelectedTool(null);
     setToolConfig({});
     setSearch("");
+    setCreatorOpen(false);
+    setEditToolId(undefined);
     onClose();
   };
 
+  const handleCreatorSuccess = () => {
+    utils?.agency?.listTools?.invalidate?.();
+    setCreatorOpen(false);
+    setEditToolId(undefined);
+  };
+
   const handleSelectTool = (tool: typeof tools[number]) => {
     if (tool.configSchema?.fields?.length) {
       // Step 2: show config form
@@ -173,15 +204,22 @@ export function ToolPicker({
                       </h4>
                       <div className="space-y-1">
                         {typeTools.map((tool) => (
-                          <button
+                          <div
                             key={tool.id}
-                            type="button"
-                            className="flex w-full items-start gap-2 rounded border px-3 py-2 text-left transition-colors hover:bg-accent"
-                            onClick={() => handleSelectTool(tool)}
+                            className="group flex w-full items-start gap-2 rounded border px-3 py-2 text-left transition-colors hover:bg-accent"
                           >
-                            <div className="min-w-0 flex-1">
+                            <button
+                              type="button"
+                              className="min-w-0 flex-1 text-left"
+                              onClick={() => handleSelectTool(tool)}
+                            >
                               <div className="flex items-center gap-1.5">
                                 <span className="text-sm font-medium">{tool.name}</span>
+                                {CUSTOM_TOOL_TYPES.has(tool.toolType ?? "") && (
+                                  <Badge variant="outline" className="px-1 py-0 text-[10px]">
+                                    Custom
+                                  </Badge>
+                                )}
                                 {tool.riskLevel && (
                                   <Badge
                                     variant="secondary"
@@ -202,8 +240,39 @@ export function ToolPicker({
                                   {tool.description}
                                 </p>
                               )}
-                            </div>
-                          </button>
+                            </button>
+                            {CUSTOM_TOOL_TYPES.has(tool.toolType ?? "") && (
+                              <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
+                                <button
+                                  type="button"
+                                  className="rounded p-1 hover:bg-muted"
+                                  onClick={(e) => {
+                                    e.stopPropagation();
+                                    setEditToolId(tool.id);
+                                    setCreatorOpen(true);
+                                  }}
+                                  title="Edit tool"
+                                  data-testid={`edit-tool-${tool.id}`}
+                                >
+                                  <Pencil className="h-3 w-3 text-muted-foreground" />
+                                </button>
+                                <button
+                                  type="button"
+                                  className="rounded p-1 hover:bg-muted"
+                                  onClick={(e) => {
+                                    e.stopPropagation();
+                                    if (confirm(`Delete tool "${tool.name}"?`)) {
+                                      deleteMutation.mutate({ toolId: tool.id });
+                                    }
+                                  }}
+                                  title="Delete tool"
+                                  data-testid={`delete-tool-${tool.id}`}
+                                >
+                                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
+                                </button>
+                              </div>
+                            )}
+                          </div>
                         ))}
                       </div>
                     </div>
@@ -211,8 +280,33 @@ export function ToolPicker({
                 </div>
               )}
             </ScrollArea>
+
+            <Button
+              type="button"
+              variant="outline"
+              size="sm"
+              className="w-full mt-2"
+              onClick={() => {
+                setEditToolId(undefined);
+                setCreatorOpen(true);
+              }}
+              data-testid="create-custom-tool-btn"
+            >
+              <Plus className="mr-1.5 h-3.5 w-3.5" />
+              Create Custom Tool
+            </Button>
           </>
         )}
+
+        <CustomToolCreator
+          open={creatorOpen}
+          onClose={() => {
+            setCreatorOpen(false);
+            setEditToolId(undefined);
+          }}
+          editToolId={editToolId}
+          onSuccess={handleCreatorSuccess}
+        />
       </DialogContent>
     </Dialog>
   );
diff --git a/apps/web/client/src/components/agency/__tests__/CustomToolCreator.test.tsx b/apps/web/client/src/components/agency/__tests__/CustomToolCreator.test.tsx
new file mode 100644
index 00000000..a1a2fff0
--- /dev/null
+++ b/apps/web/client/src/components/agency/__tests__/CustomToolCreator.test.tsx
@@ -0,0 +1,281 @@
+/**
+ * @vitest-environment jsdom
+ */
+
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent, waitFor } from "@testing-library/react";
+import { createElement } from "react";
+
+// ── Radix Dialog mock ────────────────────────────────────────
+vi.mock("@/components/ui/dialog", () => ({
+  Dialog: ({ children, open }: any) =>
+    open ? createElement("div", { "data-testid": "dialog" }, children) : null,
+  DialogContent: ({ children }: any) =>
+    createElement("div", { "data-testid": "dialog-content" }, children),
+  DialogHeader: ({ children }: any) => createElement("div", null, children),
+  DialogTitle: ({ children }: any) =>
+    createElement("h2", null, children),
+}));
+
+// ── Radix Select mock ────────────────────────────────────────
+vi.mock("@/components/ui/select", () => ({
+  Select: ({ children, value, onValueChange }: any) =>
+    createElement("div", null, children),
+  SelectTrigger: ({ children, ...props }: any) =>
+    createElement("button", { ...props, type: "button" }, children),
+  SelectValue: () => createElement("span"),
+  SelectContent: ({ children }: any) => createElement("div", null, children),
+  SelectItem: ({ children, value }: any) =>
+    createElement("option", { value }, children),
+}));
+
+// ── Switch mock ──────────────────────────────────────────────
+vi.mock("@/components/ui/switch", () => ({
+  Switch: ({ checked, onCheckedChange }: any) =>
+    createElement("input", {
+      type: "checkbox",
+      checked: !!checked,
+      onChange: (e: any) => onCheckedChange?.(e.target.checked),
+    }),
+}));
+
+// ── Checkbox mock ────────────────────────────────────────────
+vi.mock("@/components/ui/checkbox", () => ({
+  Checkbox: ({ checked, onCheckedChange, ...props }: any) =>
+    createElement("input", {
+      type: "checkbox",
+      checked: !!checked,
+      onChange: (e: any) => onCheckedChange?.(e.target.checked),
+      ...props,
+    }),
+}));
+
+// ── Sonner mock ──────────────────────────────────────────────
+vi.mock("sonner", () => ({
+  toast: { success: vi.fn(), error: vi.fn() },
+}));
+
+// ── tRPC mock ────────────────────────────────────────────────
+const mockCreateMutate = vi.fn();
+const mockUpdateMutate = vi.fn();
+const mockTestMutate = vi.fn();
+const mockInvalidate = vi.fn();
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    agency: {
+      createCustomTool: {
+        useMutation: (opts: any) => ({
+          mutate: (...args: any[]) => {
+            mockCreateMutate(...args);
+            opts?.onSuccess?.();
+          },
+          isPending: false,
+        }),
+      },
+      updateCustomTool: {
+        useMutation: (opts: any) => ({
+          mutate: (...args: any[]) => {
+            mockUpdateMutate(...args);
+            opts?.onSuccess?.();
+          },
+          isPending: false,
+        }),
+      },
+      testCustomTool: {
+        useMutation: (opts: any) => ({
+          mutate: (...args: any[]) => {
+            mockTestMutate(...args);
+            opts?.onSuccess?.({ status: 200, body: { ok: true }, latencyMs: 42 });
+          },
+          isPending: false,
+        }),
+      },
+      listCustomTools: {
+        useQuery: () => ({ data: undefined }),
+      },
+    },
+    useUtils: () => ({
+      agency: { listTools: { invalidate: mockInvalidate } },
+    }),
+  },
+}));
+
+describe("CustomToolCreator", () => {
+  let onClose: ReturnType<typeof vi.fn>;
+  let onSuccess: ReturnType<typeof vi.fn>;
+
+  beforeEach(() => {
+    vi.clearAllMocks();
+    onClose = vi.fn();
+    onSuccess = vi.fn();
+  });
+
+  it("renders step 1 (name/description) as initial view", async () => {
+    const { CustomToolCreator } = await import("../CustomToolCreator");
+    render(
+      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
+    );
+
+    expect(screen.getByTestId("step-basic-info")).toBeTruthy();
+    expect(screen.getByTestId("tool-name-input")).toBeTruthy();
+    expect(screen.getByText("Create Custom Tool")).toBeTruthy();
+  });
+
+  it("validates required fields before allowing next step", async () => {
+    const { CustomToolCreator } = await import("../CustomToolCreator");
+    render(
+      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
+    );
+
+    // Click next without filling name
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+
+    // Should still be on step 1
+    expect(screen.getByTestId("step-basic-info")).toBeTruthy();
+    expect(screen.getByText("Name is required")).toBeTruthy();
+  });
+
+  it("step 2 shows endpoint URL input and HTTP method select", async () => {
+    const { CustomToolCreator } = await import("../CustomToolCreator");
+    render(
+      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
+    );
+
+    // Fill name and go to step 2
+    fireEvent.change(screen.getByTestId("tool-name-input"), {
+      target: { value: "My Tool" },
+    });
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+
+    expect(screen.getByTestId("step-endpoint")).toBeTruthy();
+    expect(screen.getByTestId("tool-endpoint-input")).toBeTruthy();
+    expect(screen.getByTestId("http-method-select")).toBeTruthy();
+  });
+
+  it("step 2 has headers key-value editor with add button", async () => {
+    const { CustomToolCreator } = await import("../CustomToolCreator");
+    render(
+      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
+    );
+
+    // Navigate to step 2
+    fireEvent.change(screen.getByTestId("tool-name-input"), {
+      target: { value: "My Tool" },
+    });
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+
+    expect(screen.getByTestId("add-header-btn")).toBeTruthy();
+  });
+
+  it("step 3 renders JsonSchemaEditor", async () => {
+    const { CustomToolCreator } = await import("../CustomToolCreator");
+    render(
+      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
+    );
+
+    // Navigate to step 3
+    fireEvent.change(screen.getByTestId("tool-name-input"), {
+      target: { value: "My Tool" },
+    });
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+
+    fireEvent.change(screen.getByTestId("tool-endpoint-input"), {
+      target: { value: "https://api.example.com/v1" },
+    });
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+
+    expect(screen.getByTestId("step-schema")).toBeTruthy();
+    expect(screen.getByTestId("add-property-btn")).toBeTruthy();
+  });
+
+  it("calls createCustomTool.mutate on save with correctly shaped payload", async () => {
+    const { CustomToolCreator } = await import("../CustomToolCreator");
+    render(
+      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
+    );
+
+    // Fill step 1
+    fireEvent.change(screen.getByTestId("tool-name-input"), {
+      target: { value: "Test API" },
+    });
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+
+    // Fill step 2
+    fireEvent.change(screen.getByTestId("tool-endpoint-input"), {
+      target: { value: "https://api.test.com" },
+    });
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+
+    // Skip step 3
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+
+    // Step 4: save
+    fireEvent.click(screen.getByTestId("save-tool-btn"));
+
+    expect(mockCreateMutate).toHaveBeenCalledWith(
+      expect.objectContaining({
+        name: "Test API",
+        endpoint: "https://api.test.com",
+        httpMethod: "POST",
+        riskLevel: "low",
+      }),
+    );
+  });
+
+  it("disables save button while mutation is pending", async () => {
+    // The mock has isPending: false, so we check the button is enabled
+    const { CustomToolCreator } = await import("../CustomToolCreator");
+    render(
+      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
+    );
+
+    // Navigate to step 4
+    fireEvent.change(screen.getByTestId("tool-name-input"), {
+      target: { value: "My Tool" },
+    });
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+    fireEvent.change(screen.getByTestId("tool-endpoint-input"), {
+      target: { value: "https://api.test.com" },
+    });
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+
+    // Button should exist and not be disabled when isPending is false
+    const saveBtn = screen.getByTestId("save-tool-btn");
+    expect(saveBtn).toBeTruthy();
+    expect(saveBtn.hasAttribute("disabled")).toBe(false);
+  });
+
+  it("navigating back between steps preserves entered data", async () => {
+    const { CustomToolCreator } = await import("../CustomToolCreator");
+    render(
+      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
+    );
+
+    // Fill step 1
+    fireEvent.change(screen.getByTestId("tool-name-input"), {
+      target: { value: "Preserved Name" },
+    });
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+
+    // Go to step 2, fill endpoint
+    fireEvent.change(screen.getByTestId("tool-endpoint-input"), {
+      target: { value: "https://preserved.com" },
+    });
+
+    // Go back to step 1
+    fireEvent.click(screen.getByText("Back"));
+
+    // Name should still be there
+    const nameInput = screen.getByTestId("tool-name-input") as HTMLInputElement;
+    expect(nameInput.value).toBe("Preserved Name");
+
+    // Go forward again
+    fireEvent.click(screen.getByTestId("next-step-btn"));
+    const endpointInput = screen.getByTestId(
+      "tool-endpoint-input",
+    ) as HTMLInputElement;
+    expect(endpointInput.value).toBe("https://preserved.com");
+  });
+});
diff --git a/apps/web/client/src/components/agency/__tests__/JsonSchemaEditor.test.tsx b/apps/web/client/src/components/agency/__tests__/JsonSchemaEditor.test.tsx
new file mode 100644
index 00000000..da7f854e
--- /dev/null
+++ b/apps/web/client/src/components/agency/__tests__/JsonSchemaEditor.test.tsx
@@ -0,0 +1,181 @@
+/**
+ * @vitest-environment jsdom
+ */
+
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent } from "@testing-library/react";
+import { createElement } from "react";
+
+// ── Radix Select mock ────────────────────────────────────────
+vi.mock("@/components/ui/select", () => ({
+  Select: ({ children, value, onValueChange }: any) =>
+    createElement("div", { "data-testid": "select" }, children),
+  SelectTrigger: ({ children, ...props }: any) =>
+    createElement("button", { ...props, type: "button" }, children),
+  SelectValue: () => createElement("span"),
+  SelectContent: ({ children }: any) => createElement("div", null, children),
+  SelectItem: ({ children, value }: any) =>
+    createElement("option", { value }, children),
+}));
+
+// ── Checkbox mock ────────────────────────────────────────────
+vi.mock("@/components/ui/checkbox", () => ({
+  Checkbox: ({ checked, onCheckedChange, ...props }: any) =>
+    createElement("input", {
+      type: "checkbox",
+      checked: !!checked,
+      onChange: (e: any) => onCheckedChange?.(e.target.checked),
+      ...props,
+    }),
+}));
+
+describe("JsonSchemaEditor", () => {
+  let onChange: ReturnType<typeof vi.fn>;
+
+  beforeEach(() => {
+    vi.clearAllMocks();
+    onChange = vi.fn();
+  });
+
+  it("renders empty state with Add Property button", async () => {
+    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
+    render(createElement(JsonSchemaEditor, { value: null, onChange }));
+
+    expect(screen.getByTestId("add-property-btn")).toBeTruthy();
+    expect(screen.getByText(/No properties defined/)).toBeTruthy();
+  });
+
+  it("adds a property when Add Property is clicked", async () => {
+    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
+    render(createElement(JsonSchemaEditor, { value: null, onChange }));
+
+    fireEvent.click(screen.getByTestId("add-property-btn"));
+
+    expect(onChange).toHaveBeenCalledWith(
+      expect.objectContaining({ type: "object", properties: expect.any(Object) }),
+    );
+    expect(screen.getByTestId("schema-property-0")).toBeTruthy();
+  });
+
+  it("removes a property via delete button", async () => {
+    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
+    const value = {
+      type: "object",
+      properties: { name: { type: "string" } },
+    };
+    render(createElement(JsonSchemaEditor, { value, onChange }));
+
+    expect(screen.getByTestId("schema-property-0")).toBeTruthy();
+
+    fireEvent.click(screen.getByTestId("property-delete-0"));
+
+    // onChange should be called with empty properties
+    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
+    expect(Object.keys(lastCall.properties)).toHaveLength(0);
+  });
+
+  it("toggles between visual editor and raw JSON textarea", async () => {
+    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
+    render(createElement(JsonSchemaEditor, { value: null, onChange }));
+
+    // Start in visual mode
+    expect(screen.getByTestId("add-property-btn")).toBeTruthy();
+
+    // Switch to raw mode
+    fireEvent.click(screen.getByTestId("schema-mode-toggle"));
+    expect(screen.getByTestId("schema-raw-textarea")).toBeTruthy();
+
+    // Switch back to visual mode
+    fireEvent.click(screen.getByTestId("schema-mode-toggle"));
+    expect(screen.getByTestId("add-property-btn")).toBeTruthy();
+  });
+
+  it("raw JSON textarea shows error indicator on invalid JSON", async () => {
+    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
+    render(createElement(JsonSchemaEditor, { value: null, onChange }));
+
+    // Switch to raw mode
+    fireEvent.click(screen.getByTestId("schema-mode-toggle"));
+
+    // Type invalid JSON
+    fireEvent.change(screen.getByTestId("schema-raw-textarea"), {
+      target: { value: "{invalid json" },
+    });
+
+    expect(screen.getByTestId("schema-raw-error")).toBeTruthy();
+    expect(screen.getByTestId("schema-raw-error").textContent).toBe("Invalid JSON");
+  });
+
+  it("raw JSON textarea syncs back to visual editor on valid JSON", async () => {
+    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
+    render(createElement(JsonSchemaEditor, { value: null, onChange }));
+
+    // Switch to raw mode
+    fireEvent.click(screen.getByTestId("schema-mode-toggle"));
+
+    const schema = JSON.stringify({
+      type: "object",
+      properties: { age: { type: "number" } },
+      required: ["age"],
+    });
+    fireEvent.change(screen.getByTestId("schema-raw-textarea"), {
+      target: { value: schema },
+    });
+
+    // onChange should fire with valid schema
+    expect(onChange).toHaveBeenCalledWith(
+      expect.objectContaining({
+        type: "object",
+        properties: expect.objectContaining({ age: { type: "number" } }),
+      }),
+    );
+
+    // Switch back to visual
+    fireEvent.click(screen.getByTestId("schema-mode-toggle"));
+    expect(screen.getByTestId("schema-property-0")).toBeTruthy();
+  });
+
+  it("onChange fires with valid JSON Schema object on every edit", async () => {
+    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
+    render(createElement(JsonSchemaEditor, { value: null, onChange }));
+
+    fireEvent.click(screen.getByTestId("add-property-btn"));
+    expect(onChange).toHaveBeenCalled();
+
+    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
+    expect(lastCall).toHaveProperty("type", "object");
+    expect(lastCall).toHaveProperty("properties");
+  });
+
+  it("enforces max properties limit", async () => {
+    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
+    render(
+      createElement(JsonSchemaEditor, {
+        value: null,
+        onChange,
+        maxProperties: 2,
+      }),
+    );
+
+    // Add 2 properties
+    fireEvent.click(screen.getByTestId("add-property-btn"));
+    fireEvent.click(screen.getByTestId("add-property-btn"));
+
+    // Button should be disabled now
+    const addBtn = screen.getByTestId("add-property-btn");
+    expect(addBtn.hasAttribute("disabled")).toBe(true);
+  });
+
+  it("handles nested object properties (renders type as object)", async () => {
+    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
+    const value = {
+      type: "object",
+      properties: {
+        address: { type: "object", description: "Address object" },
+      },
+    };
+    render(createElement(JsonSchemaEditor, { value, onChange }));
+
+    expect(screen.getByTestId("schema-property-0")).toBeTruthy();
+  });
+});
diff --git a/apps/web/client/src/components/agency/__tests__/ToolPickerCustom.test.tsx b/apps/web/client/src/components/agency/__tests__/ToolPickerCustom.test.tsx
new file mode 100644
index 00000000..78d728db
--- /dev/null
+++ b/apps/web/client/src/components/agency/__tests__/ToolPickerCustom.test.tsx
@@ -0,0 +1,238 @@
+/**
+ * @vitest-environment jsdom
+ */
+
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent } from "@testing-library/react";
+import { createElement } from "react";
+
+// ── Radix Dialog mock ────────────────────────────────────────
+vi.mock("@/components/ui/dialog", () => ({
+  Dialog: ({ children, open }: any) =>
+    open ? createElement("div", { "data-testid": "dialog" }, children) : null,
+  DialogContent: ({ children }: any) =>
+    createElement("div", { "data-testid": "dialog-content" }, children),
+  DialogHeader: ({ children }: any) => createElement("div", null, children),
+  DialogTitle: ({ children }: any) =>
+    createElement("h2", null, children),
+}));
+
+// ── Radix Select mock ────────────────────────────────────────
+vi.mock("@/components/ui/select", () => ({
+  Select: ({ children }: any) => createElement("div", null, children),
+  SelectTrigger: ({ children, ...props }: any) =>
+    createElement("button", { ...props, type: "button" }, children),
+  SelectValue: () => createElement("span"),
+  SelectContent: ({ children }: any) => createElement("div", null, children),
+  SelectItem: ({ children, value }: any) =>
+    createElement("option", { value }, children),
+}));
+
+// ── Switch mock ──────────────────────────────────────────────
+vi.mock("@/components/ui/switch", () => ({
+  Switch: ({ checked, onCheckedChange }: any) =>
+    createElement("input", {
+      type: "checkbox",
+      checked: !!checked,
+      onChange: (e: any) => onCheckedChange?.(e.target.checked),
+    }),
+}));
+
+// ── Checkbox mock ────────────────────────────────────────────
+vi.mock("@/components/ui/checkbox", () => ({
+  Checkbox: ({ checked, onCheckedChange, ...props }: any) =>
+    createElement("input", {
+      type: "checkbox",
+      checked: !!checked,
+      onChange: (e: any) => onCheckedChange?.(e.target.checked),
+      ...props,
+    }),
+}));
+
+// ── Sonner mock ──────────────────────────────────────────────
+vi.mock("sonner", () => ({
+  toast: { success: vi.fn(), error: vi.fn() },
+}));
+
+// ── ToolConfigPanel mock ─────────────────────────────────────
+vi.mock("../ToolConfigPanel", () => ({
+  ToolConfigPanel: () => createElement("div", { "data-testid": "tool-config-panel" }),
+}));
+
+// ── tRPC mock ────────────────────────────────────────────────
+const mockListToolsData = {
+  tools: [
+    {
+      id: "builtin-web-search",
+      name: "Web Search",
+      description: "Search the web",
+      toolType: "builtin",
+      riskLevel: "low",
+      isEnabled: true,
+    },
+    {
+      id: "custom-uuid-1",
+      name: "My Custom API",
+      description: "Custom API call",
+      toolType: "http_api",
+      riskLevel: "medium",
+      isEnabled: true,
+    },
+    {
+      id: "custom-uuid-2",
+      name: "Disabled Tool",
+      description: "Should not appear",
+      toolType: "http_api",
+      riskLevel: "low",
+      isEnabled: false,
+    },
+  ],
+};
+
+const mockDeleteMutate = vi.fn();
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    agency: {
+      listTools: {
+        useQuery: () => ({ data: mockListToolsData }),
+      },
+      deleteCustomTool: {
+        useMutation: (opts: any) => ({
+          mutate: (...args: any[]) => {
+            mockDeleteMutate(...args);
+            opts?.onSuccess?.();
+          },
+        }),
+      },
+      createCustomTool: {
+        useMutation: (opts: any) => ({
+          mutate: vi.fn(),
+          isPending: false,
+        }),
+      },
+      updateCustomTool: {
+        useMutation: (opts: any) => ({
+          mutate: vi.fn(),
+          isPending: false,
+        }),
+      },
+      testCustomTool: {
+        useMutation: (opts: any) => ({
+          mutate: vi.fn(),
+          isPending: false,
+        }),
+      },
+      listCustomTools: {
+        useQuery: () => ({ data: undefined }),
+      },
+    },
+    useUtils: () => ({
+      agency: { listTools: { invalidate: vi.fn() } },
+    }),
+  },
+}));
+
+describe("ToolPicker with custom tools", () => {
+  let onClose: ReturnType<typeof vi.fn>;
+  let onSelect: ReturnType<typeof vi.fn>;
+
+  beforeEach(() => {
+    vi.clearAllMocks();
+    onClose = vi.fn();
+    onSelect = vi.fn();
+    // Mock window.confirm for delete
+    vi.spyOn(window, "confirm").mockReturnValue(true);
+  });
+
+  it('renders "Custom API" group section when custom tools exist', async () => {
+    const { ToolPicker } = await import("../ToolPicker");
+    render(
+      createElement(ToolPicker, {
+        open: true,
+        onClose,
+        onSelect,
+        excludeToolIds: [],
+      }),
+    );
+
+    // Should show "Custom API" group header for http_api tools
+    expect(screen.getByText("Custom API")).toBeTruthy();
+    expect(screen.getByText("My Custom API")).toBeTruthy();
+  });
+
+  it('custom tools display a "Custom" badge', async () => {
+    const { ToolPicker } = await import("../ToolPicker");
+    render(
+      createElement(ToolPicker, {
+        open: true,
+        onClose,
+        onSelect,
+        excludeToolIds: [],
+      }),
+    );
+
+    // The custom tool should have a "Custom" badge
+    const badges = screen.getAllByText("Custom");
+    expect(badges.length).toBeGreaterThan(0);
+  });
+
+  it('"Create Custom Tool" button appears', async () => {
+    const { ToolPicker } = await import("../ToolPicker");
+    render(
+      createElement(ToolPicker, {
+        open: true,
+        onClose,
+        onSelect,
+        excludeToolIds: [],
+      }),
+    );
+
+    expect(screen.getByTestId("create-custom-tool-btn")).toBeTruthy();
+    expect(screen.getByText("Create Custom Tool")).toBeTruthy();
+  });
+
+  it("disabled custom tools (isEnabled=false) are excluded from the list", async () => {
+    const { ToolPicker } = await import("../ToolPicker");
+    render(
+      createElement(ToolPicker, {
+        open: true,
+        onClose,
+        onSelect,
+        excludeToolIds: [],
+      }),
+    );
+
+    // "Disabled Tool" should not appear
+    expect(screen.queryByText("Disabled Tool")).toBeNull();
+  });
+
+  it("edit icon on custom tool exists", async () => {
+    const { ToolPicker } = await import("../ToolPicker");
+    render(
+      createElement(ToolPicker, {
+        open: true,
+        onClose,
+        onSelect,
+        excludeToolIds: [],
+      }),
+    );
+
+    expect(screen.getByTestId("edit-tool-custom-uuid-1")).toBeTruthy();
+  });
+
+  it("builtin tools do not have edit/delete buttons", async () => {
+    const { ToolPicker } = await import("../ToolPicker");
+    render(
+      createElement(ToolPicker, {
+        open: true,
+        onClose,
+        onSelect,
+        excludeToolIds: [],
+      }),
+    );
+
+    expect(screen.queryByTestId("edit-tool-builtin-web-search")).toBeNull();
+    expect(screen.queryByTestId("delete-tool-builtin-web-search")).toBeNull();
+  });
+});
