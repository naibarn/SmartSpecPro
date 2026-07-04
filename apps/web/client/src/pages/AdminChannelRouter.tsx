import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GitMerge,
  Plus,
  Pencil,
  Trash2,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  GripVertical,
} from "lucide-react";
import { useLocation } from "wouter";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RuleCondition {
  field: string;
  operator: "eq" | "contains" | "startsWith" | "endsWith" | "in";
  value: string;
}

interface RoutingRule {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  priority?: number | null;
  isActive?: boolean | null;
  conditions: RuleCondition[];
  targetType: string;
  targetAgencyId?: string | null;
  totalMatches?: number | null;
  lastMatchedAt?: string | null;
  createdAt?: string;
}

const FIELD_OPTIONS = [
  { value: "message.text", label: "Message text" },
  { value: "channel.type", label: "Channel type" },
  { value: "eventType", label: "Event type" },
  { value: "conversationType", label: "Conversation type" },
];

const OPERATOR_OPTIONS = [
  { value: "eq", label: "Equals" },
  { value: "contains", label: "Contains" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "in", label: "In (comma-separated)" },
];

// ── Helper components ──────────────────────────────────────────────────────────

function ConditionBadge({ condition }: { condition: RuleCondition }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
      <span className="font-medium">{condition.field}</span>
      <span className="text-slate-400">{condition.operator}</span>
      <span className="font-mono">{String(condition.value).slice(0, 30)}</span>
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminChannelRouter() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [testChannelType, setTestChannelType] = useState("telegram");
  const [testResult, setTestResult] = useState<{
    matched: boolean;
    rule: { id: string; name: string; targetType: string; targetId: string | null } | null;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOverId = useRef<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState(50);
  const [formTargetAgencyId, setFormTargetAgencyId] = useState("");
  const [formConditions, setFormConditions] = useState<RuleCondition[]>([
    { field: "message.text", operator: "contains", value: "" },
  ]);

  const isDomainAdmin = user?.role === "admin" || user?.role === "domain_admin";
  const utils = trpc.useUtils();

  const { data: rawRules = [], isLoading } = trpc.channelRouter.list.useQuery(
    {},
    { enabled: !!isDomainAdmin },
  );

  // Sort by priority DESC locally so drag-and-drop can reorder
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const rules = [...rawRules].sort(
    (a, b) => (b.priority ?? 50) - (a.priority ?? 50),
  );
  const orderedRules =
    localOrder !== null
      ? localOrder.map((id) => rules.find((r) => r.id === id)).filter(Boolean) as typeof rules
      : rules;

  const createMutation = trpc.channelRouter.create.useMutation({
    onSuccess: () => {
      utils.channelRouter.list.invalidate();
      setRuleDialogOpen(false);
      setLocalOrder(null);
      resetForm();
    },
  });

  const updateMutation = trpc.channelRouter.update.useMutation({
    onSuccess: () => {
      utils.channelRouter.list.invalidate();
      setRuleDialogOpen(false);
      setEditingRule(null);
      setLocalOrder(null);
      resetForm();
    },
  });

  const deleteMutation = trpc.channelRouter.delete.useMutation({
    onSuccess: () => {
      utils.channelRouter.list.invalidate();
      setDeleteConfirmId(null);
      setLocalOrder(null);
    },
  });

  const toggleMutation = trpc.channelRouter.update.useMutation({
    onSuccess: () => utils.channelRouter.list.invalidate(),
  });

  const reorderMutation = trpc.channelRouter.reorder.useMutation({
    onSuccess: () => {
      utils.channelRouter.list.invalidate();
      setLocalOrder(null);
    },
  });

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormPriority(50);
    setFormTargetAgencyId("");
    setFormConditions([{ field: "message.text", operator: "contains", value: "" }]);
  }

  function openCreate() {
    resetForm();
    setEditingRule(null);
    setRuleDialogOpen(true);
  }

  function openEdit(rule: RoutingRule) {
    setFormName(rule.name);
    setFormDescription(rule.description ?? "");
    setFormPriority(rule.priority ?? 50);
    setFormTargetAgencyId(rule.targetAgencyId ?? "");
    const conds = Array.isArray(rule.conditions) ? rule.conditions : [];
    setFormConditions(conds.length > 0 ? conds : [{ field: "message.text", operator: "contains", value: "" }]);
    setEditingRule(rule);
    setRuleDialogOpen(true);
  }

  function handleSave() {
    const validConditions = formConditions.filter((c) => c.value.trim().length > 0);
    const payload = {
      name: formName,
      description: formDescription || undefined,
      priority: formPriority,
      conditions: validConditions,
      targetType: "agency" as const,
      targetAgencyId: formTargetAgencyId || undefined,
    };

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  async function handleTest() {
    if (!testMessage.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await utils.channelRouter.testRule.fetch({
        sampleMessage: testMessage,
        channelType: testChannelType,
      });
      setTestResult(result);
    } catch {
      setTestResult(null);
    } finally {
      setIsTesting(false);
    }
  }

  function addCondition() {
    setFormConditions((prev) => [
      ...prev,
      { field: "message.text", operator: "contains", value: "" },
    ]);
  }

  function removeCondition(index: number) {
    setFormConditions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCondition(index: number, partial: Partial<RuleCondition>) {
    setFormConditions((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...partial } : c)),
    );
  }

  // ── Drag-and-drop handlers ───────────────────────────────────────────────────

  function handleDragStart(id: string) {
    setDraggingId(id);
    setLocalOrder(orderedRules.map((r) => r.id));
  }

  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (dragOverId.current === overId) return;
    dragOverId.current = overId;

    setLocalOrder((prev) => {
      const order = prev ?? orderedRules.map((r) => r.id);
      const from = order.indexOf(draggingId!);
      const to = order.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, draggingId!);
      return next;
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const order = localOrder ?? orderedRules.map((r) => r.id);
    reorderMutation.mutate({ ruleIds: order });
    setDraggingId(null);
    dragOverId.current = null;
  }

  function handleDragEnd() {
    if (!reorderMutation.isPending) {
      setDraggingId(null);
      dragOverId.current = null;
    }
  }

  if (!isDomainAdmin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Domain admin access required.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/domain-admin")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Channel Router</h1>
          </div>
          <Badge variant="secondary" className="ml-1">
            {rules.length} / 50 rules
          </Badge>
        </div>
        <Button onClick={openCreate} disabled={rules.length >= 50}>
          <Plus className="mr-2 h-4 w-4" />
          Add Rule
        </Button>
      </div>

      {/* Rules table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <GitMerge className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No routing rules configured</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create rules to route inbound channel messages to specific agencies.
          </p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add First Rule
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <p className="px-4 py-2 text-xs text-muted-foreground">
            Drag rows to reorder. Rules are evaluated highest priority first.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-16">Priority</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Agency Target</TableHead>
                <TableHead className="w-24 text-center">Matches</TableHead>
                <TableHead className="w-20 text-center">Active</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedRules.map((rule) => (
                <TableRow
                  key={rule.id}
                  draggable
                  onDragStart={() => handleDragStart(rule.id)}
                  onDragOver={(e) => handleDragOver(e, rule.id)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  className={`cursor-grab active:cursor-grabbing ${
                    draggingId === rule.id ? "opacity-50" : ""
                  }`}
                >
                  <TableCell className="px-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {rule.priority ?? 50}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{rule.name}</div>
                    {rule.description && (
                      <div className="text-xs text-muted-foreground">{rule.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(rule.conditions) ? rule.conditions : [])
                        .slice(0, 3)
                        .map((cond: RuleCondition, i: number) => (
                          <ConditionBadge key={i} condition={cond} />
                        ))}
                      {Array.isArray(rule.conditions) && rule.conditions.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{rule.conditions.length - 3} more
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {rule.targetAgencyId ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {rule.targetAgencyId.slice(0, 12)}…
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <div>{rule.totalMatches ?? 0}</div>
                    {rule.lastMatchedAt && (
                      <div className="text-xs text-muted-foreground">
                        {new Date(rule.lastMatchedAt).toLocaleDateString()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={rule.isActive ?? true}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: rule.id, isActive: checked })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(rule as unknown as RoutingRule)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirmId(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Rule Testing Sandbox */}
      <div className="mt-8 rounded-lg border p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Play className="h-4 w-4 text-primary" />
          Rule Testing Sandbox
        </h2>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Type a sample message to test routing..."
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTest()}
            />
          </div>
          <Select value={testChannelType} onValueChange={setTestChannelType}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["telegram", "whatsapp", "line", "slack", "discord", "widget"].map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleTest} disabled={!testMessage.trim() || isTesting}>
            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
          </Button>
        </div>
        {testResult !== null && (
          <div className="mt-3 rounded-md border p-3">
            {testResult.matched ? (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-emerald-700">
                    Matched rule: <span className="font-semibold">{testResult.rule?.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Routes to agency
                    {testResult.rule?.targetId && (
                      <span className="ml-1 font-mono">{testResult.rule.targetId.slice(0, 12)}…</span>
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No rules matched — message would use normal routing.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rule Editor Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Routing Rule" : "Create Routing Rule"}</DialogTitle>
            <DialogDescription>
              Rules are evaluated in priority order (highest first). The first matching rule wins.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Route support requests"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Input
                  type="number"
                  min={0}
                  max={9999}
                  value={formPriority}
                  onChange={(e) => setFormPriority(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What does this rule do?"
                rows={2}
              />
            </div>

            {/* Conditions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conditions (ALL must match)</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addCondition}
                  disabled={formConditions.length >= 10}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add
                </Button>
              </div>
              {formConditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={cond.field}
                    onValueChange={(v) => updateCondition(i, { field: v })}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={cond.operator}
                    onValueChange={(v) =>
                      updateCondition(i, { operator: v as RuleCondition["operator"] })
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATOR_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    placeholder="Value"
                    value={cond.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCondition(i)}
                    disabled={formConditions.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Agency Target */}
            <div className="space-y-1.5">
              <Label>Target Agency ID</Label>
              <Input
                value={formTargetAgencyId}
                onChange={(e) => setFormTargetAgencyId(e.target.value)}
                placeholder="Agency UUID"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                The agency that matching messages will be routed to.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !formName.trim() ||
                formConditions.filter((c) => c.value.trim()).length === 0 ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {editingRule ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rule</DialogTitle>
            <DialogDescription>
              This rule will be permanently deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate({ id: deleteConfirmId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
