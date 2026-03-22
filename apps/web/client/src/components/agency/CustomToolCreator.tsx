import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Play,
  Check,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { JsonSchemaEditor } from "./JsonSchemaEditor";

interface EditToolData {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  category?: string;
  riskLevel?: string;
  endpoint?: string;
  httpMethod?: string;
  hasHeaders?: boolean;
  strictSchema?: boolean;
  oneCallAtATime?: boolean;
  inputSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  retryPolicy?: { maxRetries?: number; backoffMs?: number } | null;
}

interface CustomToolCreatorProps {
  open: boolean;
  onClose: () => void;
  /** If provided, the form pre-fills for edit mode */
  editToolId?: string;
  /** Pre-fetched tool data for edit mode (avoids re-fetching) */
  editToolData?: EditToolData;
  onSuccess?: () => void;
}

interface HeaderEntry {
  key: string;
  value: string;
}

interface FormState {
  name: string;
  description: string;
  icon: string;
  category: string;
  riskLevel: "low" | "medium" | "high";
  endpoint: string;
  httpMethod: "GET" | "POST" | "PUT" | "DELETE";
  headers: HeaderEntry[];
  maxRetries: number;
  backoffMs: number;
  strictSchema: boolean;
  oneCallAtATime: boolean;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
}

const INITIAL_STATE: FormState = {
  name: "",
  description: "",
  icon: "",
  category: "",
  riskLevel: "low",
  endpoint: "",
  httpMethod: "POST",
  headers: [],
  maxRetries: 0,
  backoffMs: 1000,
  strictSchema: false,
  oneCallAtATime: false,
  inputSchema: null,
  outputSchema: null,
};

const STEPS = ["Basic Info", "Endpoint", "Schema", "Test & Save"] as const;

