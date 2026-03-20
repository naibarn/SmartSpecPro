/**
 * AdminAlertRules — Admin page for managing alert rules and escalation policies.
 * Uses tRPC routers: alertRules.listRules, createRule, updateRule, deleteRule,
 * listEscalationPolicies, createEscalationPolicy, updateEscalationPolicy, deleteEscalationPolicy.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  BellRing,
  ChevronLeft,
  Loader2,
  Pencil,
  Plus,
  Save,
  Shield,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// ─── Schemas ────────────────────────────────────────────────────────────────

const OPERATORS = ["gt", "lt", "gte", "lte", "eq"] as const;
const SEVERITIES = ["low", "normal", "high", "critical"] as const;
const CHANNELS = ["in_app", "email", "telegram"] as const;

const operatorSymbol: Record<string, string> = {
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
  eq: "=",
};

const severityColor: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  normal: "bg-green-100 text-green-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const alertRuleFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  metricName: z.string().min(1, "Metric name is required").max(100),
  operator: z.enum(OPERATORS),
  threshold: z.coerce.number({ invalid_type_error: "Must be a number" }),
  windowMinutes: z.coerce.number().int().min(1).default(5),
  severity: z.enum(SEVERITIES).default("high"),
  channels: z.array(z.string()).min(1, "Select at least one channel"),
  targetRole: z.string().optional(),
  targetUserId: z.coerce.number().int().optional().or(z.literal("")),
  cooldownMinutes: z.coerce.number().int().min(1).default(10),
  isEnabled: z.boolean().default(true),
});

type AlertRuleFormData = z.infer<typeof alertRuleFormSchema>;

const escalationPolicyFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  triggerSeverity: z.enum(SEVERITIES),
  triggerMinutes: z.coerce.number().int().min(1, "Must be at least 1 minute"),
  escalateToRole: z.string().optional(),
  escalateToUserId: z.coerce.number().int().optional().or(z.literal("")),
  escalateChannels: z.array(z.string()).min(1, "Select at least one channel"),
  escalateMessage: z.string().max(500).optional(),
  isEnabled: z.boolean().default(true),
});

type EscalationPolicyFormData = z.infer<typeof escalationPolicyFormSchema>;

// ─── Alert Rules Tab ────────────────────────────────────────────────────────

function AlertRulesTab() {
  const utils = trpc.useUtils();
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const rulesQuery = trpc.alertRules.listRules.useQuery({
    limit: 50,
    offset: 0,
  });

  const createMutation = trpc.alertRules.createRule.useMutation({
    onSuccess: () => {
      toast.success("Alert rule created");
      setIsCreateOpen(false);
      utils.alertRules.listRules.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to create rule"),
  });

  const updateMutation = trpc.alertRules.updateRule.useMutation({
    onSuccess: () => {
      toast.success("Alert rule updated");
      setEditingRule(null);
      utils.alertRules.listRules.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to update rule"),
  });

  const deleteMutation = trpc.alertRules.deleteRule.useMutation({
    onSuccess: () => {
      toast.success("Alert rule deleted");
      setDeleteId(null);
      utils.alertRules.listRules.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to delete rule"),
  });

  function handleToggleEnabled(rule: any) {
    updateMutation.mutate({ id: rule.id, isEnabled: !rule.isEnabled });
  }

  const rules = rulesQuery.data?.rules ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {rulesQuery.data?.total ?? 0} rules configured
        </p>
        <Button onClick={() => setIsCreateOpen(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Add Rule
        </Button>
      </div>

      {rulesQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BellRing className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              No alert rules yet
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Create your first alert rule to start monitoring metrics.
            </p>
            <Button onClick={() => setIsCreateOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Create your first alert rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Cooldown</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule: any) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {rule.metricName}
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {operatorSymbol[rule.operator] ?? rule.operator}{" "}
                    {rule.threshold}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={severityColor[rule.severity] ?? ""}
                      variant="secondary"
                    >
                      {rule.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {rule.cooldownMinutes}m
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={rule.isEnabled}
                      onCheckedChange={() => handleToggleEnabled(rule)}
                      aria-label={`Toggle ${rule.name}`}
                      data-testid={`rule-toggle-${rule.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingRule(rule)}
                        data-testid={`edit-rule-${rule.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteId(rule.id)}
                        className="text-red-600 hover:text-red-700"
                        data-testid={`delete-rule-${rule.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <AlertRuleFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Create Alert Rule"
        onSubmit={(data) => {
          const payload = {
            ...data,
            targetUserId:
              typeof data.targetUserId === "number"
                ? data.targetUserId
                : undefined,
          };
          createMutation.mutate(payload as any);
        }}
        isLoading={createMutation.isPending}
      />

      {/* Edit Dialog */}
      <AlertRuleFormDialog
        open={!!editingRule}
        onOpenChange={(open) => !open && setEditingRule(null)}
        title="Edit Alert Rule"
        defaultValues={editingRule}
        onSubmit={(data) => {
          const payload = {
            id: editingRule!.id,
            ...data,
            targetUserId:
              typeof data.targetUserId === "number"
                ? data.targetUserId
                : undefined,
          };
          updateMutation.mutate(payload as any);
        }}
        isLoading={updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Alert Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this alert rule? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-rule"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Alert Rule Form Dialog ─────────────────────────────────────────────────

function AlertRuleFormDialog({
  open,
  onOpenChange,
  title,
  defaultValues,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  defaultValues?: any;
  onSubmit: (data: AlertRuleFormData) => void;
  isLoading: boolean;
}) {
  const form = useForm<AlertRuleFormData>({
    resolver: zodResolver(alertRuleFormSchema),
    defaultValues: defaultValues
      ? {
          name: defaultValues.name ?? "",
          description: defaultValues.description ?? "",
          metricName: defaultValues.metricName ?? "",
          operator: defaultValues.operator ?? "gt",
          threshold: defaultValues.threshold ?? 0,
          windowMinutes: defaultValues.windowMinutes ?? 5,
          severity: defaultValues.severity ?? "high",
          channels: defaultValues.channels ?? ["in_app"],
          targetRole: defaultValues.targetRole ?? "",
          targetUserId: defaultValues.targetUserId ?? "",
          cooldownMinutes: defaultValues.cooldownMinutes ?? 10,
          isEnabled: defaultValues.isEnabled ?? true,
        }
      : {
          name: "",
          description: "",
          metricName: "",
          operator: "gt" as const,
          threshold: 0,
          windowMinutes: 5,
          severity: "high" as const,
          channels: ["in_app"],
          targetRole: "",
          cooldownMinutes: 10,
          isEnabled: true,
        },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          data-testid="alert-rule-form"
        >
          <div>
            <Label htmlFor="rule-name">Name *</Label>
            <Input
              id="rule-name"
              {...form.register("name")}
              placeholder="e.g., High Error Rate"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-red-500 mt-1">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="rule-description">Description</Label>
            <Textarea
              id="rule-description"
              {...form.register("description")}
              placeholder="Optional description"
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="rule-metric">Metric Name *</Label>
            <Input
              id="rule-metric"
              {...form.register("metricName")}
              placeholder="e.g., error_rate"
            />
            {form.formState.errors.metricName && (
              <p className="text-xs text-red-500 mt-1">
                {form.formState.errors.metricName.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Operator *</Label>
              <Controller
                control={form.control}
                name="operator"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger data-testid="operator-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((op) => (
                        <SelectItem key={op} value={op}>
                          {operatorSymbol[op]} ({op})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label htmlFor="rule-threshold">Threshold *</Label>
              <Input
                id="rule-threshold"
                type="number"
                step="any"
                {...form.register("threshold")}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rule-window">Window (minutes)</Label>
              <Input
                id="rule-window"
                type="number"
                {...form.register("windowMinutes")}
              />
            </div>
            <div>
              <Label htmlFor="rule-cooldown">Cooldown (minutes)</Label>
              <Input
                id="rule-cooldown"
                type="number"
                {...form.register("cooldownMinutes")}
              />
            </div>
          </div>

          <div>
            <Label>Severity *</Label>
            <Controller
              control={form.control}
              name="severity"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div>
            <Label>Channels *</Label>
            <div className="flex gap-3 mt-1">
              {CHANNELS.map((ch) => {
                const channelValues = form.watch("channels") ?? [];
                return (
                  <label
                    key={ch}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={channelValues.includes(ch)}
                      onChange={(e) => {
                        const current = form.getValues("channels") ?? [];
                        form.setValue(
                          "channels",
                          e.target.checked
                            ? [...current, ch]
                            : current.filter((c) => c !== ch),
                          { shouldValidate: true },
                        );
                      }}
                    />
                    {ch.replace("_", " ")}
                  </label>
                );
              })}
            </div>
            {form.formState.errors.channels && (
              <p className="text-xs text-red-500 mt-1">
                {form.formState.errors.channels.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Target Role</Label>
              <Controller
                control={form.control}
                name="targetRole"
                render={({ field }) => (
                  <Select
                    value={field.value || "_none"}
                    onValueChange={(v) =>
                      field.onChange(v === "_none" ? undefined : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Any</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="domain_admin">Domain Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label htmlFor="rule-target-user">Target User ID</Label>
              <Input
                id="rule-target-user"
                type="number"
                {...form.register("targetUserId")}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Controller
              control={form.control}
              name="isEnabled"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  id="rule-enabled"
                />
              )}
            />
            <Label htmlFor="rule-enabled">Enabled</Label>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              {defaultValues ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Escalation Policies Tab ────────────────────────────────────────────────

function EscalationPoliciesTab() {
  const utils = trpc.useUtils();
  const [editingPolicy, setEditingPolicy] = useState<any | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const policiesQuery = trpc.alertRules.listEscalationPolicies.useQuery();

  const createMutation =
    trpc.alertRules.createEscalationPolicy.useMutation({
      onSuccess: () => {
        toast.success("Escalation policy created");
        setIsCreateOpen(false);
        utils.alertRules.listEscalationPolicies.invalidate();
      },
      onError: (err) => toast.error(err.message || "Failed to create policy"),
    });

  const updateMutation =
    trpc.alertRules.updateEscalationPolicy.useMutation({
      onSuccess: () => {
        toast.success("Escalation policy updated");
        setEditingPolicy(null);
        utils.alertRules.listEscalationPolicies.invalidate();
      },
      onError: (err) => toast.error(err.message || "Failed to update policy"),
    });

  const deleteMutation =
    trpc.alertRules.deleteEscalationPolicy.useMutation({
      onSuccess: () => {
        toast.success("Escalation policy deleted");
        setDeleteId(null);
        utils.alertRules.listEscalationPolicies.invalidate();
      },
      onError: (err) => toast.error(err.message || "Failed to delete policy"),
    });

  const policies = policiesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {policies.length} policies configured
        </p>
        <Button onClick={() => setIsCreateOpen(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Add Policy
        </Button>
      </div>

      {policiesQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : policies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              No escalation policies yet
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Create an escalation policy to auto-escalate unacknowledged
              notifications.
            </p>
            <Button onClick={() => setIsCreateOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Create your first policy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Trigger Severity</TableHead>
                <TableHead>Trigger Minutes</TableHead>
                <TableHead>Escalate To</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((policy: any) => (
                <TableRow key={policy.id}>
                  <TableCell className="font-medium">{policy.name}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        severityColor[policy.triggerSeverity] ?? ""
                      }
                      variant="secondary"
                    >
                      {policy.triggerSeverity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {policy.triggerMinutes}m
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {policy.escalateToRole ??
                      (policy.escalateToUserId
                        ? `User #${policy.escalateToUserId}`
                        : "-")}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {(policy.escalateChannels ?? []).join(", ")}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={policy.isEnabled}
                      onCheckedChange={() =>
                        updateMutation.mutate({
                          id: policy.id,
                          isEnabled: !policy.isEnabled,
                        })
                      }
                      aria-label={`Toggle ${policy.name}`}
                      data-testid={`policy-toggle-${policy.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingPolicy(policy)}
                        data-testid={`edit-policy-${policy.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteId(policy.id)}
                        className="text-red-600 hover:text-red-700"
                        data-testid={`delete-policy-${policy.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <EscalationPolicyFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Create Escalation Policy"
        onSubmit={(data) => {
          const payload = {
            ...data,
            escalateToUserId:
              typeof data.escalateToUserId === "number"
                ? data.escalateToUserId
                : undefined,
            escalateToRole: data.escalateToRole || undefined,
          };
          createMutation.mutate(payload as any);
        }}
        isLoading={createMutation.isPending}
      />

      {/* Edit Dialog */}
      <EscalationPolicyFormDialog
        open={!!editingPolicy}
        onOpenChange={(open) => !open && setEditingPolicy(null)}
        title="Edit Escalation Policy"
        defaultValues={editingPolicy}
        onSubmit={(data) => {
          const payload = {
            id: editingPolicy!.id,
            ...data,
            escalateToUserId:
              typeof data.escalateToUserId === "number"
                ? data.escalateToUserId
                : undefined,
            escalateToRole: data.escalateToRole || undefined,
          };
          updateMutation.mutate(payload as any);
        }}
        isLoading={updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Escalation Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this escalation policy? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteId && deleteMutation.mutate({ id: deleteId })
              }
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-policy"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Escalation Policy Form Dialog ──────────────────────────────────────────

function EscalationPolicyFormDialog({
  open,
  onOpenChange,
  title,
  defaultValues,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  defaultValues?: any;
  onSubmit: (data: EscalationPolicyFormData) => void;
  isLoading: boolean;
}) {
  const form = useForm<EscalationPolicyFormData>({
    resolver: zodResolver(escalationPolicyFormSchema),
    defaultValues: defaultValues
      ? {
          name: defaultValues.name ?? "",
          triggerSeverity: defaultValues.triggerSeverity ?? "high",
          triggerMinutes: defaultValues.triggerMinutes ?? 30,
          escalateToRole: defaultValues.escalateToRole ?? "",
          escalateToUserId: defaultValues.escalateToUserId ?? "",
          escalateChannels: defaultValues.escalateChannels ?? ["in_app"],
          escalateMessage: defaultValues.escalateMessage ?? "",
          isEnabled: defaultValues.isEnabled ?? true,
        }
      : {
          name: "",
          triggerSeverity: "high" as const,
          triggerMinutes: 30,
          escalateToRole: "",
          escalateChannels: ["in_app"],
          escalateMessage: "",
          isEnabled: true,
        },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          data-testid="escalation-policy-form"
        >
          <div>
            <Label htmlFor="policy-name">Name *</Label>
            <Input
              id="policy-name"
              {...form.register("name")}
              placeholder="e.g., Critical Alert Escalation"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-red-500 mt-1">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Trigger Severity *</Label>
              <Controller
                control={form.control}
                name="triggerSeverity"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label htmlFor="policy-trigger-minutes">
                Trigger After (minutes) *
              </Label>
              <Input
                id="policy-trigger-minutes"
                type="number"
                {...form.register("triggerMinutes")}
              />
              {form.formState.errors.triggerMinutes && (
                <p className="text-xs text-red-500 mt-1">
                  {form.formState.errors.triggerMinutes.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Escalate To Role</Label>
              <Controller
                control={form.control}
                name="escalateToRole"
                render={({ field }) => (
                  <Select
                    value={field.value || "_none"}
                    onValueChange={(v) =>
                      field.onChange(v === "_none" ? undefined : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="domain_admin">Domain Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label htmlFor="policy-target-user">Escalate To User ID</Label>
              <Input
                id="policy-target-user"
                type="number"
                {...form.register("escalateToUserId")}
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <Label>Channels *</Label>
            <div className="flex gap-3 mt-1">
              {CHANNELS.map((ch) => {
                const channelValues = form.watch("escalateChannels") ?? [];
                return (
                  <label
                    key={ch}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={channelValues.includes(ch)}
                      onChange={(e) => {
                        const current =
                          form.getValues("escalateChannels") ?? [];
                        form.setValue(
                          "escalateChannels",
                          e.target.checked
                            ? [...current, ch]
                            : current.filter((c) => c !== ch),
                          { shouldValidate: true },
                        );
                      }}
                    />
                    {ch.replace("_", " ")}
                  </label>
                );
              })}
            </div>
            {form.formState.errors.escalateChannels && (
              <p className="text-xs text-red-500 mt-1">
                {form.formState.errors.escalateChannels.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="policy-message">Escalation Message</Label>
            <Textarea
              id="policy-message"
              {...form.register("escalateMessage")}
              placeholder="Optional message included in escalation notification"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <Controller
              control={form.control}
              name="isEnabled"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  id="policy-enabled"
                />
              )}
            />
            <Label htmlFor="policy-enabled">Enabled</Label>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              {defaultValues ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AdminAlertRules() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/dashboard")}
              className="text-gray-600"
            >
              <ChevronLeft className="w-5 h-5 mr-1" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                <BellRing className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Alert Rules & Escalation
                </h1>
                <p className="text-sm text-gray-500">
                  Configure alert triggers and escalation policies
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
        <Tabs defaultValue="rules">
          <TabsList className="mb-6">
            <TabsTrigger value="rules">Alert Rules</TabsTrigger>
            <TabsTrigger value="escalation">Escalation Policies</TabsTrigger>
          </TabsList>

          <TabsContent value="rules">
            <Card>
              <CardHeader>
                <CardTitle>Alert Rules</CardTitle>
                <CardDescription>
                  Define conditions that trigger notifications when system
                  metrics exceed thresholds.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AlertRulesTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="escalation">
            <Card>
              <CardHeader>
                <CardTitle>Escalation Policies</CardTitle>
                <CardDescription>
                  Configure automatic escalation for unacknowledged
                  notifications.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EscalationPoliciesTab />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
