/**
 * WebhookManagement — User webhook management component.
 * Embedded in notification settings as a collapsible section.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Webhook,
  Plus,
  Trash2,
  Pencil,
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Key,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  "system_health",
  "media_jobs",
  "workflow",
  "skill",
  "feedback",
  "agency",
  "follow",
  "scheduled",
  "security",
  "business",
] as const;

function generateSecret(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  for (const byte of array) {
    result += chars[byte % chars.length];
  }
  return result;
}

interface WebhookFormData {
  name: string;
  url: string;
  secret: string;
  categories: string[] | null;
  minSeverity: string | null;
}

export function WebhookManagement({
  scope = "user",
}: {
  scope?: "user" | "tenant";
}) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<WebhookFormData>({
    name: "",
    url: "",
    secret: "",
    categories: null,
    minSeverity: null,
  });

  const utils = trpc.useUtils();

  const webhooksQuery = trpc.notificationWebhooks.listWebhooks.useQuery({
    scope,
  });

  const createMutation = trpc.notificationWebhooks.createWebhook.useMutation({
    onSuccess: () => {
      toast.success("Webhook created");
      setIsAddOpen(false);
      resetForm();
      utils.notificationWebhooks.listWebhooks.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.notificationWebhooks.updateWebhook.useMutation({
    onSuccess: () => {
      toast.success("Webhook updated");
      setEditingId(null);
      resetForm();
      utils.notificationWebhooks.listWebhooks.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.notificationWebhooks.deleteWebhook.useMutation({
    onSuccess: () => {
      toast.success("Webhook deleted");
      utils.notificationWebhooks.listWebhooks.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const testMutation = trpc.notificationWebhooks.testWebhook.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Webhook test succeeded (${data.statusCode})`);
      } else {
        toast.error(`Webhook test failed: ${data.error}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setForm({
      name: "",
      url: "",
      secret: "",
      categories: null,
      minSeverity: null,
    });
  }

  function handleCreate() {
    createMutation.mutate({
      ...form,
      categories: form.categories?.length ? form.categories as any : null,
      minSeverity: form.minSeverity as any,
      scope,
    });
  }

  function handleUpdate() {
    if (editingId === null) return;
    const updates: any = { id: editingId };
    if (form.name) updates.name = form.name;
    if (form.url) updates.url = form.url;
    if (form.secret) updates.secret = form.secret;
    if (form.categories !== undefined) updates.categories = form.categories;
    if (form.minSeverity !== undefined) updates.minSeverity = form.minSeverity;
    updateMutation.mutate(updates);
  }

  const webhooks = webhooksQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook className="h-5 w-5" />
          <h3 className="text-lg font-semibold">
            {scope === "tenant" ? "Tenant Webhooks" : "Webhooks"}
          </h3>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-1" />
              Add Webhook
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Webhook</DialogTitle>
            </DialogHeader>
            <WebhookForm form={form} setForm={setForm} />
            <DialogFooter>
              <Button
                onClick={handleCreate}
                disabled={
                  createMutation.isPending ||
                  !form.name ||
                  !form.url ||
                  !form.secret
                }
              >
                {createMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                )}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {webhooksQuery.isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No webhooks configured. Click "Add Webhook" to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {webhooks.map((hook: any) => (
            <div
              key={hook.id}
              className={`flex items-center justify-between p-3 border rounded-lg ${
                !hook.isEnabled
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-border"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{hook.name}</span>
                  {!hook.isEnabled && (
                    <Badge variant="destructive" className="text-xs">
                      Disabled
                    </Badge>
                  )}
                  {hook.failureCount > 0 && (
                    <Badge variant="outline" className="text-xs text-orange-600">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {hook.failureCount} failures
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground truncate">
                  {hook.url}
                </div>
                <div className="flex gap-1 mt-1">
                  {hook.categories ? (
                    (hook.categories as string[]).map((cat: string) => (
                      <Badge key={cat} variant="secondary" className="text-xs">
                        {cat}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      All categories
                    </Badge>
                  )}
                  {hook.minSeverity && (
                    <Badge variant="outline" className="text-xs">
                      Min: {hook.minSeverity}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => testMutation.mutate({ id: hook.id })}
                  disabled={testMutation.isPending}
                  title="Test webhook"
                >
                  {testMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <Dialog
                  open={editingId === hook.id}
                  onOpenChange={(open) => {
                    if (open) {
                      setEditingId(hook.id);
                      setForm({
                        name: hook.name,
                        url: hook.url,
                        secret: "",
                        categories: hook.categories ?? null,
                        minSeverity: hook.minSeverity ?? null,
                      });
                    } else {
                      setEditingId(null);
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" title="Edit webhook">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit Webhook</DialogTitle>
                    </DialogHeader>
                    <WebhookForm
                      form={form}
                      setForm={setForm}
                      isEdit
                    />
                    <DialogFooter>
                      <Button
                        onClick={handleUpdate}
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        )}
                        Save
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" title="Delete webhook">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{hook.name}"? This
                        action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          deleteMutation.mutate({ id: hook.id })
                        }
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WebhookForm({
  form,
  setForm,
  isEdit = false,
}: {
  form: WebhookFormData;
  setForm: (f: WebhookFormData) => void;
  isEdit?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Name</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="My Webhook"
          maxLength={100}
        />
      </div>
      <div>
        <Label>URL (HTTPS only)</Label>
        <Input
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          placeholder="https://example.com/webhook"
          type="url"
        />
      </div>
      <div>
        <Label>{isEdit ? "New Secret (leave blank to keep)" : "Secret"}</Label>
        <div className="flex gap-2">
          <Input
            value={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
            placeholder={
              isEdit ? "Leave blank to keep current" : "Min 16 characters"
            }
            type="password"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setForm({ ...form, secret: generateSecret() })}
            title="Generate secret"
          >
            <Key className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div>
        <Label>Min Severity</Label>
        <Select
          value={form.minSeverity ?? "none"}
          onValueChange={(v) =>
            setForm({ ...form, minSeverity: v === "none" ? null : v })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="No minimum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No minimum</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Categories (leave empty for all)</Label>
        <div className="flex flex-wrap gap-1 mt-1">
          {CATEGORIES.map((cat) => {
            const selected = form.categories?.includes(cat) ?? false;
            return (
              <Badge
                key={cat}
                variant={selected ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => {
                  const current = form.categories ?? [];
                  const next = selected
                    ? current.filter((c) => c !== cat)
                    : [...current, cat];
                  setForm({
                    ...form,
                    categories: next.length > 0 ? next : null,
                  });
                }}
              >
                {cat}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
}
