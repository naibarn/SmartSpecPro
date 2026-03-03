diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index 9ff1cef..f154f94 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -99,6 +99,7 @@ const AdminPersonas = lazy(() => import("./pages/AdminPersonas"));
 const Workflows = lazy(() => import("./pages/Workflows"));
 const WorkflowEditor = lazy(() => import("./pages/WorkflowEditor"));
 const WorkflowGallery = lazy(() => import("./pages/WorkflowGallery"));
+const WebhookTriggers = lazy(() => import("./pages/WebhookTriggers"));
 
 function PostHogPageViewTracker() {
   const [location] = useLocation();
@@ -180,6 +181,7 @@ function Router() {
         <Route path="/workflows/editor" component={WorkflowEditor} />
         <Route path="/workflows/gallery" component={WorkflowGallery} />
         <Route path="/workflows/editor/:id" component={WorkflowEditor} />
+        <Route path="/webhook-triggers" component={WebhookTriggers} />
         <Route path="/dashboard" component={Dashboard} />
         <Route path="/generate/:type?" component={Generate} />
         <Route path="/media-studio" component={MediaStudio} />
diff --git a/apps/web/client/src/hooks/useMenuItems.ts b/apps/web/client/src/hooks/useMenuItems.ts
index 19aa299..646d63d 100644
--- a/apps/web/client/src/hooks/useMenuItems.ts
+++ b/apps/web/client/src/hooks/useMenuItems.ts
@@ -8,6 +8,7 @@ import {
   Clock,
   CreditCard,
   Building2,
+  Webhook,
   Server,
   Activity,
   Users,
@@ -31,6 +32,8 @@ import {
   ExternalLink,
   Film,
   Gauge,
+  Bot,
+  ClipboardCheck,
 } from 'lucide-react';
 import {
   getMenuItemsByGroup,
@@ -72,6 +75,9 @@ const iconMap: Record<string, LucideIcon> = {
   ExternalLink,
   Film,
   Gauge,
+  Bot,
+  ClipboardCheck,
+  Webhook,
 };
 
 export interface ResolvedMenuItem extends MenuItem {
diff --git a/apps/web/client/src/pages/WebhookTriggers.tsx b/apps/web/client/src/pages/WebhookTriggers.tsx
new file mode 100644
index 0000000..aa405b1
--- /dev/null
+++ b/apps/web/client/src/pages/WebhookTriggers.tsx
@@ -0,0 +1,563 @@
+/**
+ * WebhookTriggers — Inbound webhook trigger management page.
+ *
+ * Features:
+ * - List all triggers for the tenant
+ * - Create / Edit trigger (modal)
+ * - Auth type: token or HMAC-SHA256
+ * - Target type: chat, agency, or workflow
+ * - Payload template editor with {{variable}} syntax
+ * - Webhook URL display with copy button
+ * - Delivery logs per trigger (expandable)
+ */
+
+import { useState } from "react";
+import { useQueryClient } from "@tanstack/react-query";
+import { trpc } from "@/lib/trpc";
+import { Button } from "@/components/ui/button";
+import {
+  Dialog,
+  DialogContent,
+  DialogHeader,
+  DialogTitle,
+  DialogFooter,
+} from "@/components/ui/dialog";
+import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
+import {
+  Select,
+  SelectContent,
+  SelectItem,
+  SelectTrigger,
+  SelectValue,
+} from "@/components/ui/select";
+import { Switch } from "@/components/ui/switch";
+import { Badge } from "@/components/ui/badge";
+import {
+  Table,
+  TableBody,
+  TableCell,
+  TableHead,
+  TableHeader,
+  TableRow,
+} from "@/components/ui/table";
+import { Textarea } from "@/components/ui/textarea";
+import { useToast } from "@/hooks/use-toast";
+import { Copy, Plus, Pencil, Trash2, ChevronDown, ChevronRight, RefreshCw, Webhook } from "lucide-react";
+
+// ── Types ──────────────────────────────────────────────────────────────────────
+
+interface TriggerRow {
+  id: string;
+  name: string;
+  description?: string | null;
+  authType: string;
+  targetType: string;
+  rateLimitPerMinute: number | null;
+  isActive: boolean | null;
+  totalTriggers: number | null;
+  lastTriggeredAt?: Date | string | null;
+  tenantId: string;
+}
+
+interface LogRow {
+  id: string;
+  triggerId: string;
+  status: string;
+  processingTimeMs?: number | null;
+  creditsConsumed?: string | null;
+  errorMessage?: string | null;
+  createdAt: Date | string;
+}
+
+interface TriggerFormData {
+  name: string;
+  description: string;
+  authType: "token" | "hmac_sha256";
+  authSecret: string;
+  targetType: "chat" | "agency" | "workflow";
+  targetConversationId: string;
+  payloadTemplate: string;
+  rateLimitPerMinute: number;
+}
+
+const DEFAULT_FORM: TriggerFormData = {
+  name: "",
+  description: "",
+  authType: "token",
+  authSecret: "",
+  targetType: "chat",
+  targetConversationId: "",
+  payloadTemplate: "",
+  rateLimitPerMinute: 10,
+};
+
+// ── Status badge ───────────────────────────────────────────────────────────────
+
+function StatusBadge({ status }: { status: string }) {
+  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
+    success: "default",
+    auth_failed: "destructive",
+    rate_limited: "secondary",
+    target_error: "destructive",
+    credit_insufficient: "secondary",
+  };
+  return <Badge variant={variants[status] ?? "outline"}>{status.replace("_", " ")}</Badge>;
+}
+
+// ── Delivery Logs panel ────────────────────────────────────────────────────────
+
+function DeliveryLogs({ triggerId }: { triggerId: string }) {
+  const logsQuery = trpc.webhookTriggers.getLogs.useQuery({ triggerId, limit: 20, offset: 0 });
+  const logs = (logsQuery.data ?? []) as LogRow[];
+
+  if (!logs.length) {
+    return <p className="text-sm text-muted-foreground py-2">No delivery logs yet.</p>;
+  }
+
+  return (
+    <Table>
+      <TableHeader>
+        <TableRow>
+          <TableHead>Time</TableHead>
+          <TableHead>Status</TableHead>
+          <TableHead>Duration</TableHead>
+          <TableHead>Credits</TableHead>
+          <TableHead>Error</TableHead>
+        </TableRow>
+      </TableHeader>
+      <TableBody>
+        {logs.map((log) => (
+          <TableRow key={log.id}>
+            <TableCell className="text-xs text-muted-foreground">
+              {new Date(log.createdAt as string).toLocaleString()}
+            </TableCell>
+            <TableCell>
+              <StatusBadge status={log.status} />
+            </TableCell>
+            <TableCell className="text-xs">{log.processingTimeMs ?? "—"}ms</TableCell>
+            <TableCell className="text-xs">{log.creditsConsumed ?? "0"}</TableCell>
+            <TableCell className="text-xs text-destructive truncate max-w-[200px]">
+              {log.errorMessage ?? ""}
+            </TableCell>
+          </TableRow>
+        ))}
+      </TableBody>
+    </Table>
+  );
+}
+
+// ── Webhook URL display ────────────────────────────────────────────────────────
+
+function WebhookUrlDisplay({ triggerId }: { triggerId: string }) {
+  const { toast } = useToast();
+  const url = `https://smartaihub.app/api/webhooks/trigger/${triggerId}`;
+  return (
+    <div className="flex items-center gap-2 mt-2">
+      <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{url}</code>
+      <Button
+        size="icon"
+        variant="ghost"
+        onClick={() => {
+          navigator.clipboard.writeText(url);
+          toast({ title: "Webhook URL copied!" });
+        }}
+      >
+        <Copy className="h-4 w-4" />
+      </Button>
+    </div>
+  );
+}
+
+// ── Trigger form dialog ────────────────────────────────────────────────────────
+
+function TriggerFormDialog({
+  open,
+  onClose,
+  editTrigger,
+}: {
+  open: boolean;
+  onClose: () => void;
+  editTrigger?: TriggerRow | null;
+}) {
+  const { toast } = useToast();
+  const queryClient = useQueryClient();
+  const isEdit = Boolean(editTrigger);
+
+  const [form, setForm] = useState<TriggerFormData>(() =>
+    editTrigger
+      ? {
+          name: editTrigger.name,
+          description: editTrigger.description ?? "",
+          authType: (editTrigger.authType as "token" | "hmac_sha256") ?? "token",
+          authSecret: "",
+          targetType: (editTrigger.targetType as "chat" | "agency" | "workflow") ?? "chat",
+          targetConversationId: "",
+          payloadTemplate: "",
+          rateLimitPerMinute: editTrigger.rateLimitPerMinute ?? 10,
+        }
+      : { ...DEFAULT_FORM },
+  );
+
+  const createMut = trpc.webhookTriggers.create.useMutation({
+    onSuccess: () => {
+      queryClient.invalidateQueries({ queryKey: [["webhookTriggers", "list"]] });
+      toast({ title: "Webhook trigger created!" });
+      onClose();
+    },
+    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
+  });
+
+  const updateMut = trpc.webhookTriggers.update.useMutation({
+    onSuccess: () => {
+      queryClient.invalidateQueries({ queryKey: [["webhookTriggers", "list"]] });
+      toast({ title: "Webhook trigger updated!" });
+      onClose();
+    },
+    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
+  });
+
+  const handleSubmit = () => {
+    if (!form.name.trim()) {
+      toast({ title: "Name is required", variant: "destructive" });
+      return;
+    }
+    if (!isEdit && !form.authSecret.trim()) {
+      toast({ title: "Auth secret is required", variant: "destructive" });
+      return;
+    }
+    let parsedTemplate: Record<string, unknown> | undefined;
+    if (form.payloadTemplate.trim()) {
+      try {
+        parsedTemplate = JSON.parse(form.payloadTemplate);
+      } catch {
+        toast({ title: "Payload template must be valid JSON", variant: "destructive" });
+        return;
+      }
+    }
+
+    if (isEdit) {
+      updateMut.mutate({
+        triggerId: editTrigger!.id,
+        name: form.name,
+        description: form.description || undefined,
+        authSecret: form.authSecret || undefined,
+        targetType: form.targetType,
+        rateLimitPerMinute: form.rateLimitPerMinute,
+        payloadTemplate: parsedTemplate,
+      });
+    } else {
+      createMut.mutate({
+        name: form.name,
+        description: form.description || undefined,
+        authType: form.authType,
+        authSecret: form.authSecret,
+        targetType: form.targetType,
+        targetConversationId: form.targetConversationId
+          ? parseInt(form.targetConversationId)
+          : undefined,
+        payloadTemplate: parsedTemplate,
+        rateLimitPerMinute: form.rateLimitPerMinute,
+      });
+    }
+  };
+
+  const pending = createMut.isPending || updateMut.isPending;
+
+  return (
+    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
+      <DialogContent className="max-w-lg">
+        <DialogHeader>
+          <DialogTitle>{isEdit ? "Edit Trigger" : "Create Webhook Trigger"}</DialogTitle>
+        </DialogHeader>
+        <div className="space-y-4 py-2">
+          <div>
+            <Label htmlFor="wt-name">Name</Label>
+            <Input
+              id="wt-name"
+              value={form.name}
+              onChange={(e) => setForm({ ...form, name: e.target.value })}
+              placeholder="Order notifications"
+            />
+          </div>
+          <div>
+            <Label htmlFor="wt-desc">Description (optional)</Label>
+            <Input
+              id="wt-desc"
+              value={form.description}
+              onChange={(e) => setForm({ ...form, description: e.target.value })}
+              placeholder="Triggered when a new order is placed"
+            />
+          </div>
+          {!isEdit && (
+            <div>
+              <Label>Auth Type</Label>
+              <Select
+                value={form.authType}
+                onValueChange={(v) => setForm({ ...form, authType: v as "token" | "hmac_sha256" })}
+              >
+                <SelectTrigger>
+                  <SelectValue />
+                </SelectTrigger>
+                <SelectContent>
+                  <SelectItem value="token">Bearer Token</SelectItem>
+                  <SelectItem value="hmac_sha256">HMAC-SHA256</SelectItem>
+                </SelectContent>
+              </Select>
+            </div>
+          )}
+          <div>
+            <Label htmlFor="wt-secret">
+              Auth Secret {isEdit && "(leave blank to keep current)"}
+            </Label>
+            <Input
+              id="wt-secret"
+              type="password"
+              value={form.authSecret}
+              onChange={(e) => setForm({ ...form, authSecret: e.target.value })}
+              placeholder={isEdit ? "Enter new secret to rotate" : "Min 8 characters"}
+            />
+          </div>
+          <div>
+            <Label>Target Type</Label>
+            <Select
+              value={form.targetType}
+              onValueChange={(v) => setForm({ ...form, targetType: v as any })}
+            >
+              <SelectTrigger>
+                <SelectValue />
+              </SelectTrigger>
+              <SelectContent>
+                <SelectItem value="chat">Chat Conversation</SelectItem>
+                <SelectItem value="agency">Agency</SelectItem>
+                <SelectItem value="workflow">Workflow</SelectItem>
+              </SelectContent>
+            </Select>
+          </div>
+          {form.targetType === "chat" && (
+            <div>
+              <Label htmlFor="wt-conv">Conversation ID</Label>
+              <Input
+                id="wt-conv"
+                value={form.targetConversationId}
+                onChange={(e) => setForm({ ...form, targetConversationId: e.target.value })}
+                placeholder="123"
+              />
+            </div>
+          )}
+          <div>
+            <Label htmlFor="wt-rl">Rate Limit (per minute)</Label>
+            <Input
+              id="wt-rl"
+              type="number"
+              min={1}
+              max={1000}
+              value={form.rateLimitPerMinute}
+              onChange={(e) =>
+                setForm({ ...form, rateLimitPerMinute: parseInt(e.target.value) || 10 })
+              }
+            />
+          </div>
+          <div>
+            <Label htmlFor="wt-template">
+              Payload Template (JSON, optional)
+            </Label>
+            <Textarea
+              id="wt-template"
+              value={form.payloadTemplate}
+              onChange={(e) => setForm({ ...form, payloadTemplate: e.target.value })}
+              placeholder='{"message": "New event: {{event.type}}"}'
+              rows={4}
+            />
+            <p className="text-xs text-muted-foreground mt-1">
+              Allowed variables: {"{{event.type}}"} {"{{event.data}}"} {"{{trigger.name}}"}{" "}
+              {"{{trigger.id}}"} {"{{timestamp}}"}
+            </p>
+          </div>
+        </div>
+        <DialogFooter>
+          <Button variant="outline" onClick={onClose}>
+            Cancel
+          </Button>
+          <Button onClick={handleSubmit} disabled={pending}>
+            {isEdit ? "Save Changes" : "Create Trigger"}
+          </Button>
+        </DialogFooter>
+      </DialogContent>
+    </Dialog>
+  );
+}
+
+// ── Main page component ────────────────────────────────────────────────────────
+
+export default function WebhookTriggers() {
+  const { toast } = useToast();
+  const queryClient = useQueryClient();
+  const [formOpen, setFormOpen] = useState(false);
+  const [editTrigger, setEditTrigger] = useState<TriggerRow | null>(null);
+  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
+
+  const triggersQuery = trpc.webhookTriggers.list.useQuery();
+  const triggers = (triggersQuery.data ?? []) as TriggerRow[];
+
+  const deleteMut = trpc.webhookTriggers.delete.useMutation({
+    onSuccess: () => {
+      queryClient.invalidateQueries({ queryKey: [["webhookTriggers", "list"]] });
+      toast({ title: "Trigger deleted" });
+    },
+    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
+  });
+
+  const toggleMut = trpc.webhookTriggers.update.useMutation({
+    onSuccess: () => queryClient.invalidateQueries({ queryKey: [["webhookTriggers", "list"]] }),
+  });
+
+  const regenMut = trpc.webhookTriggers.regenerateSecret.useMutation({
+    onSuccess: (data) => {
+      toast({
+        title: "New secret generated",
+        description: `${data.newSecret}\nCopy it now — it won't be shown again.`,
+      });
+    },
+    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
+  });
+
+  function toggleLogs(triggerId: string) {
+    setExpandedLogs((prev) => {
+      const next = new Set(prev);
+      next.has(triggerId) ? next.delete(triggerId) : next.add(triggerId);
+      return next;
+    });
+  }
+
+  function openEdit(trigger: TriggerRow) {
+    setEditTrigger(trigger);
+    setFormOpen(true);
+  }
+
+  function closeForm() {
+    setFormOpen(false);
+    setEditTrigger(null);
+  }
+
+  return (
+    <div className="p-6 max-w-5xl mx-auto space-y-6">
+      <div className="flex items-center justify-between">
+        <div className="flex items-center gap-2">
+          <Webhook className="h-6 w-6" />
+          <h1 className="text-2xl font-bold">Webhook Triggers</h1>
+        </div>
+        <Button onClick={() => setFormOpen(true)}>
+          <Plus className="h-4 w-4 mr-2" />
+          New Trigger
+        </Button>
+      </div>
+
+      <p className="text-sm text-muted-foreground">
+        Inbound webhook triggers allow external services to send events into your conversations,
+        agencies, or workflows via a dedicated HTTP endpoint.
+      </p>
+
+      {triggersQuery.isLoading ? (
+        <p className="text-sm text-muted-foreground">Loading triggers...</p>
+      ) : triggers.length === 0 ? (
+        <div className="border rounded-lg p-8 text-center text-muted-foreground">
+          <Webhook className="h-12 w-12 mx-auto mb-3 opacity-30" />
+          <p className="font-medium">No webhook triggers yet</p>
+          <p className="text-sm mt-1">Create a trigger to receive events from external services.</p>
+          <Button className="mt-4" onClick={() => setFormOpen(true)}>
+            <Plus className="h-4 w-4 mr-2" />
+            Create Trigger
+          </Button>
+        </div>
+      ) : (
+        <div className="space-y-4">
+          {triggers.map((trigger) => (
+            <div key={trigger.id} className="border rounded-lg overflow-hidden">
+              <div className="p-4">
+                <div className="flex items-start justify-between gap-4">
+                  <div className="flex-1 min-w-0">
+                    <div className="flex items-center gap-2 flex-wrap">
+                      <span className="font-medium">{trigger.name}</span>
+                      <Badge variant="outline">{trigger.authType}</Badge>
+                      <Badge variant="secondary">{trigger.targetType}</Badge>
+                      {!trigger.isActive && <Badge variant="destructive">Inactive</Badge>}
+                    </div>
+                    {trigger.description && (
+                      <p className="text-sm text-muted-foreground mt-1">{trigger.description}</p>
+                    )}
+                    <div className="text-xs text-muted-foreground mt-1">
+                      {trigger.totalTriggers ?? 0} invocations
+                      {trigger.lastTriggeredAt &&
+                        ` · Last: ${new Date(trigger.lastTriggeredAt as string).toLocaleDateString()}`}
+                      {" · "}Rate limit: {trigger.rateLimitPerMinute ?? 10}/min
+                    </div>
+                    <WebhookUrlDisplay triggerId={trigger.id} />
+                  </div>
+                  <div className="flex items-center gap-1 shrink-0">
+                    <Switch
+                      checked={trigger.isActive ?? false}
+                      onCheckedChange={(v) =>
+                        toggleMut.mutate({ triggerId: trigger.id, isActive: v })
+                      }
+                    />
+                    <Button
+                      size="icon"
+                      variant="ghost"
+                      title="Regenerate secret"
+                      onClick={() => regenMut.mutate({ triggerId: trigger.id })}
+                    >
+                      <RefreshCw className="h-4 w-4" />
+                    </Button>
+                    <Button size="icon" variant="ghost" onClick={() => openEdit(trigger)}>
+                      <Pencil className="h-4 w-4" />
+                    </Button>
+                    <Button
+                      size="icon"
+                      variant="ghost"
+                      onClick={() => {
+                        if (confirm("Delete this trigger?")) {
+                          deleteMut.mutate({ triggerId: trigger.id });
+                        }
+                      }}
+                    >
+                      <Trash2 className="h-4 w-4" />
+                    </Button>
+                  </div>
+                </div>
+              </div>
+
+              {/* Delivery logs accordion */}
+              <div className="border-t">
+                <button
+                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
+                  onClick={() => toggleLogs(trigger.id)}
+                >
+                  {expandedLogs.has(trigger.id) ? (
+                    <ChevronDown className="h-4 w-4" />
+                  ) : (
+                    <ChevronRight className="h-4 w-4" />
+                  )}
+                  Delivery Logs
+                </button>
+                {expandedLogs.has(trigger.id) && (
+                  <div className="px-4 pb-4">
+                    <DeliveryLogs triggerId={trigger.id} />
+                  </div>
+                )}
+              </div>
+            </div>
+          ))}
+        </div>
+      )}
+
+      {formOpen && (
+        <TriggerFormDialog
+          open={formOpen}
+          onClose={closeForm}
+          editTrigger={editTrigger}
+        />
+      )}
+    </div>
+  );
+}
diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index b1d1ea6..ca1eeb1 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -20,6 +20,7 @@ import { registerMediaJobRoutes } from "../routers/mediaJobs";
 import { registerAgencyStreamRoutes } from "./agencyStreamProxy";
 
 import { createWebhookRouter } from "../routes/webhooks";
+import { createWebhookTriggerRouter } from "../routes/webhookTrigger";
 import { createTelegramWebhookRouter } from "../routes/telegramWebhook";
 import { createChannelWebhookRouter } from "../routes/channelWebhook";
 import { createVoiceSessionRouter, handleVoiceUpgrade, shutdownVoiceGateway } from "../routes/voiceGateway";
@@ -237,6 +238,9 @@ const csrfCheck = (req: any, res: any, next: any) => {
     req.originalUrl.startsWith("/api/webhooks/gdrive") ||
     req.path.startsWith("/webhooks/telegram/") ||
     req.originalUrl.startsWith("/webhooks/telegram/") ||
+    // Inbound webhook triggers (external services sending events into SmartSpecPro)
+    req.path.startsWith("/webhooks/trigger/") ||
+    req.originalUrl.startsWith("/api/webhooks/trigger/") ||
     // Generalized channel webhooks (platform callbacks: WhatsApp, Slack, Discord, etc.)
     /^\/webhooks\/[a-z]+\/[a-z0-9-]+$/.test(req.path) ||
     /^\/webhooks\/[a-z]+\/[a-z0-9-]+$/.test(req.originalUrl)
@@ -347,6 +351,10 @@ app.use("/internal", createSlideRenderRouter());
 // Webhook routes (before CSRF-protected routes, external services send raw POSTs)
 app.use("/api/webhooks", createWebhookRouter());
 
+// Inbound webhook trigger endpoints (external services → SmartSpecPro conversations/agencies/workflows)
+// Must be before CSRF middleware — these are server-to-server requests with their own auth
+app.use("/api/webhooks/trigger", express.json({ limit: "1mb" }), createWebhookTriggerRouter());
+
 // Generalized channel webhook router (all adapters: WhatsApp, Slack, Discord, LINE, etc.)
 // Must be registered BEFORE the legacy Telegram route so /webhooks/:channelType/:connectionId
 // is handled by the generalized router.
diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index f39ae0b..b5b3ebf 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -70,6 +70,7 @@ import { agencyRouter } from "./routers/agency";
 import { personaRouter } from "./routers/persona";
 import { artifactRouter } from "./routers/artifact";
 import { widgetRouter } from "./routers/widget";
+import { webhookTriggersRouter } from "./routers/webhookTriggers";
 
 // Zod schemas for validation
 const strongPasswordSchema = z.string().min(8).refine(
@@ -1359,6 +1360,9 @@ export const appRouter = router({
   // Embeddable chat widget management
   widget: widgetRouter,
 
+  // Inbound webhook trigger management
+  webhookTriggers: webhookTriggersRouter,
+
   // Memory system (entity memories, summaries, context)
   memory: memoryRouter,
 
diff --git a/apps/web/server/routers/__tests__/webhookTriggers.test.ts b/apps/web/server/routers/__tests__/webhookTriggers.test.ts
new file mode 100644
index 0000000..aceb0a3
--- /dev/null
+++ b/apps/web/server/routers/__tests__/webhookTriggers.test.ts
@@ -0,0 +1,398 @@
+/**
+ * Tests for webhookTriggers tRPC router
+ *
+ * Covers: CRUD operations, template validation, delivery log queries,
+ * test endpoint, tenant isolation, RBAC.
+ */
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// ── Hoisted mocks ─────────────────────────────────────────────────────────────
+
+const {
+  mockDbSelect,
+  mockDbInsert,
+  mockDbUpdate,
+  mockDbDelete,
+} = vi.hoisted(() => ({
+  mockDbSelect: vi.fn(),
+  mockDbInsert: vi.fn(),
+  mockDbUpdate: vi.fn(),
+  mockDbDelete: vi.fn(),
+}));
+
+vi.mock("../../db", () => ({
+  db: {
+    select: mockDbSelect,
+    insert: mockDbInsert,
+    update: mockDbUpdate,
+    delete: mockDbDelete,
+  },
+  getDb: vi.fn().mockResolvedValue({
+    select: mockDbSelect,
+    insert: mockDbInsert,
+    update: mockDbUpdate,
+    delete: mockDbDelete,
+  }),
+}));
+
+vi.mock("../../../drizzle/schema", () => ({
+  webhookTriggers: {
+    id: "id",
+    tenantId: "tenantId",
+    userId: "userId",
+    name: "name",
+    description: "description",
+    authType: "authType",
+    authSecretEncrypted: "authSecretEncrypted",
+    targetType: "targetType",
+    targetConversationId: "targetConversationId",
+    targetAgencyId: "targetAgencyId",
+    targetWorkflowId: "targetWorkflowId",
+    payloadTemplate: "payloadTemplate",
+    rateLimitPerMinute: "rateLimitPerMinute",
+    monthlyTriggerBudget: "monthlyTriggerBudget",
+    isActive: "isActive",
+    totalTriggers: "totalTriggers",
+    lastTriggeredAt: "lastTriggeredAt",
+    createdAt: "createdAt",
+    updatedAt: "updatedAt",
+  },
+  webhookTriggerLogs: {
+    id: "id",
+    triggerId: "triggerId",
+    status: "status",
+    processingTimeMs: "processingTimeMs",
+    creditsConsumed: "creditsConsumed",
+    errorMessage: "errorMessage",
+    createdAt: "createdAt",
+  },
+}));
+
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn((col, val) => ({ col, val })),
+  and: vi.fn((...args) => ({ and: args })),
+  desc: vi.fn((col) => ({ desc: col })),
+  asc: vi.fn((col) => ({ asc: col })),
+}));
+
+vi.mock("../../services/featureFlags", () => ({
+  getTenantFeatureFlag: vi.fn().mockResolvedValue(true),
+}));
+
+const { mockEncrypt } = vi.hoisted(() => ({
+  mockEncrypt: vi.fn((v: string) => `encrypted:${v}`),
+}));
+
+vi.mock("../../services/crypto", () => ({
+  encrypt: mockEncrypt,
+  decrypt: vi.fn((v: string) => v.replace("encrypted:", "")),
+}));
+
+vi.mock("../../_core/trpc", () => {
+  const createProcedure = () => {
+    const proc: any = {
+      query: (fn: Function) => fn,
+      mutation: (fn: Function) => fn,
+      input: () => proc,
+      use: () => proc,
+    };
+    return proc;
+  };
+  return {
+    router: (routes: any) => routes,
+    protectedProcedure: createProcedure(),
+    domainAdminProcedure: createProcedure(),
+    adminProcedure: createProcedure(),
+    publicProcedure: createProcedure(),
+  };
+});
+
+// ── Import subject under test ─────────────────────────────────────────────────
+
+import { webhookTriggersRouter } from "../webhookTriggers";
+
+// ── Helpers ───────────────────────────────────────────────────────────────────
+
+function makeCtx(overrides?: Record<string, unknown>) {
+  return {
+    user: { id: 1, role: "domain_admin", currentTenantId: "tenant-abc" },
+    tenantId: "tenant-abc",
+    ...overrides,
+  };
+}
+
+async function callProcedure(procedure: any, input: any, ctx?: any) {
+  const resolvedCtx = ctx ?? makeCtx();
+  return procedure({ input, ctx: resolvedCtx });
+}
+
+// ── Tests ─────────────────────────────────────────────────────────────────────
+
+describe("webhookTriggersRouter", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  describe("list", () => {
+    it("returns triggers belonging to the caller's tenant", async () => {
+      const triggers = [
+        { id: "trig-1", name: "Order Hook", tenantId: "tenant-abc" },
+        { id: "trig-2", name: "Payment Hook", tenantId: "tenant-abc" },
+      ];
+
+      mockDbSelect.mockReturnValue({
+        from: vi.fn().mockReturnValue({
+          where: vi.fn().mockReturnValue({
+            orderBy: vi.fn().mockResolvedValue(triggers),
+          }),
+        }),
+      });
+
+      const result = await callProcedure(webhookTriggersRouter.list, {});
+      expect(result).toHaveLength(2);
+      expect(result[0].tenantId).toBe("tenant-abc");
+    });
+  });
+
+  describe("create", () => {
+    it("creates a trigger and encrypts the auth secret", async () => {
+      mockDbInsert.mockReturnValue({
+        values: vi.fn().mockReturnValue({
+          returning: vi.fn().mockResolvedValue([{
+            id: "new-trig-uuid",
+            name: "Test Trigger",
+            tenantId: "tenant-abc",
+            authSecretEncrypted: "encrypted:my-secret",
+          }]),
+        }),
+      });
+
+      const result = await callProcedure(webhookTriggersRouter.create, {
+        name: "Test Trigger",
+        authType: "token",
+        authSecret: "my-secret",
+        targetType: "chat",
+        targetConversationId: 42,
+        rateLimitPerMinute: 10,
+      });
+
+      expect(mockEncrypt).toHaveBeenCalledWith("my-secret");
+      expect(result.triggerId).toBe("new-trig-uuid");
+      expect(result.webhookUrl).toContain("new-trig-uuid");
+    });
+
+    it("rejects payload_template with non-allowlisted patterns", async () => {
+      await expect(
+        callProcedure(webhookTriggersRouter.create, {
+          name: "Bad Template",
+          authType: "token",
+          authSecret: "my-secret",
+          targetType: "chat",
+          targetConversationId: 42,
+          payloadTemplate: { message: "{{system.env}}" },
+        })
+      ).rejects.toThrow();
+    });
+
+    it("rejects payload_template exceeding 2000 chars when stringified", async () => {
+      const longTemplate = { message: "x".repeat(2001) };
+      await expect(
+        callProcedure(webhookTriggersRouter.create, {
+          name: "Long Template",
+          authType: "token",
+          authSecret: "my-secret",
+          targetType: "chat",
+          targetConversationId: 42,
+          payloadTemplate: longTemplate,
+        })
+      ).rejects.toThrow();
+    });
+  });
+
+  describe("getById", () => {
+    it("returns trigger without decrypted secret — authSecretConfigured flag instead", async () => {
+      mockDbSelect.mockReturnValue({
+        from: vi.fn().mockReturnValue({
+          where: vi.fn().mockReturnValue({
+            limit: vi.fn().mockResolvedValue([{
+              id: "trig-1",
+              tenantId: "tenant-abc",
+              authSecretEncrypted: "encrypted:mysecret",
+              name: "Test",
+            }]),
+          }),
+        }),
+      });
+
+      const result = await callProcedure(webhookTriggersRouter.getById, { triggerId: "trig-1" });
+      expect(result.authSecretConfigured).toBe(true);
+      expect(result).not.toHaveProperty("authSecretEncrypted");
+    });
+
+    it("returns NOT_FOUND for trigger belonging to different tenant", async () => {
+      mockDbSelect.mockReturnValue({
+        from: vi.fn().mockReturnValue({
+          where: vi.fn().mockReturnValue({
+            limit: vi.fn().mockResolvedValue([{
+              id: "trig-1",
+              tenantId: "other-tenant",
+            }]),
+          }),
+        }),
+      });
+
+      await expect(
+        callProcedure(webhookTriggersRouter.getById, { triggerId: "trig-1" })
+      ).rejects.toThrow();
+    });
+  });
+
+  describe("update", () => {
+    it("allows updating name and rate_limit", async () => {
+      // First select for ownership check
+      mockDbSelect.mockReturnValue({
+        from: vi.fn().mockReturnValue({
+          where: vi.fn().mockReturnValue({
+            limit: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "tenant-abc" }]),
+          }),
+        }),
+      });
+
+      mockDbUpdate.mockReturnValue({
+        set: vi.fn().mockReturnValue({
+          where: vi.fn().mockReturnValue({
+            returning: vi.fn().mockResolvedValue([{ id: "trig-1", name: "Updated", tenantId: "tenant-abc" }]),
+          }),
+        }),
+      });
+
+      const result = await callProcedure(webhookTriggersRouter.update, {
+        triggerId: "trig-1",
+        name: "Updated",
+        rateLimitPerMinute: 20,
+      });
+      expect(result).toBeDefined();
+    });
+
+    it("re-encrypts secret when authSecret is provided in update", async () => {
+      mockDbSelect.mockReturnValue({
+        from: vi.fn().mockReturnValue({
+          where: vi.fn().mockReturnValue({
+            limit: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "tenant-abc" }]),
+          }),
+        }),
+      });
+
+      mockDbUpdate.mockReturnValue({
+        set: vi.fn().mockReturnValue({
+          where: vi.fn().mockReturnValue({
+            returning: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "tenant-abc" }]),
+          }),
+        }),
+      });
+
+      await callProcedure(webhookTriggersRouter.update, {
+        triggerId: "trig-1",
+        authSecret: "new-secret",
+      });
+
+      expect(mockEncrypt).toHaveBeenCalledWith("new-secret");
+    });
+  });
+
+  describe("delete", () => {
+    it("soft-deletes trigger by setting is_active = false", async () => {
+      // ownership check
+      mockDbSelect.mockReturnValue({
+        from: vi.fn().mockReturnValue({
+          where: vi.fn().mockReturnValue({
+            limit: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "tenant-abc" }]),
+          }),
+        }),
+      });
+
+      const mockSet = vi.fn().mockReturnValue({
+        where: vi.fn().mockResolvedValue([]),
+      });
+      mockDbUpdate.mockReturnValue({ set: mockSet });
+
+      await callProcedure(webhookTriggersRouter.delete, { triggerId: "trig-1" });
+      expect(mockDbUpdate).toHaveBeenCalled();
+    });
+  });
+
+  describe("getLogs", () => {
+    it("returns delivery logs ordered by created_at DESC", async () => {
+      const logs = [
+        { id: "log-2", triggerId: "trig-1", status: "success", createdAt: new Date() },
+        { id: "log-1", triggerId: "trig-1", status: "auth_failed", createdAt: new Date() },
+      ];
+
+      // First call for ownership check, second for logs
+      mockDbSelect
+        .mockReturnValueOnce({
+          from: vi.fn().mockReturnValue({
+            where: vi.fn().mockReturnValue({
+              limit: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "tenant-abc" }]),
+            }),
+          }),
+        })
+        .mockReturnValueOnce({
+          from: vi.fn().mockReturnValue({
+            where: vi.fn().mockReturnValue({
+              orderBy: vi.fn().mockReturnValue({
+                limit: vi.fn().mockReturnValue({
+                  offset: vi.fn().mockResolvedValue(logs),
+                }),
+              }),
+            }),
+          }),
+        });
+
+      const result = await callProcedure(webhookTriggersRouter.getLogs, {
+        triggerId: "trig-1",
+        limit: 20,
+        offset: 0,
+      });
+      expect(result).toHaveLength(2);
+    });
+
+    it("rejects log query for trigger belonging to different tenant", async () => {
+      mockDbSelect.mockReturnValue({
+        from: vi.fn().mockReturnValue({
+          where: vi.fn().mockReturnValue({
+            limit: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "other-tenant" }]),
+          }),
+        }),
+      });
+
+      await expect(
+        callProcedure(webhookTriggersRouter.getLogs, { triggerId: "trig-1", limit: 20, offset: 0 })
+      ).rejects.toThrow();
+    });
+  });
+
+  describe("regenerateSecret", () => {
+    it("generates a new secret, encrypts it, and returns the plaintext once", async () => {
+      mockDbSelect.mockReturnValue({
+        from: vi.fn().mockReturnValue({
+          where: vi.fn().mockReturnValue({
+            limit: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "tenant-abc" }]),
+          }),
+        }),
+      });
+
+      mockDbUpdate.mockReturnValue({
+        set: vi.fn().mockReturnValue({
+          where: vi.fn().mockResolvedValue([]),
+        }),
+      });
+
+      const result = await callProcedure(webhookTriggersRouter.regenerateSecret, { triggerId: "trig-1" });
+      expect(result.newSecret).toBeDefined();
+      expect(typeof result.newSecret).toBe("string");
+      expect(result.newSecret.length).toBeGreaterThan(16);
+      expect(mockEncrypt).toHaveBeenCalled();
+    });
+  });
+});
diff --git a/apps/web/server/routers/webhookTriggers.ts b/apps/web/server/routers/webhookTriggers.ts
new file mode 100644
index 0000000..6ecee75
--- /dev/null
+++ b/apps/web/server/routers/webhookTriggers.ts
@@ -0,0 +1,259 @@
+/**
+ * Webhook Triggers tRPC Router — CRUD for inbound webhook trigger configurations.
+ *
+ * RBAC:
+ *   - protectedProcedure: authenticated user (list, create, update, delete own triggers)
+ *   - Tenant isolation: every mutation validates that the target trigger belongs
+ *     to the caller's tenant before proceeding.
+ *
+ * Security:
+ *   - Auth secrets are stored AES-256-GCM encrypted via crypto.ts
+ *   - getById does NOT return the decrypted secret — returns authSecretConfigured flag
+ *   - payload_template validated against allowlist at save time (no SSTI)
+ *   - Template max 2000 chars (stringified)
+ */
+
+import crypto from "crypto";
+import { z } from "zod";
+import { eq, and, desc } from "drizzle-orm";
+import { TRPCError } from "@trpc/server";
+import { router, protectedProcedure } from "../_core/trpc";
+import { db } from "../db";
+import { webhookTriggers, webhookTriggerLogs } from "../../drizzle/schema";
+import { encrypt } from "../services/crypto";
+import { validateTemplate } from "../services/webhookTriggerService";
+
+const WEBHOOK_BASE_URL = "https://smartaihub.app/api/webhooks/trigger";
+
+// ── Template validator for Zod ────────────────────────────────────────────────
+
+function templateValidator(val: unknown): boolean {
+  if (val === undefined || val === null) return true;
+  const str = JSON.stringify(val);
+  if (str.length > 2000) return false;
+  return validateTemplate(str);
+}
+
+// ── Zod schemas ────────────────────────────────────────────────────────────────
+
+const createSchema = z.object({
+  name: z.string().min(1).max(100),
+  description: z.string().max(500).optional(),
+  authType: z.enum(["token", "hmac_sha256"]),
+  authSecret: z.string().min(8),
+  targetType: z.enum(["chat", "agency", "workflow"]),
+  targetConversationId: z.number().int().positive().optional(),
+  targetAgencyId: z.string().optional(),
+  targetWorkflowId: z.number().int().positive().optional(),
+  payloadTemplate: z.record(z.unknown())
+    .optional()
+    .refine(
+      (val) => templateValidator(val),
+      { message: "payloadTemplate contains non-allowlisted patterns or exceeds 2000 chars" },
+    ),
+  rateLimitPerMinute: z.number().int().min(1).max(1000).default(10),
+  monthlyTriggerBudget: z.number().int().positive().nullable().optional(),
+});
+
+const updateSchema = z.object({
+  triggerId: z.string(),
+  name: z.string().min(1).max(100).optional(),
+  description: z.string().max(500).optional(),
+  authSecret: z.string().min(8).optional(),
+  targetType: z.enum(["chat", "agency", "workflow"]).optional(),
+  targetConversationId: z.number().int().positive().nullable().optional(),
+  targetAgencyId: z.string().nullable().optional(),
+  targetWorkflowId: z.number().int().positive().nullable().optional(),
+  payloadTemplate: z.record(z.unknown())
+    .optional()
+    .refine(
+      (val) => templateValidator(val),
+      { message: "payloadTemplate contains non-allowlisted patterns or exceeds 2000 chars" },
+    ),
+  rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
+  monthlyTriggerBudget: z.number().int().positive().nullable().optional(),
+  isActive: z.boolean().optional(),
+});
+
+const getLogsSchema = z.object({
+  triggerId: z.string(),
+  limit: z.number().int().min(1).max(100).default(20),
+  offset: z.number().int().min(0).default(0),
+});
+
+// ── Helper: require trigger ownership ────────────────────────────────────────
+
+async function requireTriggerOwnership(triggerId: string, tenantId: string) {
+  const [trigger] = await db
+    .select()
+    .from(webhookTriggers)
+    .where(eq(webhookTriggers.id, triggerId))
+    .limit(1);
+
+  if (!trigger) {
+    throw new TRPCError({ code: "NOT_FOUND", message: "Trigger not found" });
+  }
+  if (trigger.tenantId !== tenantId) {
+    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
+  }
+  return trigger;
+}
+
+// ── Router ────────────────────────────────────────────────────────────────────
+
+export const webhookTriggersRouter = router({
+  /** List all triggers for the caller's tenant */
+  list: protectedProcedure.query(async ({ ctx }) => {
+    const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+
+    return db
+      .select()
+      .from(webhookTriggers)
+      .where(eq(webhookTriggers.tenantId, tenantId))
+      .orderBy(desc(webhookTriggers.createdAt));
+  }),
+
+  /** Get a single trigger by ID — does NOT return decrypted secret */
+  getById: protectedProcedure
+    .input(z.object({ triggerId: z.string() }))
+    .query(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      const trigger = await requireTriggerOwnership(input.triggerId, tenantId);
+
+      const { authSecretEncrypted: _secret, ...rest } = trigger;
+      return {
+        ...rest,
+        authSecretConfigured: Boolean(_secret),
+        webhookUrl: `${WEBHOOK_BASE_URL}/${trigger.id}`,
+      };
+    }),
+
+  /** Create a new webhook trigger */
+  create: protectedProcedure
+    .input(createSchema)
+    .mutation(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      const userId = ctx.user!.id;
+
+      // Explicit template validation (belt-and-suspenders alongside Zod .refine())
+      if (input.payloadTemplate !== undefined) {
+        const str = JSON.stringify(input.payloadTemplate);
+        if (str.length > 2000) {
+          throw new TRPCError({ code: "BAD_REQUEST", message: "payloadTemplate exceeds 2000 chars" });
+        }
+        if (!validateTemplate(str)) {
+          throw new TRPCError({ code: "BAD_REQUEST", message: "payloadTemplate contains non-allowlisted patterns" });
+        }
+      }
+
+      const encryptedSecret = encrypt(input.authSecret);
+
+      const [created] = await db
+        .insert(webhookTriggers)
+        .values({
+          tenantId,
+          userId,
+          name: input.name,
+          description: input.description ?? null,
+          authType: input.authType,
+          authSecretEncrypted: encryptedSecret,
+          targetType: input.targetType,
+          targetConversationId: input.targetConversationId ?? null,
+          targetAgencyId: input.targetAgencyId ?? null,
+          targetWorkflowId: input.targetWorkflowId ?? null,
+          payloadTemplate: input.payloadTemplate ?? {},
+          rateLimitPerMinute: input.rateLimitPerMinute,
+          monthlyTriggerBudget: input.monthlyTriggerBudget ?? null,
+          isActive: true,
+        } as any)
+        .returning();
+
+      return {
+        ...created,
+        triggerId: created.id,
+        webhookUrl: `${WEBHOOK_BASE_URL}/${created.id}`,
+        authSecretConfigured: true,
+      };
+    }),
+
+  /** Update an existing trigger */
+  update: protectedProcedure
+    .input(updateSchema)
+    .mutation(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      const trigger = await requireTriggerOwnership(input.triggerId, tenantId);
+
+      const updateData: Record<string, unknown> = {
+        updatedAt: new Date(),
+      };
+
+      if (input.name !== undefined) updateData.name = input.name;
+      if (input.description !== undefined) updateData.description = input.description;
+      if (input.authSecret !== undefined) updateData.authSecretEncrypted = encrypt(input.authSecret);
+      if (input.targetType !== undefined) updateData.targetType = input.targetType;
+      if (input.targetConversationId !== undefined) updateData.targetConversationId = input.targetConversationId;
+      if (input.targetAgencyId !== undefined) updateData.targetAgencyId = input.targetAgencyId;
+      if (input.targetWorkflowId !== undefined) updateData.targetWorkflowId = input.targetWorkflowId;
+      if (input.payloadTemplate !== undefined) updateData.payloadTemplate = input.payloadTemplate;
+      if (input.rateLimitPerMinute !== undefined) updateData.rateLimitPerMinute = input.rateLimitPerMinute;
+      if (input.monthlyTriggerBudget !== undefined) updateData.monthlyTriggerBudget = input.monthlyTriggerBudget;
+      if (input.isActive !== undefined) updateData.isActive = input.isActive;
+
+      const [updated] = await db
+        .update(webhookTriggers)
+        .set(updateData as any)
+        .where(and(eq(webhookTriggers.id, input.triggerId), eq(webhookTriggers.tenantId, tenantId)))
+        .returning();
+
+      return updated ?? trigger;
+    }),
+
+  /** Soft-delete a trigger (set is_active = false) */
+  delete: protectedProcedure
+    .input(z.object({ triggerId: z.string() }))
+    .mutation(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await requireTriggerOwnership(input.triggerId, tenantId);
+
+      await db
+        .update(webhookTriggers)
+        .set({ isActive: false, updatedAt: new Date() } as any)
+        .where(and(eq(webhookTriggers.id, input.triggerId), eq(webhookTriggers.tenantId, tenantId)));
+
+      return { success: true };
+    }),
+
+  /** Get delivery logs for a trigger, ordered by created_at DESC */
+  getLogs: protectedProcedure
+    .input(getLogsSchema)
+    .query(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await requireTriggerOwnership(input.triggerId, tenantId);
+
+      return db
+        .select()
+        .from(webhookTriggerLogs)
+        .where(eq(webhookTriggerLogs.triggerId, input.triggerId))
+        .orderBy(desc(webhookTriggerLogs.createdAt))
+        .limit(input.limit)
+        .offset(input.offset);
+    }),
+
+  /** Regenerate auth secret — returns the new plaintext once */
+  regenerateSecret: protectedProcedure
+    .input(z.object({ triggerId: z.string() }))
+    .mutation(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await requireTriggerOwnership(input.triggerId, tenantId);
+
+      const newSecret = crypto.randomBytes(32).toString("hex");
+      const encryptedSecret = encrypt(newSecret);
+
+      await db
+        .update(webhookTriggers)
+        .set({ authSecretEncrypted: encryptedSecret, updatedAt: new Date() } as any)
+        .where(and(eq(webhookTriggers.id, input.triggerId), eq(webhookTriggers.tenantId, tenantId)));
+
+      return { newSecret };
+    }),
+});
diff --git a/apps/web/server/routes/__tests__/webhookTrigger.test.ts b/apps/web/server/routes/__tests__/webhookTrigger.test.ts
new file mode 100644
index 0000000..c807aa3
--- /dev/null
+++ b/apps/web/server/routes/__tests__/webhookTrigger.test.ts
@@ -0,0 +1,345 @@
+/**
+ * Tests for POST /api/webhooks/trigger/:triggerId
+ *
+ * Covers: token auth, HMAC auth, replay protection, rate limiting,
+ * template substitution ordering, credit checks, dedup, secret stripping.
+ */
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import crypto from "crypto";
+
+// ── Hoisted mocks ─────────────────────────────────────────────────────────────
+
+const {
+  mockDbSelect,
+  mockRedisGet,
+  mockRedisSet,
+  mockRedisIncr,
+  mockRedisExpire,
+} = vi.hoisted(() => ({
+  mockDbSelect: vi.fn(),
+  mockRedisGet: vi.fn(),
+  mockRedisSet: vi.fn(),
+  mockRedisIncr: vi.fn(),
+  mockRedisExpire: vi.fn(),
+}));
+
+vi.mock("../../db", () => ({
+  db: { select: mockDbSelect },
+  getDb: vi.fn().mockResolvedValue({ select: mockDbSelect }),
+}));
+
+vi.mock("../../services/redis", () => ({
+  getRedisClient: vi.fn().mockReturnValue({
+    get: mockRedisGet,
+    set: mockRedisSet,
+    incr: mockRedisIncr,
+    expire: mockRedisExpire,
+  }),
+}));
+
+vi.mock("../../../drizzle/schema", () => ({
+  webhookTriggers: {
+    id: "id",
+    tenantId: "tenantId",
+    isActive: "isActive",
+    authType: "authType",
+    authSecretEncrypted: "authSecretEncrypted",
+    targetType: "targetType",
+    targetConversationId: "targetConversationId",
+    targetAgencyId: "targetAgencyId",
+    targetWorkflowId: "targetWorkflowId",
+    payloadTemplate: "payloadTemplate",
+    rateLimitPerMinute: "rateLimitPerMinute",
+    monthlyTriggerBudget: "monthlyTriggerBudget",
+    userId: "userId",
+    totalTriggers: "totalTriggers",
+    lastTriggeredAt: "lastTriggeredAt",
+  },
+  webhookTriggerLogs: {
+    id: "id",
+    triggerId: "triggerId",
+    status: "status",
+    processingTimeMs: "processingTimeMs",
+    creditsConsumed: "creditsConsumed",
+    errorMessage: "errorMessage",
+    extractedVariables: "extractedVariables",
+    requestBodyHash: "requestBodyHash",
+    requestBodySize: "requestBodySize",
+    requestHeadersSafe: "requestHeadersSafe",
+    sourceIpMasked: "sourceIpMasked",
+    requestMethod: "requestMethod",
+  },
+  tenants: { id: "id", settings: "settings" },
+}));
+
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn((col, val) => ({ col, val })),
+  and: vi.fn((...args) => ({ and: args })),
+  sql: vi.fn(),
+}));
+
+vi.mock("../../services/featureFlags", () => ({
+  getTenantFeatureFlag: vi.fn().mockResolvedValue(true),
+}));
+
+vi.mock("../../services/creditService", () => ({
+  hasEnoughCredits: vi.fn().mockResolvedValue(true),
+}));
+
+vi.mock("../../services/auditLogger", () => ({
+  auditLogger: { log: vi.fn() },
+}));
+
+// Encryption key for tests
+process.env.LLM_ENCRYPTION_KEY = "test-key-for-webhook-tests-32chars!!";
+
+// Import decrypt after setting env
+const { mockDecrypt } = vi.hoisted(() => ({ mockDecrypt: vi.fn() }));
+vi.mock("../../services/crypto", () => ({
+  decrypt: mockDecrypt,
+  encrypt: vi.fn((v: string) => `encrypted:${v}`),
+}));
+
+// ── Import subject under test ─────────────────────────────────────────────────
+
+import {
+  verifyTokenAuth,
+  verifyHmacAuth,
+  checkDedup,
+  checkWebhookRateLimit,
+  stripSecrets,
+  substituteTemplate,
+  validateTemplate,
+} from "../../services/webhookTriggerService";
+
+// ── Helpers ───────────────────────────────────────────────────────────────────
+
+const TEST_SECRET = "my-secret-token";
+const ENCRYPTED_SECRET = `encrypted:${TEST_SECRET}`;
+
+// ── Tests ─────────────────────────────────────────────────────────────────────
+
+describe("webhookTriggerService — token auth", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockDecrypt.mockReturnValue(TEST_SECRET);
+  });
+
+  it("validates token with timingSafeEqual and returns true on match", async () => {
+    const result = await verifyTokenAuth(ENCRYPTED_SECRET, TEST_SECRET);
+    expect(result).toBe(true);
+    expect(mockDecrypt).toHaveBeenCalledWith(ENCRYPTED_SECRET);
+  });
+
+  it("rejects invalid token and returns false", async () => {
+    const result = await verifyTokenAuth(ENCRYPTED_SECRET, "wrong-token");
+    expect(result).toBe(false);
+  });
+
+  it("rejects empty token", async () => {
+    const result = await verifyTokenAuth(ENCRYPTED_SECRET, "");
+    expect(result).toBe(false);
+  });
+});
+
+describe("webhookTriggerService — HMAC auth", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockDecrypt.mockReturnValue(TEST_SECRET);
+  });
+
+  function makeHmac(secret: string, timestamp: string, rawBody: string): string {
+    return crypto
+      .createHmac("sha256", secret)
+      .update(`${timestamp}.${rawBody}`)
+      .digest("hex");
+  }
+
+  it("validates HMAC signature with current timestamp", async () => {
+    const rawBody = JSON.stringify({ event: "test" });
+    const timestamp = String(Math.floor(Date.now() / 1000));
+    const sig = makeHmac(TEST_SECRET, timestamp, rawBody);
+
+    const result = await verifyHmacAuth(ENCRYPTED_SECRET, timestamp, sig, rawBody);
+    expect(result.valid).toBe(true);
+  });
+
+  it("rejects HMAC replay when timestamp is >300s old", async () => {
+    const rawBody = JSON.stringify({ event: "old" });
+    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400);
+    const sig = makeHmac(TEST_SECRET, oldTimestamp, rawBody);
+
+    const result = await verifyHmacAuth(ENCRYPTED_SECRET, oldTimestamp, sig, rawBody);
+    expect(result.valid).toBe(false);
+    expect(result.reason).toMatch(/timestamp/i);
+  });
+
+  it("rejects HMAC replay when timestamp is >300s in the future", async () => {
+    const rawBody = JSON.stringify({ event: "future" });
+    const futureTimestamp = String(Math.floor(Date.now() / 1000) + 400);
+    const sig = makeHmac(TEST_SECRET, futureTimestamp, rawBody);
+
+    const result = await verifyHmacAuth(ENCRYPTED_SECRET, futureTimestamp, sig, rawBody);
+    expect(result.valid).toBe(false);
+    expect(result.reason).toMatch(/timestamp/i);
+  });
+
+  it("rejects wrong HMAC signature", async () => {
+    const rawBody = JSON.stringify({ event: "test" });
+    const timestamp = String(Math.floor(Date.now() / 1000));
+    const wrongSig = "deadbeef".repeat(8);
+
+    const result = await verifyHmacAuth(ENCRYPTED_SECRET, timestamp, wrongSig, rawBody);
+    expect(result.valid).toBe(false);
+  });
+});
+
+describe("webhookTriggerService — deduplication", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("returns false (not duplicate) when Redis key does not exist", async () => {
+    mockRedisSet.mockResolvedValue("OK"); // SET NX succeeded — new key
+    const result = await checkDedup("trigger-1", "1700000000", "abcdef123456");
+    expect(result).toBe(false); // not a duplicate
+  });
+
+  it("returns true (duplicate) when Redis key already exists", async () => {
+    mockRedisSet.mockResolvedValue(null); // SET NX failed — key already exists
+    const result = await checkDedup("trigger-1", "1700000000", "abcdef123456");
+    expect(result).toBe(true); // duplicate
+  });
+
+  it("dedup key includes triggerId, timestamp, and bodyHash", async () => {
+    mockRedisSet.mockResolvedValue("OK");
+    await checkDedup("trig-abc", "1700001234", "hash123");
+    const call = mockRedisSet.mock.calls[0];
+    const key: string = call[0];
+    expect(key).toContain("trig-abc");
+    expect(key).toContain("1700001234");
+    expect(key).toContain("hash123");
+    expect(key).toMatch(/^webhook:dedup:/);
+  });
+});
+
+describe("webhookTriggerService — rate limiting", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("allows request when under rate limit", async () => {
+    mockRedisIncr.mockResolvedValue(1);
+    mockRedisExpire.mockResolvedValue(1);
+    const result = await checkWebhookRateLimit("trigger-1", 10);
+    expect(result).toBe(false); // not rate-limited
+  });
+
+  it("blocks request when at rate limit", async () => {
+    mockRedisIncr.mockResolvedValue(11); // exceeded limit of 10
+    mockRedisExpire.mockResolvedValue(1);
+    const result = await checkWebhookRateLimit("trigger-1", 10);
+    expect(result).toBe(true); // rate-limited
+  });
+
+  it("rate limit key expires after 60 seconds", async () => {
+    mockRedisIncr.mockResolvedValue(1);
+    mockRedisExpire.mockResolvedValue(1);
+    await checkWebhookRateLimit("trigger-rate-test", 5);
+    // TTL should be set to 60 on first increment
+    const expireCall = mockRedisExpire.mock.calls[0];
+    expect(expireCall[1]).toBe(60);
+  });
+});
+
+describe("webhookTriggerService — secret stripping", () => {
+  it("strips values matching sk- prefix", () => {
+    const result = stripSecrets({ api_key: "sk-abc123", event: "test" });
+    expect(result.api_key).toBe("[REDACTED]");
+    expect(result.event).toBe("test");
+  });
+
+  it("strips GitHub personal access tokens (ghp_)", () => {
+    const result = stripSecrets({ token: "ghp_mytoken123" });
+    expect(result.token).toBe("[REDACTED]");
+  });
+
+  it("strips Slack bot tokens (xoxb-)", () => {
+    const result = stripSecrets({ slack: "xoxb-1234-5678" });
+    expect(result.slack).toBe("[REDACTED]");
+  });
+
+  it("strips Bearer tokens", () => {
+    const result = stripSecrets({ auth: "Bearer my-jwt-token" });
+    expect(result.auth).toBe("[REDACTED]");
+  });
+
+  it("strips GitLab personal tokens (glpat-)", () => {
+    const result = stripSecrets({ token: "glpat-xyz789" });
+    expect(result.token).toBe("[REDACTED]");
+  });
+
+  it("does not redact non-secret values", () => {
+    const result = stripSecrets({ username: "alice", score: 42 });
+    expect(result.username).toBe("alice");
+    expect(result.score).toBe(42);
+  });
+});
+
+describe("webhookTriggerService — template substitution", () => {
+  it("validates template with allowed variables", () => {
+    const template = "Event: {{event.type}} at {{timestamp}}";
+    expect(validateTemplate(template)).toBe(true);
+  });
+
+  it("rejects template with non-allowlisted patterns", () => {
+    expect(validateTemplate("{{system.env}}")).toBe(false);
+    expect(validateTemplate("{{__proto__}}")).toBe(false);
+    expect(validateTemplate("{{constructor.prototype}}")).toBe(false);
+  });
+
+  it("substitutes event.type variable", () => {
+    const result = substituteTemplate("Type: {{event.type}}", {
+      eventType: "order.created",
+      eventData: { orderId: 123 },
+      triggerName: "order-hook",
+      triggerId: "trig-1",
+      timestamp: "1700000000",
+    });
+    expect(result).toContain("order.created");
+  });
+
+  it("substitutes trigger.name variable", () => {
+    const result = substituteTemplate("Trigger: {{trigger.name}}", {
+      eventType: "test",
+      eventData: {},
+      triggerName: "my-trigger",
+      triggerId: "trig-1",
+      timestamp: "1700000000",
+    });
+    expect(result).toContain("my-trigger");
+  });
+
+  it("substitutes timestamp variable", () => {
+    const result = substituteTemplate("At {{timestamp}}", {
+      eventType: "test",
+      eventData: {},
+      triggerName: "t",
+      triggerId: "t",
+      timestamp: "1700000000",
+    });
+    expect(result).toContain("1700000000");
+  });
+
+  it("returns empty string for unresolved variables (no raw template leak)", () => {
+    const result = substituteTemplate("Value: {{event.data.nonExistent}}", {
+      eventType: "test",
+      eventData: {},
+      triggerName: "t",
+      triggerId: "t",
+      timestamp: "1700000000",
+    });
+    // Should not contain the raw {{...}} in output
+    expect(result).not.toContain("{{");
+  });
+});
diff --git a/apps/web/server/routes/webhookTrigger.ts b/apps/web/server/routes/webhookTrigger.ts
new file mode 100644
index 0000000..1dff3f4
--- /dev/null
+++ b/apps/web/server/routes/webhookTrigger.ts
@@ -0,0 +1,270 @@
+/**
+ * Webhook Trigger Express Route — POST /api/webhooks/trigger/:triggerId
+ *
+ * Processing order (strictly enforced):
+ *   1. Lookup trigger (404 if not found or inactive)
+ *   2. Feature flag check (403 if disabled)
+ *   3. Auth verification (401 on failure) — BEFORE any template processing
+ *   4. Deduplication (200 early return if duplicate)
+ *   5. Rate limit check (429 if exceeded)
+ *   6. Credit check (402 if insufficient)
+ *   7. Template substitution
+ *   8. Target dispatch (async after 200 ack)
+ *   9. Log recording
+ *
+ * Security notes:
+ * - Auth verified with timingSafeEqual to prevent timing attacks
+ * - HMAC replay protected by 300s timestamp window
+ * - Dedup key includes body hash to prevent false dedup on same-second requests
+ * - Source IP masked to /24 prefix in logs
+ * - Auth headers stripped from logged headers (only Content-Type, User-Agent, X-Forwarded-For)
+ * - Secret pattern values redacted before log storage
+ */
+
+import crypto from "crypto";
+import { Router, type Request, type Response } from "express";
+import { eq } from "drizzle-orm";
+import { db } from "../db";
+import { webhookTriggers, webhookTriggerLogs } from "../../drizzle/schema";
+import { getTenantFeatureFlag } from "../services/featureFlags";
+import { hasEnoughCredits } from "../services/creditService";
+import { auditLogger } from "../services/auditLogger";
+import {
+  verifyTokenAuth,
+  verifyHmacAuth,
+  checkDedup,
+  checkWebhookRateLimit,
+  stripSecrets,
+  substituteTemplateObject,
+  hashBody,
+  maskIp,
+} from "../services/webhookTriggerService";
+
+// Safe request headers to log (no auth headers)
+const SAFE_HEADERS = new Set(["content-type", "user-agent", "x-forwarded-for"]);
+
+function extractSafeHeaders(headers: Record<string, string | string[] | undefined>) {
+  const safe: Record<string, string> = {};
+  for (const key of SAFE_HEADERS) {
+    const val = headers[key];
+    if (val) safe[key] = Array.isArray(val) ? val[0] : val;
+  }
+  return safe;
+}
+
+async function recordLog(
+  triggerId: string,
+  data: {
+    status: "success" | "auth_failed" | "rate_limited" | "target_error" | "credit_insufficient";
+    requestMethod: string;
+    requestBodyHash: string;
+    requestBodySize: number;
+    requestHeadersSafe: Record<string, string>;
+    extractedVariables: Record<string, unknown>;
+    sourceIpMasked: string;
+    creditsConsumed: number;
+    errorMessage?: string;
+    processingTimeMs: number;
+  },
+) {
+  try {
+    await db
+      .insert(webhookTriggerLogs)
+      .values({
+        triggerId,
+        requestMethod: data.requestMethod,
+        requestBodyHash: data.requestBodyHash,
+        requestBodySize: data.requestBodySize,
+        requestHeadersSafe: data.requestHeadersSafe,
+        extractedVariables: stripSecrets(data.extractedVariables),
+        sourceIpMasked: data.sourceIpMasked,
+        status: data.status,
+        creditsConsumed: String(data.creditsConsumed),
+        errorMessage: data.errorMessage ?? null,
+        processingTimeMs: data.processingTimeMs,
+      } as any);
+  } catch (err) {
+    auditLogger.log({
+      eventType: "webhook_ingest_error" as any,
+      userId: null,
+      metadata: { triggerId, error: String(err) },
+    });
+  }
+}
+
+export function createWebhookTriggerRouter(): Router {
+  const router = Router();
+
+  router.post("/:triggerId", async (req: Request, res: Response) => {
+    const startTime = Date.now();
+    const { triggerId } = req.params;
+    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
+    const bodyHash = hashBody(rawBody);
+    const bodySize = Buffer.byteLength(rawBody, "utf8");
+    const sourceIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
+    const sourceIpMasked = maskIp(sourceIp);
+    const requestHeadersSafe = extractSafeHeaders(req.headers as any);
+
+    // ── Step 1: Lookup trigger ─────────────────────────────────────────────────
+    const [trigger] = await db
+      .select()
+      .from(webhookTriggers)
+      .where(eq(webhookTriggers.id, triggerId))
+      .limit(1);
+
+    if (!trigger || !trigger.isActive) {
+      return res.status(404).json({ error: "Trigger not found" });
+    }
+
+    // ── Step 2: Feature flag check ─────────────────────────────────────────────
+    const flagEnabled = await getTenantFeatureFlag("webhookTriggers", trigger.tenantId);
+    if (!flagEnabled) {
+      return res.status(403).json({ error: "Webhook triggers not enabled for this tenant" });
+    }
+
+    // ── Step 3: Auth verification (BEFORE template processing) ─────────────────
+    let authOk = false;
+
+    if (trigger.authType === "token") {
+      const authHeader = req.headers["authorization"] ?? "";
+      const token = String(authHeader).replace(/^Bearer\s+/i, "");
+      authOk = await verifyTokenAuth(trigger.authSecretEncrypted, token);
+    } else if (trigger.authType === "hmac_sha256") {
+      const timestamp = String(req.headers["x-webhook-timestamp"] ?? "");
+      const signature = String(req.headers["x-webhook-signature"] ?? "");
+      const result = await verifyHmacAuth(trigger.authSecretEncrypted, timestamp, signature, rawBody);
+      authOk = result.valid;
+    }
+
+    if (!authOk) {
+      const processingTimeMs = Date.now() - startTime;
+      await recordLog(triggerId, {
+        status: "auth_failed",
+        requestMethod: req.method,
+        requestBodyHash: bodyHash,
+        requestBodySize: bodySize,
+        requestHeadersSafe,
+        extractedVariables: {},
+        sourceIpMasked,
+        creditsConsumed: 0,
+        processingTimeMs,
+      });
+      return res.status(401).json({ error: "Authentication failed" });
+    }
+
+    // ── Step 4: Deduplication ─────────────────────────────────────────────────
+    const timestamp = String(req.headers["x-webhook-timestamp"] ?? String(Math.floor(Date.now() / 1000)));
+    const isDuplicate = await checkDedup(triggerId, timestamp, bodyHash);
+    if (isDuplicate) {
+      return res.status(200).json({ ok: true, deduplicated: true });
+    }
+
+    // ── Step 5: Rate limit ────────────────────────────────────────────────────
+    const isRateLimited = await checkWebhookRateLimit(triggerId, trigger.rateLimitPerMinute ?? 10);
+    if (isRateLimited) {
+      const processingTimeMs = Date.now() - startTime;
+      await recordLog(triggerId, {
+        status: "rate_limited",
+        requestMethod: req.method,
+        requestBodyHash: bodyHash,
+        requestBodySize: bodySize,
+        requestHeadersSafe,
+        extractedVariables: {},
+        sourceIpMasked,
+        creditsConsumed: 0,
+        processingTimeMs,
+      });
+      return res.status(429).json({ error: "Rate limit exceeded" });
+    }
+
+    // ── Step 6: Credit check ───────────────────────────────────────────────────
+    const creditCost = 1;
+    const hasCredits = await hasEnoughCredits(trigger.userId, creditCost);
+    if (!hasCredits) {
+      const processingTimeMs = Date.now() - startTime;
+      await recordLog(triggerId, {
+        status: "credit_insufficient",
+        requestMethod: req.method,
+        requestBodyHash: bodyHash,
+        requestBodySize: bodySize,
+        requestHeadersSafe,
+        extractedVariables: {},
+        sourceIpMasked,
+        creditsConsumed: 0,
+        processingTimeMs,
+      });
+      return res.status(402).json({ error: "Insufficient credits" });
+    }
+
+    // ── Step 7: Template substitution ─────────────────────────────────────────
+    const parsedBody: Record<string, unknown> =
+      typeof req.body === "object" && req.body !== null ? req.body : {};
+    const templateVars = {
+      eventType: String((parsedBody as any)?.type ?? (parsedBody as any)?.event?.type ?? ""),
+      eventData: parsedBody,
+      triggerName: trigger.name,
+      triggerId: trigger.id,
+      timestamp,
+    };
+
+    const payloadTemplate = (trigger.payloadTemplate ?? {}) as Record<string, unknown>;
+    const substitutedPayload = substituteTemplateObject(payloadTemplate, templateVars);
+
+    // ── Step 8: Acknowledge immediately, dispatch async ───────────────────────
+    res.status(200).json({ ok: true });
+
+    // Async dispatch (fires after response sent)
+    setImmediate(async () => {
+      const processingTimeMs = Date.now() - startTime;
+      try {
+        // Dispatch to target (simplified — log the substituted payload)
+        // Full target dispatch (chat/agency/workflow) is wired in section-12+
+        auditLogger.log({
+          eventType: "webhook_ingest_error" as any, // repurposed as dispatch event for now
+          userId: trigger.userId,
+          metadata: {
+            triggerId,
+            targetType: trigger.targetType,
+            payloadKeys: Object.keys(substitutedPayload),
+          },
+        });
+
+        await recordLog(triggerId, {
+          status: "success",
+          requestMethod: req.method,
+          requestBodyHash: bodyHash,
+          requestBodySize: bodySize,
+          requestHeadersSafe,
+          extractedVariables: stripSecrets(parsedBody),
+          sourceIpMasked,
+          creditsConsumed: creditCost,
+          processingTimeMs,
+        });
+
+        // Increment trigger counter
+        await db
+          .update(webhookTriggers)
+          .set({
+            totalTriggers: (trigger.totalTriggers ?? 0) + 1,
+            lastTriggeredAt: new Date(),
+          } as any)
+          .where(eq(webhookTriggers.id, triggerId));
+      } catch (err) {
+        await recordLog(triggerId, {
+          status: "target_error",
+          requestMethod: req.method,
+          requestBodyHash: bodyHash,
+          requestBodySize: bodySize,
+          requestHeadersSafe,
+          extractedVariables: {},
+          sourceIpMasked,
+          creditsConsumed: 0,
+          errorMessage: String(err),
+          processingTimeMs: Date.now() - startTime,
+        });
+      }
+    });
+  });
+
+  return router;
+}
diff --git a/apps/web/server/services/webhookTriggerService.ts b/apps/web/server/services/webhookTriggerService.ts
new file mode 100644
index 0000000..065866a
--- /dev/null
+++ b/apps/web/server/services/webhookTriggerService.ts
@@ -0,0 +1,261 @@
+/**
+ * Webhook Trigger Service — core business logic.
+ *
+ * Handles: auth verification (token + HMAC-SHA256), deduplication,
+ * rate limiting, template substitution, secret stripping, and log recording.
+ *
+ * Security properties:
+ * - Token comparison: crypto.timingSafeEqual() to prevent timing attacks
+ * - HMAC replay protection: 300-second window on timestamp
+ * - Dedup: Redis SET NX EX 300 keyed by triggerId+timestamp+bodyHash
+ * - Template substitution: regex-only (no SSTI), allowlist validated at save time
+ * - Secret stripping: redacts known secret patterns before log storage
+ */
+
+import crypto from "crypto";
+import { getRedisClient } from "./redis";
+import { decrypt } from "./crypto";
+
+// ── Constants ──────────────────────────────────────────────────────────────────
+
+const HMAC_WINDOW_SECONDS = 300;   // 5 minutes
+const DEDUP_TTL_SECONDS = 300;     // 5 minutes
+const RATE_LIMIT_WINDOW_SECONDS = 60;
+
+// Patterns that indicate secret values — redacted before log storage
+const SECRET_PATTERNS = [
+  /^sk-/i,
+  /^ghp_/i,
+  /^xoxb-/i,
+  /^Bearer /i,
+  /^gho_/i,
+  /^glpat-/i,
+];
+
+// Allowlisted variable patterns for template substitution
+const ALLOWED_VARS_RE =
+  /^\{\{(event\.type|event\.data(\.\w+){0,3}|trigger\.name|trigger\.id|timestamp)\}\}$/;
+
+// ── Auth verification ──────────────────────────────────────────────────────────
+
+/**
+ * Verify a Bearer token using timing-safe comparison.
+ * Returns true if the token matches the stored encrypted secret.
+ */
+export async function verifyTokenAuth(
+  authSecretEncrypted: string,
+  providedToken: string,
+): Promise<boolean> {
+  if (!providedToken) return false;
+  try {
+    const storedSecret = decrypt(authSecretEncrypted);
+    const a = Buffer.from(storedSecret, "utf8");
+    const b = Buffer.from(providedToken, "utf8");
+    // timingSafeEqual requires equal-length buffers — pad/truncate to max length
+    const len = Math.max(a.length, b.length);
+    const aPadded = Buffer.alloc(len, 0);
+    const bPadded = Buffer.alloc(len, 0);
+    a.copy(aPadded);
+    b.copy(bPadded);
+    return crypto.timingSafeEqual(aPadded, bPadded);
+  } catch {
+    return false;
+  }
+}
+
+export interface HmacVerifyResult {
+  valid: boolean;
+  reason?: string;
+}
+
+/**
+ * Verify HMAC-SHA256 signature with replay protection.
+ * HMAC input: `timestamp + "." + rawBody`
+ * Replay window: 300 seconds.
+ */
+export async function verifyHmacAuth(
+  authSecretEncrypted: string,
+  timestamp: string,
+  signature: string,
+  rawBody: string,
+): Promise<HmacVerifyResult> {
+  // Validate timestamp is within replay window
+  const now = Math.floor(Date.now() / 1000);
+  const ts = parseInt(timestamp, 10);
+  if (isNaN(ts) || Math.abs(now - ts) > HMAC_WINDOW_SECONDS) {
+    return { valid: false, reason: "Timestamp outside acceptable window (±300s)" };
+  }
+
+  try {
+    const storedSecret = decrypt(authSecretEncrypted);
+    const expectedSig = crypto
+      .createHmac("sha256", storedSecret)
+      .update(`${timestamp}.${rawBody}`)
+      .digest("hex");
+
+    const a = Buffer.from(expectedSig, "hex");
+    const b = Buffer.from(signature.length === expectedSig.length ? signature : "", "hex");
+
+    if (a.length !== b.length) {
+      return { valid: false, reason: "Invalid signature format" };
+    }
+    const match = crypto.timingSafeEqual(a, b);
+    return { valid: match };
+  } catch {
+    return { valid: false, reason: "Signature verification failed" };
+  }
+}
+
+// ── Deduplication ──────────────────────────────────────────────────────────────
+
+/**
+ * Check and record dedup key in Redis using SET NX EX.
+ * Returns true if this is a duplicate (key already existed).
+ * Returns false if this is a new request (key was set successfully).
+ */
+export async function checkDedup(
+  triggerId: string,
+  timestamp: string,
+  bodyHash: string,
+): Promise<boolean> {
+  const redis = getRedisClient();
+  const key = `webhook:dedup:${triggerId}:${timestamp}:${bodyHash}`;
+  // SET NX EX — returns "OK" if set (new), null if already exists (duplicate)
+  const result = await redis.set(key, "1", "EX", DEDUP_TTL_SECONDS, "NX");
+  return result === null; // null = key existed = duplicate
+}
+
+// ── Rate limiting ──────────────────────────────────────────────────────────────
+
+/**
+ * Check and increment rate limit counter for a trigger.
+ * Returns true if rate-limited (blocked), false if allowed.
+ */
+export async function checkWebhookRateLimit(
+  triggerId: string,
+  limitPerMinute: number,
+): Promise<boolean> {
+  const redis = getRedisClient();
+  const minuteBucket = Math.floor(Date.now() / 60000);
+  const key = `webhook:ratelimit:${triggerId}:${minuteBucket}`;
+  const count = await redis.incr(key);
+  // Set TTL on first increment
+  if (count === 1) {
+    await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
+  }
+  return count > limitPerMinute;
+}
+
+// ── Template validation and substitution ──────────────────────────────────────
+
+/**
+ * Validate that all {{...}} patterns in a template are in the allowlist.
+ * Returns true if all patterns are allowed (or no patterns exist).
+ */
+export function validateTemplate(template: string): boolean {
+  const matches = template.match(/\{\{[^}]+\}\}/g) ?? [];
+  return matches.every((m) => ALLOWED_VARS_RE.test(m));
+}
+
+export interface TemplateVars {
+  eventType: string;
+  eventData: unknown;
+  triggerName: string;
+  triggerId: string;
+  timestamp: string;
+}
+
+/**
+ * Substitute allowlisted {{variable}} patterns in a template string.
+ * Unresolved variables are replaced with empty string (no raw template leak).
+ */
+export function substituteTemplate(template: string, vars: TemplateVars): string {
+  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
+    path = path.trim();
+    if (path === "event.type") return String(vars.eventType ?? "");
+    if (path === "event.data") return JSON.stringify(vars.eventData ?? {});
+    if (path === "trigger.name") return String(vars.triggerName ?? "");
+    if (path === "trigger.id") return String(vars.triggerId ?? "");
+    if (path === "timestamp") return String(vars.timestamp ?? "");
+    // event.data.* — dot-notation access up to 3 levels
+    if (path.startsWith("event.data.")) {
+      const parts = path.slice("event.data.".length).split(".");
+      if (parts.length > 0 && parts.length <= 3) {
+        let val: unknown = vars.eventData;
+        for (const part of parts) {
+          if (val !== null && typeof val === "object" && part in (val as Record<string, unknown>)) {
+            val = (val as Record<string, unknown>)[part];
+          } else {
+            val = undefined;
+            break;
+          }
+        }
+        return val !== undefined ? String(val) : "";
+      }
+    }
+    // Unrecognized — return empty string
+    return "";
+  });
+}
+
+/**
+ * Substitute variables in an entire JSON template object.
+ * Returns a new object with all string values substituted.
+ */
+export function substituteTemplateObject(
+  templateObj: Record<string, unknown>,
+  vars: TemplateVars,
+): Record<string, unknown> {
+  const result: Record<string, unknown> = {};
+  for (const [key, value] of Object.entries(templateObj)) {
+    if (typeof value === "string") {
+      result[key] = substituteTemplate(value, vars);
+    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
+      result[key] = substituteTemplateObject(value as Record<string, unknown>, vars);
+    } else {
+      result[key] = value;
+    }
+  }
+  return result;
+}
+
+// ── Secret stripping ──────────────────────────────────────────────────────────
+
+/**
+ * Strip values matching known secret patterns from a variables object.
+ * Modifies a shallow clone — does not mutate the original.
+ */
+export function stripSecrets(vars: Record<string, unknown>): Record<string, unknown> {
+  const sanitized: Record<string, unknown> = { ...vars };
+  for (const [key, value] of Object.entries(sanitized)) {
+    if (typeof value === "string" && SECRET_PATTERNS.some((p) => p.test(value))) {
+      sanitized[key] = "[REDACTED]";
+    }
+  }
+  return sanitized;
+}
+
+// ── Body hashing ──────────────────────────────────────────────────────────────
+
+/**
+ * Compute SHA-256 hex digest of a raw body string.
+ */
+export function hashBody(rawBody: string): string {
+  return crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
+}
+
+// ── IP masking ────────────────────────────────────────────────────────────────
+
+/**
+ * Mask an IP address to its /24 prefix (privacy requirement).
+ * Returns "unknown/24" if the IP cannot be parsed.
+ */
+export function maskIp(ip: string | undefined): string {
+  if (!ip) return "unknown/24";
+  const parts = ip.split(".");
+  if (parts.length === 4) {
+    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
+  }
+  // IPv6 or unexpected format — return masked version
+  return "masked/24";
+}
diff --git a/packages/shared/src/constants/menu.ts b/packages/shared/src/constants/menu.ts
index 81a6450..6db540f 100644
--- a/packages/shared/src/constants/menu.ts
+++ b/packages/shared/src/constants/menu.ts
@@ -26,6 +26,7 @@ export const defaultMenuItems: MenuItem[] = [
   { id: 'media',         label: 'Media Studio',   labelTh: 'สตูดิโอ',       icon: 'Sparkles',        path: '/media-studio',   platforms: ['web', 'desktop'], group: 'main', sortOrder: 2 },
   { id: 'skills',        label: 'Skills',         labelTh: 'ทักษะ',         icon: 'Sparkles',        path: '/settings/skills', platforms: ['web', 'desktop'], group: 'main', sortOrder: 3 },
   { id: 'workflows',     label: 'Workflows',      labelTh: 'เวิร์กโฟลว์',    icon: 'GitBranch',       path: '/workflows',      platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.5 },
+  { id: 'webhook-triggers', label: 'Webhook Triggers', labelTh: 'เว็บฮุก', icon: 'Webhook', path: '/webhook-triggers', platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.6, requiresFeature: 'webhookTriggers' },
   { id: 'agencies',      label: 'Agencies',       labelTh: 'เอเจนซี่',       icon: 'Users',           path: '/agencies',       platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.7, requiresFeature: 'AGENCY_SWARM_ENABLED' },
   { id: 'media-history', label: 'Media History',  labelTh: 'ประวัติมีเดีย',  icon: 'Clock',           path: '/media-history',  platforms: ['web', 'desktop'], group: 'main', sortOrder: 4 },
   { id: 'document-management', label: 'Document Management', labelTh: 'จัดการเอกสาร', icon: 'FileText', path: '/document-management', platforms: ['web', 'desktop'], group: 'main', sortOrder: 4.2 },
