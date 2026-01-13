/**
 * Webhook and Email Notification Settings Component
 * 
 * Configure webhooks (Slack, Discord, Teams) and email notifications
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Webhook,
  Mail,
  Plus,
  Trash2,
  Edit,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Send,
  RefreshCw,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

const NOTIFICATION_EVENTS = [
  { id: "all", label: "All Events" },
  { id: "container_stopped", label: "Container Stopped" },
  { id: "container_started", label: "Container Started" },
  { id: "container_restarted", label: "Container Restarted" },
  { id: "high_cpu", label: "High CPU Usage" },
  { id: "high_memory", label: "High Memory Usage" },
  { id: "container_error", label: "Container Error" },
];

interface WebhookConfig {
  id: number;
  name: string;
  url: string;
  type: "slack" | "discord" | "generic" | "teams";
  enabled: boolean;
  events: string;
}

interface WebhookFormData {
  name: string;
  url: string;
  type: "slack" | "discord" | "generic" | "teams";
  enabled: boolean;
  events: string[];
}

function WebhookForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initialData?: WebhookFormData;
  onSubmit: (data: WebhookFormData) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState<WebhookFormData>(
    initialData || {
      name: "",
      url: "",
      type: "generic",
      enabled: true,
      events: ["all"],
    }
  );

  const handleEventToggle = (eventId: string) => {
    if (eventId === "all") {
      setFormData({ ...formData, events: ["all"] });
    } else {
      const newEvents = formData.events.filter(e => e !== "all");
      if (newEvents.includes(eventId)) {
        setFormData({ ...formData, events: newEvents.filter(e => e !== eventId) });
      } else {
        setFormData({ ...formData, events: [...newEvents, eventId] });
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="font-mono text-xs">NAME</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="My Slack Webhook"
          className="bg-card/50 border-primary/30 font-mono"
        />
      </div>

      <div className="space-y-2">
        <Label className="font-mono text-xs">WEBHOOK URL</Label>
        <Input
          value={formData.url}
          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
          placeholder="https://hooks.slack.com/services/..."
          className="bg-card/50 border-primary/30 font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label className="font-mono text-xs">TYPE</Label>
        <Select
          value={formData.type}
          onValueChange={(value: "slack" | "discord" | "generic" | "teams") =>
            setFormData({ ...formData, type: value })
          }
        >
          <SelectTrigger className="bg-card/50 border-primary/30 font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="slack">Slack</SelectItem>
            <SelectItem value="discord">Discord</SelectItem>
            <SelectItem value="teams">Microsoft Teams</SelectItem>
            <SelectItem value="generic">Generic Webhook</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="font-mono text-xs">EVENTS</Label>
        <div className="grid grid-cols-2 gap-2">
          {NOTIFICATION_EVENTS.map((event) => (
            <div key={event.id} className="flex items-center space-x-2">
              <Checkbox
                id={event.id}
                checked={formData.events.includes(event.id) || formData.events.includes("all")}
                onCheckedChange={() => handleEventToggle(event.id)}
                disabled={event.id !== "all" && formData.events.includes("all")}
              />
              <label
                htmlFor={event.id}
                className="text-xs font-mono text-muted-foreground cursor-pointer"
              >
                {event.label}
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          checked={formData.enabled}
          onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
        />
        <Label className="font-mono text-xs">ENABLED</Label>
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onCancel} className="font-mono">
          CANCEL
        </Button>
        <Button
          onClick={() => onSubmit(formData)}
          disabled={isLoading || !formData.name || !formData.url}
          className="font-mono bg-primary hover:bg-primary/90"
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          SAVE
        </Button>
      </DialogFooter>
    </div>
  );
}

export function WebhookSettings() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookConfig | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  // Fetch webhooks
  const { data: webhooksData, isLoading, refetch } = trpc.webhooks.list.useQuery();

  // Mutations
  const createMutation = trpc.webhooks.create.useMutation({
    onSuccess: () => {
      toast.success("Webhook created successfully");
      refetch();
      setShowAddDialog(false);
    },
    onError: (error) => {
      toast.error(`Failed to create webhook: ${error.message}`);
    },
  });

  const updateMutation = trpc.webhooks.update.useMutation({
    onSuccess: () => {
      toast.success("Webhook updated successfully");
      refetch();
      setEditingWebhook(null);
    },
    onError: (error) => {
      toast.error(`Failed to update webhook: ${error.message}`);
    },
  });

  const deleteMutation = trpc.webhooks.delete.useMutation({
    onSuccess: () => {
      toast.success("Webhook deleted successfully");
      refetch();
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete webhook: ${error.message}`);
    },
  });

  const testMutation = trpc.webhooks.test.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Test notification sent successfully!");
      } else {
        toast.error(`Test failed: ${result.error}`);
      }
      setTestingId(null);
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
      setTestingId(null);
    },
  });

  const webhooks = webhooksData?.configs || [];

  const handleCreate = (data: WebhookFormData) => {
    createMutation.mutate(data);
  };

  const handleUpdate = (data: WebhookFormData) => {
    if (!editingWebhook) return;
    updateMutation.mutate({
      id: editingWebhook.id,
      ...data,
    });
  };

  const handleTest = (webhook: WebhookConfig) => {
    setTestingId(webhook.id);
    testMutation.mutate({
      url: webhook.url,
      type: webhook.type,
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "slack":
        return "🔔";
      case "discord":
        return "🎮";
      case "teams":
        return "💼";
      default:
        return "🌐";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded border border-primary/30">
            <Webhook className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground tracking-wide">Webhook Notifications</h3>
            <p className="text-xs text-muted-foreground font-mono">
              Send alerts to Slack, Discord, Teams, or custom webhooks
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="border-primary/50 text-primary hover:bg-primary/10"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            REFRESH
          </Button>
          <Button
            size="sm"
            onClick={() => setShowAddDialog(true)}
            className="bg-primary hover:bg-primary/90 font-mono"
          >
            <Plus className="w-4 h-4 mr-2" />
            ADD WEBHOOK
          </Button>
        </div>
      </div>

      {/* Webhooks Table */}
      <Card className="bg-card/80 backdrop-blur border-primary/30 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : webhooks.length === 0 ? (
          <div className="p-6 text-center">
            <Webhook className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground font-mono text-sm">No webhooks configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a webhook to receive notifications
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-primary/30 hover:bg-transparent">
                <TableHead className="font-mono text-xs text-muted-foreground">NAME</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">TYPE</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">STATUS</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">EVENTS</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((webhook) => {
                const events = JSON.parse(webhook.events || "[]");
                return (
                  <TableRow key={webhook.id} className="border-primary/20 hover:bg-primary/5">
                    <TableCell className="font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <span>{getTypeIcon(webhook.type)}</span>
                        {webhook.name}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground uppercase">
                      {webhook.type}
                    </TableCell>
                    <TableCell>
                      {webhook.enabled ? (
                        <Badge variant="outline" className="badge-running text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          ENABLED
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="badge-stopped text-xs">
                          <X className="w-3 h-3 mr-1" />
                          DISABLED
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {events.includes("all") ? "All Events" : `${events.length} events`}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTest(webhook)}
                          disabled={testingId === webhook.id}
                          className="text-primary hover:text-primary/80 hover:bg-primary/10"
                        >
                          {testingId === webhook.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingWebhook(webhook)}
                          className="text-muted-foreground hover:text-foreground hover:bg-primary/10"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(webhook)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-card border-primary/30">
          <DialogHeader>
            <DialogTitle className="font-mono">ADD WEBHOOK</DialogTitle>
          </DialogHeader>
          <WebhookForm
            onSubmit={handleCreate}
            onCancel={() => setShowAddDialog(false)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingWebhook} onOpenChange={() => setEditingWebhook(null)}>
        <DialogContent className="bg-card border-primary/30">
          <DialogHeader>
            <DialogTitle className="font-mono">EDIT WEBHOOK</DialogTitle>
          </DialogHeader>
          {editingWebhook && (
            <WebhookForm
              initialData={{
                name: editingWebhook.name,
                url: editingWebhook.url,
                type: editingWebhook.type,
                enabled: editingWebhook.enabled,
                events: JSON.parse(editingWebhook.events || "[]"),
              }}
              onSubmit={handleUpdate}
              onCancel={() => setEditingWebhook(null)}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-primary/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">DELETE WEBHOOK</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-muted-foreground">
              Are you sure you want to delete webhook "{deleteTarget?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">CANCEL</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              className="font-mono bg-red-500 hover:bg-red-600"
            >
              DELETE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Email Settings Component (simplified version using built-in notifications)
export function EmailSettings() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded border border-primary/30">
          <Mail className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-bold text-foreground tracking-wide">Email Notifications</h3>
          <p className="text-xs text-muted-foreground font-mono">
            Receive alerts via email when events occur
          </p>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-card/80 backdrop-blur border-primary/30 p-6">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-primary/10 rounded border border-primary/30">
            <AlertTriangle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="font-mono text-sm font-bold mb-2">Built-in Notifications</h4>
            <p className="text-sm text-muted-foreground">
              Email notifications are sent through the Manus notification system. 
              Configure your notification preferences in the Settings panel to receive 
              Docker alerts via email.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              For custom SMTP configuration, please contact support.
            </p>
          </div>
        </div>
      </Card>

      {/* Notification Events Info */}
      <Card className="bg-card/80 backdrop-blur border-primary/30 p-6">
        <h4 className="font-mono text-sm font-bold mb-4">Available Events</h4>
        <div className="grid grid-cols-2 gap-3">
          {NOTIFICATION_EVENTS.filter(e => e.id !== "all").map((event) => (
            <div key={event.id} className="flex items-center gap-2 p-2 bg-background/50 rounded border border-border/50">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span className="text-xs font-mono">{event.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
