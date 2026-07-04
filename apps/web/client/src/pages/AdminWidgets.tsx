/**
 * AdminWidgets — Widget management page for domain_admin and admin roles.
 *
 * Features:
 * - List all widgets for the tenant
 * - Create / Edit widget (modal)
 * - Embed code generator with copy-to-clipboard
 * - Theme customization (primary color, background, text color)
 * - Soft-delete (set is_active = false)
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/components/ui/confirm/ConfirmProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Copy, Plus, Pencil, Trash2, Code2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WidgetRow {
  id: string;
  name: string;
  targetType: string | null;
  isActive: boolean | null;
  allowedOrigins: string[] | null;
  rateLimitPerMinute: number | null;
  creditSource: string | null;
  monthlyCreditBudget: number | null;
  createdAt: Date | string;
}

// ── Embed Code Dialog ──────────────────────────────────────────────────────────

function EmbedCodeDialog({
  widgetId,
  onClose,
}: {
  widgetId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { data } = trpc.widget.getEmbedCode.useQuery({ widgetId });

  const handleCopy = () => {
    if (data?.embedCode) {
      navigator.clipboard.writeText(data.embedCode).then(() => {
        toast({ title: "Copied to clipboard" });
      });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Embed Code</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Add this snippet to your website's HTML, just before the closing{" "}
          <code>&lt;/body&gt;</code> tag.
        </p>
        <Textarea
          readOnly
          value={data?.embedCode ?? "Loading..."}
          className="font-mono text-xs h-32"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleCopy}>
            <Copy className="mr-2 h-4 w-4" />
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create / Edit Form ─────────────────────────────────────────────────────────

interface WidgetFormData {
  name: string;
  targetType: "chat" | "agency";
  allowedOrigins: string;
  rateLimitPerMinute: number;
  maxConversationLength: number;
  requireEmail: boolean;
  creditSource: "tenant" | "visitor";
  monthlyCreditBudget: string;
  maxCreditsPerVisitorSession: number;
  maxCreditsPerVisitorDay: number;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
}

const defaultForm: WidgetFormData = {
  name: "",
  targetType: "chat",
  allowedOrigins: "",
  rateLimitPerMinute: 10,
  maxConversationLength: 100,
  requireEmail: false,
  creditSource: "tenant",
  monthlyCreditBudget: "",
  maxCreditsPerVisitorSession: 50,
  maxCreditsPerVisitorDay: 100,
  primaryColor: "#6366f1",
  backgroundColor: "#ffffff",
  textColor: "#1a1a1a",
};

function WidgetFormDialog({
  widgetId,
  initialData,
  onClose,
}: {
  widgetId?: string;
  initialData?: Partial<WidgetFormData>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<WidgetFormData>({ ...defaultForm, ...initialData });
  const queryClient = useQueryClient();

  const createMutation = trpc.widget.create.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["widget", "list"]] });
      toast({ title: "Widget created" });
      onClose();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = trpc.widget.update.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["widget", "list"]] });
      toast({ title: "Widget updated" });
      onClose();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const allowedOrigins = form.allowedOrigins
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const theme = {
      primaryColor: form.primaryColor,
      backgroundColor: form.backgroundColor,
      textColor: form.textColor,
    };

    const monthlyCreditBudget = form.monthlyCreditBudget
      ? parseInt(form.monthlyCreditBudget, 10) || null
      : null;

    if (widgetId) {
      updateMutation.mutate({
        widgetId,
        name: form.name,
        targetType: form.targetType,
        allowedOrigins,
        rateLimitPerMinute: form.rateLimitPerMinute,
        maxConversationLength: form.maxConversationLength,
        requireEmail: form.requireEmail,
        creditSource: form.creditSource,
        monthlyCreditBudget,
        maxCreditsPerVisitorSession: form.maxCreditsPerVisitorSession,
        maxCreditsPerVisitorDay: form.maxCreditsPerVisitorDay,
        theme,
      });
    } else {
      createMutation.mutate({
        name: form.name,
        targetType: form.targetType,
        allowedOrigins,
        rateLimitPerMinute: form.rateLimitPerMinute,
        maxConversationLength: form.maxConversationLength,
        requireEmail: form.requireEmail,
        creditSource: form.creditSource,
        monthlyCreditBudget,
        maxCreditsPerVisitorSession: form.maxCreditsPerVisitorSession,
        maxCreditsPerVisitorDay: form.maxCreditsPerVisitorDay,
        theme,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{widgetId ? "Edit Widget" : "Create Widget"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="My Website Widget"
            />
          </div>

          <div>
            <Label>Target Type</Label>
            <Select
              value={form.targetType}
              onValueChange={(v) => setForm((f) => ({ ...f, targetType: v as "chat" | "agency" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="agency">Agency</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>
              Allowed Origins{" "}
              <span className="text-muted-foreground text-xs">(one per line)</span>
            </Label>
            <Textarea
              value={form.allowedOrigins}
              onChange={(e) => setForm((f) => ({ ...f, allowedOrigins: e.target.value }))}
              placeholder={"https://example.com\nhttps://www.yoursite.com"}
              className="h-24 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rate Limit (msgs/min)</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={form.rateLimitPerMinute}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rateLimitPerMinute: parseInt(e.target.value) || 10 }))
                }
              />
            </div>
            <div>
              <Label>Max Conversation Length</Label>
              <Input
                type="number"
                min={1}
                value={form.maxConversationLength}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    maxConversationLength: parseInt(e.target.value) || 100,
                  }))
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={form.requireEmail}
              onCheckedChange={(v) => setForm((f) => ({ ...f, requireEmail: v }))}
            />
            <Label>Require Email</Label>
          </div>

          <div>
            <Label>Credit Source</Label>
            <Select
              value={form.creditSource}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, creditSource: v as "tenant" | "visitor" }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tenant">Tenant (my credits)</SelectItem>
                <SelectItem value="visitor">Visitor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monthly Credit Budget</Label>
              <Input
                type="number"
                min={0}
                value={form.monthlyCreditBudget}
                onChange={(e) => setForm((f) => ({ ...f, monthlyCreditBudget: e.target.value }))}
                placeholder="Unlimited"
              />
            </div>
            <div>
              <Label>Session Cap (credits)</Label>
              <Input
                type="number"
                min={1}
                value={form.maxCreditsPerVisitorSession}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    maxCreditsPerVisitorSession: parseInt(e.target.value) || 50,
                  }))
                }
              />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Theme Customization</Label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Primary Color</Label>
                <Input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Background</Label>
                <Input
                  type="color"
                  value={form.backgroundColor}
                  onChange={(e) => setForm((f) => ({ ...f, backgroundColor: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Text Color</Label>
                <Input
                  type="color"
                  value={form.textColor}
                  onChange={(e) => setForm((f) => ({ ...f, textColor: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.name.trim()}>
            {isPending ? "Saving..." : widgetId ? "Save Changes" : "Create Widget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AdminWidgets() {
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editWidgetId, setEditWidgetId] = useState<string | null>(null);
  const [embedWidgetId, setEmbedWidgetId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: widgets = [], isLoading } = trpc.widget.list.useQuery();

  const deleteMutation = trpc.widget.delete.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["widget", "list"]] });
      toast({ title: "Widget deactivated" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="container mx-auto py-6 max-w-6xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Chat Widgets</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage embeddable chat widgets for your website.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Widget
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading widgets...</div>
      ) : widgets.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground mb-4">
            No widgets yet. Create one to embed a chat on your website.
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Widget
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Credit Source</TableHead>
              <TableHead>Rate Limit</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(widgets as WidgetRow[]).map((widget) => (
              <TableRow key={widget.id}>
                <TableCell className="font-medium">{widget.name}</TableCell>
                <TableCell className="capitalize">{widget.targetType ?? "chat"}</TableCell>
                <TableCell>
                  <Badge variant={widget.isActive ? "default" : "secondary"}>
                    {widget.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="capitalize">{widget.creditSource ?? "tenant"}</TableCell>
                <TableCell>{widget.rateLimitPerMinute ?? 10}/min</TableCell>
                <TableCell>
                  {new Date(widget.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEmbedWidgetId(widget.id)}
                    >
                      <Code2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditWidgetId(widget.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: "Deactivate this widget?",
                        });
                        if (confirmed) {
                          deleteMutation.mutate({ widgetId: widget.id });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {showCreate && <WidgetFormDialog onClose={() => setShowCreate(false)} />}

      {editWidgetId && (() => {
        const editRow = (widgets as WidgetRow[]).find((w) => w.id === editWidgetId);
        const theme = (editRow as any)?.theme as Record<string, string> | undefined;
        const initialData: Partial<WidgetFormData> = editRow ? {
          name: editRow.name,
          targetType: (editRow.targetType as "chat" | "agency") ?? "chat",
          allowedOrigins: (editRow.allowedOrigins ?? []).join("\n"),
          rateLimitPerMinute: editRow.rateLimitPerMinute ?? 10,
          creditSource: (editRow.creditSource as "tenant" | "visitor") ?? "tenant",
          monthlyCreditBudget: editRow.monthlyCreditBudget?.toString() ?? "",
          primaryColor: theme?.primaryColor ?? "#6366f1",
          backgroundColor: theme?.backgroundColor ?? "#ffffff",
          textColor: theme?.textColor ?? "#1a1a1a",
        } : {};
        return (
          <WidgetFormDialog
            widgetId={editWidgetId}
            initialData={initialData}
            onClose={() => setEditWidgetId(null)}
          />
        );
      })()}

      {embedWidgetId && (
        <EmbedCodeDialog
          widgetId={embedWidgetId}
          onClose={() => setEmbedWidgetId(null)}
        />
      )}
    </div>
  );
}
