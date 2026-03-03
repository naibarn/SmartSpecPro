/**
 * WebhookTriggers — Inbound webhook trigger management page.
 *
 * Features:
 * - List all triggers for the tenant
 * - Create / Edit trigger (modal)
 * - Auth type: token or HMAC-SHA256
 * - Target type: chat, agency, or workflow
 * - Payload template editor with {{variable}} syntax
 * - Webhook URL display with copy button
 * - Delivery logs per trigger (expandable)
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Plus, Pencil, Trash2, ChevronDown, ChevronRight, RefreshCw, Webhook, Lock, FlaskConical } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TriggerRow {
  id: string;
  name: string;
  description?: string | null;
  authType: string;
  targetType: string;
  rateLimitPerMinute: number | null;
  monthlyTriggerBudget?: number | null;
  isActive: boolean | null;
  totalTriggers: number | null;
  lastTriggeredAt?: Date | string | null;
  tenantId: string;
}

interface LogRow {
  id: string;
  triggerId: string;
  status: string;
  processingTimeMs?: number | null;
  creditsConsumed?: string | null;
  errorMessage?: string | null;
  createdAt: Date | string;
}

interface TriggerFormData {
  name: string;
  description: string;
  authType: "token" | "hmac_sha256";
  authSecret: string;
  targetType: "chat" | "agency" | "workflow";
  targetConversationId: string;
  payloadTemplate: string;
  rateLimitPerMinute: number;
}

const DEFAULT_FORM: TriggerFormData = {
  name: "",
  description: "",
  authType: "token",
  authSecret: "",
  targetType: "chat",
  targetConversationId: "",
  payloadTemplate: "",
  rateLimitPerMinute: 10,
};

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    success: "default",
    auth_failed: "destructive",
    rate_limited: "secondary",
    target_error: "destructive",
    credit_insufficient: "secondary",
  };
  return <Badge variant={variants[status] ?? "outline"}>{status.replace("_", " ")}</Badge>;
}

// ── Delivery Logs panel ────────────────────────────────────────────────────────

function DeliveryLogs({ triggerId }: { triggerId: string }) {
  const logsQuery = trpc.webhookTriggers.getLogs.useQuery({ triggerId, limit: 20, offset: 0 });
  const logs = (logsQuery.data ?? []) as LogRow[];

  if (!logs.length) {
    return <p className="text-sm text-muted-foreground py-2">No delivery logs yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Credits</TableHead>
          <TableHead>Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(log.createdAt as string).toLocaleString()}
            </TableCell>
            <TableCell>
              <StatusBadge status={log.status} />
            </TableCell>
            <TableCell className="text-xs">{log.processingTimeMs ?? "—"}ms</TableCell>
            <TableCell className="text-xs">{log.creditsConsumed ?? "0"}</TableCell>
            <TableCell className="text-xs text-destructive truncate max-w-[200px]">
              {log.errorMessage ?? ""}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Webhook URL display ────────────────────────────────────────────────────────

function WebhookUrlDisplay({ triggerId }: { triggerId: string }) {
  const { toast } = useToast();
  const url = `https://smartaihub.app/api/webhooks/trigger/${triggerId}`;
  return (
    <div className="flex items-center gap-2 mt-2">
      <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{url}</code>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => {
          navigator.clipboard.writeText(url);
          toast({ title: "Webhook URL copied!" });
        }}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ── Trigger form dialog ────────────────────────────────────────────────────────

function TriggerFormDialog({
  open,
  onClose,
  editTrigger,
}: {
  open: boolean;
  onClose: () => void;
  editTrigger?: TriggerRow | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = Boolean(editTrigger);

  const [form, setForm] = useState<TriggerFormData>(() =>
    editTrigger
      ? {
          name: editTrigger.name,
          description: editTrigger.description ?? "",
          authType: (editTrigger.authType as "token" | "hmac_sha256") ?? "token",
          authSecret: "",
          targetType: (editTrigger.targetType as "chat" | "agency" | "workflow") ?? "chat",
          targetConversationId: "",
          payloadTemplate: "",
          rateLimitPerMinute: editTrigger.rateLimitPerMinute ?? 10,
        }
      : { ...DEFAULT_FORM },
  );

  const createMut = trpc.webhookTriggers.create.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["webhookTriggers", "list"]] });
      toast({ title: "Webhook trigger created!" });
      onClose();
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = trpc.webhookTriggers.update.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["webhookTriggers", "list"]] });
      toast({ title: "Webhook trigger updated!" });
      onClose();
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!isEdit && !form.authSecret.trim()) {
      toast({ title: "Auth secret is required", variant: "destructive" });
      return;
    }
    let parsedTemplate: Record<string, unknown> | undefined;
    if (form.payloadTemplate.trim()) {
      try {
        parsedTemplate = JSON.parse(form.payloadTemplate);
      } catch {
        toast({ title: "Payload template must be valid JSON", variant: "destructive" });
        return;
      }
    }

    if (isEdit) {
      updateMut.mutate({
        triggerId: editTrigger!.id,
        name: form.name,
        description: form.description || undefined,
        authSecret: form.authSecret || undefined,
        targetType: form.targetType,
        rateLimitPerMinute: form.rateLimitPerMinute,
        payloadTemplate: parsedTemplate,
      });
    } else {
      createMut.mutate({
        name: form.name,
        description: form.description || undefined,
        authType: form.authType,
        authSecret: form.authSecret,
        targetType: form.targetType,
        targetConversationId: form.targetConversationId
          ? parseInt(form.targetConversationId)
          : undefined,
        payloadTemplate: parsedTemplate,
        rateLimitPerMinute: form.rateLimitPerMinute,
      });
    }
  };

  const pending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Trigger" : "Create Webhook Trigger"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="wt-name">Name</Label>
            <Input
              id="wt-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Order notifications"
            />
          </div>
          <div>
            <Label htmlFor="wt-desc">Description (optional)</Label>
            <Input
              id="wt-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Triggered when a new order is placed"
            />
          </div>
          {!isEdit && (
            <div>
              <Label>Auth Type</Label>
              <Select
                value={form.authType}
                onValueChange={(v) => setForm({ ...form, authType: v as "token" | "hmac_sha256" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="token">Bearer Token</SelectItem>
                  <SelectItem value="hmac_sha256">HMAC-SHA256</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="wt-secret">
              Auth Secret {isEdit && "(leave blank to keep current)"}
            </Label>
            <Input
              id="wt-secret"
              type="password"
              value={form.authSecret}
              onChange={(e) => setForm({ ...form, authSecret: e.target.value })}
              placeholder={isEdit ? "Enter new secret to rotate" : "Min 8 characters"}
            />
          </div>
          <div>
            <Label>Target Type</Label>
            <Select
              value={form.targetType}
              onValueChange={(v) => setForm({ ...form, targetType: v as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">Chat Conversation</SelectItem>
                <SelectItem value="agency">Agency</SelectItem>
                <SelectItem value="workflow">Workflow</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.targetType === "chat" && (
            <div>
              <Label htmlFor="wt-conv">Conversation ID</Label>
              <Input
                id="wt-conv"
                value={form.targetConversationId}
                onChange={(e) => setForm({ ...form, targetConversationId: e.target.value })}
                placeholder="123"
              />
            </div>
          )}
          <div>
            <Label htmlFor="wt-rl">Rate Limit (per minute)</Label>
            <Input
              id="wt-rl"
              type="number"
              min={1}
              max={1000}
              value={form.rateLimitPerMinute}
              onChange={(e) =>
                setForm({ ...form, rateLimitPerMinute: parseInt(e.target.value) || 10 })
              }
            />
          </div>
          <div>
            <Label htmlFor="wt-template">
              Payload Template (JSON, optional)
            </Label>
            <Textarea
              id="wt-template"
              value={form.payloadTemplate}
              onChange={(e) => setForm({ ...form, payloadTemplate: e.target.value })}
              placeholder='{"message": "New event: {{event.type}}"}'
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Allowed variables: {"{{event.type}}"} {"{{event.data}}"} {"{{trigger.name}}"}{" "}
              {"{{trigger.id}}"} {"{{timestamp}}"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {isEdit ? "Save Changes" : "Create Trigger"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Test Trigger Modal ─────────────────────────────────────────────────────────

function TestTriggerModal({
  trigger,
  onClose,
}: {
  trigger: TriggerRow;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [sampleJson, setSampleJson] = useState('{\n  "type": "test",\n  "message": "Hello from test"\n}');
  const [result, setResult] = useState<{ ok: boolean; dispatchedMessage?: string; detail?: string; executionId?: string } | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const testMut = trpc.webhookTriggers.testTrigger.useMutation({
    onSuccess: (data) => {
      setResult(data as any);
      toast({ title: "Test dispatched successfully" });
    },
    onError: (e) => {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    },
  });

  function handleTest() {
    setJsonError(null);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(sampleJson);
    } catch {
      setJsonError("Invalid JSON — please fix before sending.");
      return;
    }
    testMut.mutate({ triggerId: trigger.id, samplePayload: parsed });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            Test Trigger: {trigger.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="mb-1 block text-sm">Sample Payload (JSON)</Label>
            <Textarea
              rows={6}
              className="font-mono text-xs"
              value={sampleJson}
              onChange={(e) => setSampleJson(e.target.value)}
              placeholder='{ "type": "order.created", "orderId": "123" }'
            />
            {jsonError && <p className="text-xs text-destructive mt-1">{jsonError}</p>}
          </div>

          <p className="text-xs text-muted-foreground">
            This sends a test dispatch directly to the configured target. No credits are deducted
            and the invocation count is not incremented.
          </p>

          {result && (
            <div className="rounded border bg-muted/40 p-3 space-y-1">
              <p className="text-sm font-medium">{result.ok ? "✓ Dispatched" : "✗ Not dispatched"}</p>
              {result.executionId && (
                <p className="text-xs text-muted-foreground">Execution ID: {result.executionId}</p>
              )}
              {result.dispatchedMessage && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Dispatch message:</p>
                  <pre className="text-xs bg-background border rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap">
                    {result.dispatchedMessage}
                  </pre>
                </div>
              )}
              {result.detail && (
                <p className="text-xs text-muted-foreground">{result.detail}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleTest} disabled={testMut.isPending}>
            <FlaskConical className="h-4 w-4 mr-2" />
            {testMut.isPending ? "Sending…" : "Send Test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page component ────────────────────────────────────────────────────────

// ── Secret reveal dialog ────────────────────────────────────────────────────────

function SecretRevealDialog({
  secret,
  onClose,
}: {
  secret: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  return (
    <AlertDialog open onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>New Secret Generated</AlertDialogTitle>
          <AlertDialogDescription>
            Copy your new secret now — it will not be shown again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2 my-2">
          <Input readOnly value={secret} className="font-mono text-xs" />
          <Button
            size="icon"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(secret);
              toast({ title: "Secret copied!" });
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>Done</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Main page component ────────────────────────────────────────────────────────

export default function WebhookTriggers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTrigger, setEditTrigger] = useState<TriggerRow | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<TriggerRow | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [testTrigger, setTestTrigger] = useState<TriggerRow | null>(null);

  const triggersQuery = trpc.webhookTriggers.list.useQuery();
  const triggers = (triggersQuery.data ?? []) as TriggerRow[];

  // M3: Feature flag guard — list procedure returns FORBIDDEN if flag is disabled
  const featureDisabled =
    triggersQuery.error?.data?.code === "FORBIDDEN";

  const deleteMut = trpc.webhookTriggers.delete.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["webhookTriggers", "list"]] });
      toast({ title: "Trigger deleted" });
      setDeleteTarget(null);
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMut = trpc.webhookTriggers.update.useMutation({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [["webhookTriggers", "list"]] }),
  });

  const regenMut = trpc.webhookTriggers.regenerateSecret.useMutation({
    onSuccess: (data) => setNewSecret(data.newSecret),
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function toggleLogs(triggerId: string) {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      next.has(triggerId) ? next.delete(triggerId) : next.add(triggerId);
      return next;
    });
  }

  function openEdit(trigger: TriggerRow) {
    setEditTrigger(trigger);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditTrigger(null);
  }

  // M3: Feature flag placeholder
  if (featureDisabled) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <Lock className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Webhook Triggers not enabled</p>
          <p className="text-sm mt-1">
            This feature is not enabled for your account. Contact your administrator to enable it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Webhook Triggers</h1>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Trigger
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Inbound webhook triggers allow external services to send events into your conversations,
        agencies, or workflows via a dedicated HTTP endpoint.
      </p>

      {triggersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading triggers...</p>
      ) : triggers.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <Webhook className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No webhook triggers yet</p>
          <p className="text-sm mt-1">Create a trigger to receive events from external services.</p>
          <Button className="mt-4" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Trigger
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {triggers.map((trigger) => (
            <div key={trigger.id} className="border rounded-lg overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{trigger.name}</span>
                      <Badge variant="outline">{trigger.authType}</Badge>
                      <Badge variant="secondary">{trigger.targetType}</Badge>
                      {!trigger.isActive && <Badge variant="destructive">Inactive</Badge>}
                    </div>
                    {trigger.description && (
                      <p className="text-sm text-muted-foreground mt-1">{trigger.description}</p>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {trigger.totalTriggers ?? 0} invocations
                      {trigger.monthlyTriggerBudget != null &&
                        ` · Monthly: ${trigger.totalTriggers ?? 0}/${trigger.monthlyTriggerBudget}`}
                      {trigger.lastTriggeredAt &&
                        ` · Last: ${new Date(trigger.lastTriggeredAt as string).toLocaleString()}`}
                      {" · "}Rate limit: {trigger.rateLimitPerMinute ?? 10}/min
                    </div>
                    <WebhookUrlDisplay triggerId={trigger.id} />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={trigger.isActive ?? false}
                      onCheckedChange={(v) =>
                        toggleMut.mutate({ triggerId: trigger.id, isActive: v })
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Regenerate secret"
                      onClick={() => regenMut.mutate({ triggerId: trigger.id })}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Test trigger"
                      onClick={() => setTestTrigger(trigger)}
                    >
                      <FlaskConical className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(trigger)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {/* L1: Use AlertDialog instead of window.confirm() */}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteTarget(trigger)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Delivery logs accordion */}
              <div className="border-t">
                <button
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => toggleLogs(trigger.id)}
                >
                  {expandedLogs.has(trigger.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Delivery Logs
                </button>
                {expandedLogs.has(trigger.id) && (
                  <div className="px-4 pb-4">
                    <DeliveryLogs triggerId={trigger.id} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <TriggerFormDialog
          open={formOpen}
          onClose={closeForm}
          editTrigger={editTrigger}
        />
      )}

      {/* L1: AlertDialog for delete confirmation */}
      {deleteTarget && (
        <AlertDialog open onOpenChange={(v) => !v && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete trigger?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will
                deactivate the trigger and it will no longer accept webhook events.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMut.mutate({ triggerId: deleteTarget.id })}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* L2: Secret reveal modal with copyable input */}
      {newSecret && (
        <SecretRevealDialog secret={newSecret} onClose={() => setNewSecret(null)} />
      )}

      {/* Test Trigger modal */}
      {testTrigger && (
        <TestTriggerModal trigger={testTrigger} onClose={() => setTestTrigger(null)} />
      )}
    </div>
  );
}