export function CustomToolCreator({
  open,
  onClose,
  editToolId,
  editToolData,
  onSuccess,
}: CustomToolCreatorProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [showOutputSchema, setShowOutputSchema] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<{
    status: number;
    body: string;
    latencyMs: number;
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [headersModified, setHeadersModified] = useState(false);

  const createMutation = (trpc as any).agency?.createCustomTool?.useMutation?.({
    onSuccess: () => {
      toast.success("Custom tool created");
      onSuccess?.();
      handleClose();
    },
    onError: (err: any) => {
      const msg = err?.message ?? "Failed to create tool";
      if (msg.includes("SSRF")) {
        setFieldErrors((prev) => ({ ...prev, endpoint: msg }));
        setStep(1);
      } else {
        toast.error(msg);
      }
    },
  }) ?? { mutate: () => {}, isPending: false };

  const updateMutation = (trpc as any).agency?.updateCustomTool?.useMutation?.({
    onSuccess: () => {
      toast.success("Custom tool updated");
      onSuccess?.();
      handleClose();
    },
    onError: (err: any) => {
      const msg = err?.message ?? "Failed to update tool";
      if (msg.includes("SSRF")) {
        setFieldErrors((prev) => ({ ...prev, endpoint: msg }));
        setStep(1);
      } else {
        toast.error(msg);
      }
    },
  }) ?? { mutate: () => {}, isPending: false };

  const testMutation = (trpc as any).agency?.testCustomTool?.useMutation?.({
    onSuccess: (data: any) => {
      setTestResult({
        status: data?.status ?? 200,
        body: JSON.stringify(data?.body ?? data, null, 2),
        latencyMs: data?.latencyMs ?? 0,
      });
    },
    onError: (err: any) => {
      setTestResult({
        status: 500,
        body: err?.message ?? "Test failed",
        latencyMs: 0,
      });
    },
  }) ?? { mutate: () => {}, isPending: false };

  // Prefill form when editing with provided tool data
  useEffect(() => {
    if (editToolId && editToolData && open) {
      setForm({
        name: editToolData.name ?? "",
        description: editToolData.description ?? "",
        icon: editToolData.icon ?? "",
        category: editToolData.category ?? "",
        riskLevel: (editToolData.riskLevel as FormState["riskLevel"]) ?? "low",
        endpoint: editToolData.endpoint ?? "",
        httpMethod: (editToolData.httpMethod as FormState["httpMethod"]) ?? "POST",
        headers: [],
        maxRetries: editToolData.retryPolicy?.maxRetries ?? 0,
        backoffMs: editToolData.retryPolicy?.backoffMs ?? 1000,
        strictSchema: editToolData.strictSchema ?? false,
        oneCallAtATime: editToolData.oneCallAtATime ?? false,
        inputSchema: editToolData.inputSchema ?? null,
        outputSchema: editToolData.outputSchema ?? null,
      });
      setHeadersModified(false);
    }
  }, [editToolId, editToolData, open]);

  const handleClose = () => {
    setStep(0);
    setForm(INITIAL_STATE);
    setTestResult(null);
    setTestInput("");
    setFieldErrors({});
    setShowOutputSchema(false);
    setHeadersModified(false);
    onClose();
  };

  const update = (updates: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    // Clear errors for updated fields
    const keys = Object.keys(updates);
    if (keys.some((k) => fieldErrors[k])) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        for (const k of keys) delete next[k];
        return next;
      });
    }
  };

  const validateStep = (s: number): boolean => {
    const errors: Record<string, string> = {};
    if (s === 0) {
      if (!form.name.trim()) errors.name = "Name is required";
      if (form.name.length > 100)
        errors.name = "Name must be 100 characters or less";
    }
    if (s === 1) {
      if (!form.endpoint.trim()) errors.endpoint = "Endpoint URL is required";
      try {
        new URL(form.endpoint);
      } catch {
        if (form.endpoint.trim()) errors.endpoint = "Invalid URL";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goNext = () => {
    if (validateStep(step)) setStep((s) => Math.min(s + 1, 3));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleSave = () => {
    // Validate steps 0 and 1 before saving
    if (!validateStep(0)) { setStep(0); return; }
    if (!validateStep(1)) { setStep(1); return; }

    // Only include headers when user actually added new ones
    const headersPayload =
      headersModified && form.headers.some((h) => h.key.trim())
        ? Object.fromEntries(
            form.headers
              .filter((h) => h.key.trim())
              .map((h) => [h.key, h.value]),
          )
        : undefined;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      icon: form.icon.trim() || undefined,
      category: form.category.trim() || undefined,
      riskLevel: form.riskLevel,
      endpoint: form.endpoint.trim(),
      httpMethod: form.httpMethod,
      headers: headersPayload,
      retryPolicy:
        form.maxRetries > 0
          ? { maxRetries: form.maxRetries, backoffMs: form.backoffMs }
          : undefined,
      strictSchema: form.strictSchema,
      oneCallAtATime: form.oneCallAtATime,
      inputSchema: form.inputSchema,
      outputSchema: form.outputSchema,
    };

    if (editToolId) {
      updateMutation.mutate({ toolId: editToolId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleTest = () => {
    if (!editToolId) return;
    let sampleInput: Record<string, unknown> = {};
    try {
      sampleInput = testInput.trim() ? JSON.parse(testInput) : {};
    } catch {
      toast.error("Invalid JSON input");
      return;
    }
    testMutation.mutate({ toolId: editToolId, sampleInput });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editToolId ? "Edit Custom Tool" : "Create Custom Tool"}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-1">
              <Badge
                variant={step === i ? "default" : step > i ? "secondary" : "outline"}
                className={cn(
                  "text-[10px] cursor-pointer",
                  step === i && "bg-indigo-600",
                )}
                onClick={() => {
                  if (i < step || validateStep(step)) setStep(i);
                }}
              >
                {i + 1}. {label}
              </Badge>
              {i < STEPS.length - 1 && (
                <span className="text-muted-foreground text-xs">→</span>
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Basic Info */}
        {step === 0 && (
          <div className="space-y-3" data-testid="step-basic-info">
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="My Custom Tool"
                className="h-8 text-sm"
                maxLength={100}
                data-testid="tool-name-input"
              />
              {fieldErrors.name && (
                <p className="text-xs text-destructive">{fieldErrors.name}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="What does this tool do?"
                className="text-sm min-h-[60px]"
                maxLength={500}
              />
            </div>
            <div className="flex gap-3">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">Icon (optional)</Label>
                <Input
                  value={form.icon}
                  onChange={(e) => update({ icon: e.target.value })}
                  placeholder="wrench"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => update({ category: e.target.value })}
                  placeholder="api"
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Risk Level</Label>
              <Select
                value={form.riskLevel}
                onValueChange={(v) =>
                  update({ riskLevel: v as FormState["riskLevel"] })
                }
              >
                <SelectTrigger className="h-8 text-sm" data-testid="risk-level-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step 2: Endpoint Configuration */}
        {step === 1 && (
          <div className="space-y-3" data-testid="step-endpoint">
            <div className="space-y-1.5">
              <Label className="text-xs">Endpoint URL *</Label>
              <Input
                value={form.endpoint}
                onChange={(e) => update({ endpoint: e.target.value })}
                placeholder="https://api.example.com/v1/action"
                className="h-8 text-sm"
                data-testid="tool-endpoint-input"
              />
              {fieldErrors.endpoint && (
                <p className="text-xs text-destructive">{fieldErrors.endpoint}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">HTTP Method</Label>
              <Select
                value={form.httpMethod}
                onValueChange={(v) =>
                  update({ httpMethod: v as FormState["httpMethod"] })
                }
              >
                <SelectTrigger className="h-8 text-sm" data-testid="http-method-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Headers key-value editor */}
            <div className="space-y-1.5">
              <Label className="text-xs">Headers</Label>
              {editToolId && editToolData?.hasHeaders && !headersModified && (
                <p className="text-[10px] text-muted-foreground">
                  This tool has existing headers (stored encrypted). Add new
                  values below only to replace them.
                </p>
              )}
              {form.headers.map((header, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <Input
                    value={header.key}
                    onChange={(e) => {
                      const headers = [...form.headers];
                      headers[i] = { ...headers[i], key: e.target.value };
                      update({ headers });
                    }}
                    placeholder="Key"
                    className="h-7 text-xs flex-1"
                  />
                  <Input
                    value={header.value}
                    onChange={(e) => {
                      const headers = [...form.headers];
                      headers[i] = { ...headers[i], value: e.target.value };
                      update({ headers });
                    }}
                    placeholder="Value"
                    className="h-7 text-xs flex-1"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      setHeadersModified(true);
                      update({
                        headers: form.headers.filter((_, j) => j !== i),
                      });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setHeadersModified(true);
                  update({
                    headers: [...form.headers, { key: "", value: "" }],
                  });
                }}
                data-testid="add-header-btn"
              >
                <Plus className="mr-1 h-3 w-3" /> Add Header
              </Button>
            </div>

            <div className="flex gap-3">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">Max Retries (0-5)</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={form.maxRetries}
                  onChange={(e) =>
                    update({
                      maxRetries: Math.min(5, Math.max(0, Number(e.target.value))),
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">Backoff (ms)</Label>
                <Input
                  type="number"
                  min={100}
                  value={form.backoffMs}
                  onChange={(e) =>
                    update({ backoffMs: Math.max(100, Number(e.target.value)) })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Strict Schema</Label>
                <p className="text-[10px] text-muted-foreground">
                  Enforce exact JSON Schema match
                </p>
              </div>
              <Switch
                checked={form.strictSchema}
                onCheckedChange={(v) => update({ strictSchema: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">One Call at a Time</Label>
                <p className="text-[10px] text-muted-foreground">
                  Prevent concurrent calls
                </p>
              </div>
              <Switch
                checked={form.oneCallAtATime}
                onCheckedChange={(v) => update({ oneCallAtATime: v })}
              />
            </div>
          </div>
        )}

        {/* Step 3: JSON Schema */}
        {step === 2 && (
          <div className="space-y-3" data-testid="step-schema">
            <JsonSchemaEditor
              value={form.inputSchema}
              onChange={(schema) => update({ inputSchema: schema })}
            />
            <div className="border-t pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowOutputSchema(!showOutputSchema)}
              >
                {showOutputSchema ? "Hide" : "Show"} Output Schema (optional)
              </Button>
              {showOutputSchema && (
                <div className="mt-2">
                  <JsonSchemaEditor
                    value={form.outputSchema}
                    onChange={(schema) => update({ outputSchema: schema })}
                    label="Output Schema"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Test & Save */}
        {step === 3 && (
          <div className="space-y-3" data-testid="step-test">
            {editToolId && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Sample Input (JSON)</Label>
                  <Textarea
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder='{"key": "value"}'
                    className="min-h-[80px] font-mono text-xs"
                    data-testid="test-input-textarea"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={testMutation.isPending}
                  data-testid="test-tool-btn"
                >
                  {testMutation.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="mr-1 h-3 w-3" />
                  )}
                  Test Tool
                </Button>
                {testResult && (
                  <div className="rounded border p-2 bg-muted/50" data-testid="test-result">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={testResult.status < 400 ? "secondary" : "destructive"}
                        className="text-[10px]"
                      >
                        {testResult.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {testResult.latencyMs}ms
                      </span>
                    </div>
                    <pre className="text-xs font-mono whitespace-pre-wrap max-h-[150px] overflow-auto">
                      {testResult.body}
                    </pre>
                  </div>
                )}
              </>
            )}
            {!editToolId && (
              <p className="text-xs text-muted-foreground">
                Save the tool first, then test it from the tool picker.
              </p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={step === 0 ? handleClose : goBack}
            disabled={isPending}
          >
            <ArrowLeft className="mr-1 h-3 w-3" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          <div className="flex gap-2">
            {step < 3 && (
              <Button
                type="button"
                size="sm"
                onClick={goNext}
                data-testid="next-step-btn"
              >
                Next
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            )}
            {step === 3 && (
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={isPending}
                data-testid="save-tool-btn"
              >
                {isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Check className="mr-1 h-3 w-3" />
                )}
                {editToolId ? "Update" : "Save"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
