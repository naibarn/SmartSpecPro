import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SocialPageShell } from "@/components/social/SocialPageShell";
import {
  formatAutomationActionMode,
  formatAutomationApprovalStatus,
  formatAutomationTriggerType,
  formatRelativeTime,
  getAutomationActionTone,
  getAutomationApprovalStatusTone,
  mapAutomationApprovalFilterToBackendStatus,
  truncateText,
  type SocialAutomationActionMode,
  type SocialAutomationApprovalStatus,
  type SocialAutomationApprovalSummary,
  type SocialAutomationPageOption,
  type SocialAutomationRuleSummary,
  type SocialAutomationTriggerType,
} from "@/types/social";

const DEFAULT_BLOCKED_CATEGORIES = ["billing", "legal", "harassment", "refund", "complaint"] as const;
const APPROVAL_LIMIT = 20;

type RuleFormState = {
  name: string;
  pageId: string;
  triggerType: SocialAutomationTriggerType;
  actionMode: SocialAutomationActionMode;
  keywordText: string;
  threshold: string;
  timeoutMinutes: string;
  toneGuide: string;
  blockedCategories: Record<string, boolean>;
};

type ApprovalDecisionState = {
  approval: SocialAutomationApprovalSummary;
  editedContent: string;
};

type RejectionState = {
  approval: SocialAutomationApprovalSummary;
  note: string;
};

function confidenceLabel(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined || Number.isNaN(confidence)) return "—";
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`;
}

function parseRuleConditions(rule: SocialAutomationRuleSummary): {
  keywordText: string;
  threshold: string;
  timeoutMinutes: string;
} {
  const conditions = rule.conditions ?? {};
  const keywords = Array.isArray(conditions.keywords) ? conditions.keywords.filter((value): value is string => typeof value === "string") : [];
  return {
    keywordText: keywords.join(", "),
    threshold: typeof conditions.threshold === "number" ? String(conditions.threshold) : typeof conditions.threshold === "string" ? conditions.threshold : "1",
    timeoutMinutes: typeof conditions.timeoutMinutes === "number" ? String(conditions.timeoutMinutes) : typeof conditions.timeoutMinutes === "string" ? conditions.timeoutMinutes : "30",
  };
}

function parsePolicyConfig(rule: SocialAutomationRuleSummary): {
  toneGuide: string;
  blockedCategories: Record<string, boolean>;
} {
  const policyConfig = rule.policyConfig ?? {};
  const blockedCategories = new Set<string>(
    Array.isArray(policyConfig.blockedCategories) ? policyConfig.blockedCategories.filter((value): value is string => typeof value === "string") : DEFAULT_BLOCKED_CATEGORIES,
  );

  const blockedSelection = DEFAULT_BLOCKED_CATEGORIES.reduce<Record<string, boolean>>((acc, category) => {
    acc[category] = blockedCategories.has(category);
    return acc;
  }, {});

  return {
    toneGuide: typeof policyConfig.toneGuide === "string" ? policyConfig.toneGuide : "Professional, friendly, helpful",
    blockedCategories: blockedSelection,
  };
}

function buildRuleFormState(rule?: SocialAutomationRuleSummary | null): RuleFormState {
  if (!rule) {
    return {
      name: "",
      pageId: "all",
      triggerType: "new_message",
      actionMode: "draft_only",
      keywordText: "",
      threshold: "1",
      timeoutMinutes: "30",
      toneGuide: "Professional, friendly, helpful",
      blockedCategories: DEFAULT_BLOCKED_CATEGORIES.reduce<Record<string, boolean>>((acc, category) => {
        acc[category] = true;
        return acc;
      }, {}),
    };
  }

  const conditions = parseRuleConditions(rule);
  const policy = parsePolicyConfig(rule);

  return {
    name: rule.name,
    pageId: rule.pageId ? String(rule.pageId) : "all",
    triggerType: (rule.triggerType as SocialAutomationTriggerType) || "new_message",
    actionMode: (rule.actionMode as SocialAutomationActionMode) || "draft_only",
    keywordText: conditions.keywordText,
    threshold: conditions.threshold,
    timeoutMinutes: conditions.timeoutMinutes,
    toneGuide: policy.toneGuide,
    blockedCategories: policy.blockedCategories,
  };
}

function buildConditionsPayload(form: RuleFormState): Record<string, unknown> {
  if (form.triggerType === "keyword_match") {
    return {
      keywords: form.keywordText
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    };
  }

  if (form.triggerType === "unread_timeout") {
    return {
      threshold: Number.parseInt(form.threshold, 10) || 1,
      timeoutMinutes: Number.parseInt(form.timeoutMinutes, 10) || 30,
    };
  }

  return {};
}

function buildPolicyPayload(form: RuleFormState): Record<string, unknown> {
  return {
    toneGuide: form.toneGuide.trim() || "Professional, friendly, helpful",
    blockedCategories: DEFAULT_BLOCKED_CATEGORIES.filter((category) => form.blockedCategories[category]),
  };
}

function AutomationToneBadge({ label, tone }: { label: string; tone: string }) {
  return <Badge className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>{label}</Badge>;
}

function RuleDialog({
  open,
  mode,
  form,
  pages,
  saving,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  form: RuleFormState;
  pages: SocialAutomationPageOption[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (next: RuleFormState) => void;
  onSubmit: () => void;
}) {
  const isKeywordRule = form.triggerType === "keyword_match";
  const isTimeoutRule = form.triggerType === "unread_timeout";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add automation rule" : "Edit automation rule"}</DialogTitle>
          <DialogDescription>
            Keep the rule model provider-neutral so future channels can reuse the same structure.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Rule name</span>
            <Input
              value={form.name}
              onChange={(event) => onChange({ ...form, name: event.target.value })}
              placeholder="Escalate refund requests"
              className="rounded-xl border-slate-200 bg-white"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Channel</span>
            <Select value={form.pageId} onValueChange={(value) => onChange({ ...form, pageId: value })}>
              <SelectTrigger className="rounded-xl border-slate-200 bg-white">
                <SelectValue placeholder="All channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                {pages.map((page) => (
                  <SelectItem key={page.id} value={String(page.id)}>
                    {page.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Trigger</span>
            <Select
              value={form.triggerType}
              onValueChange={(value) =>
                onChange({
                  ...form,
                  triggerType: value as SocialAutomationTriggerType,
                })
              }
            >
              <SelectTrigger className="rounded-xl border-slate-200 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new_message">New message</SelectItem>
                <SelectItem value="keyword_match">Keyword match</SelectItem>
                <SelectItem value="unread_timeout">Unread timeout</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Action mode</span>
            <Select
              value={form.actionMode}
              onValueChange={(value) =>
                onChange({
                  ...form,
                  actionMode: value as SocialAutomationActionMode,
                })
              }
            >
              <SelectTrigger className="rounded-xl border-slate-200 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="draft_only">Draft only</SelectItem>
                <SelectItem value="approval_required">Approval required</SelectItem>
                <SelectItem value="auto_send">Auto send</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <div className="md:col-span-2 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Conditions</h3>
                <p className="text-xs text-slate-500">These are generic so future providers can reuse them.</p>
              </div>
              <Badge className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100">
                {formatAutomationTriggerType(form.triggerType)}
              </Badge>
            </div>

            {isKeywordRule ? (
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Keywords</span>
                <Textarea
                  value={form.keywordText}
                  onChange={(event) => onChange({ ...form, keywordText: event.target.value })}
                  placeholder="refund, pricing, cancel"
                  className="min-h-24 rounded-2xl border-slate-200 bg-white"
                />
              </label>
            ) : null}

            {isTimeoutRule ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Unread threshold</span>
                  <Input
                    type="number"
                    min={1}
                    value={form.threshold}
                    onChange={(event) => onChange({ ...form, threshold: event.target.value })}
                    className="rounded-xl border-slate-200 bg-white"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Timeout minutes</span>
                  <Input
                    type="number"
                    min={1}
                    value={form.timeoutMinutes}
                    onChange={(event) => onChange({ ...form, timeoutMinutes: event.target.value })}
                    className="rounded-xl border-slate-200 bg-white"
                  />
                </label>
              </div>
            ) : null}

            {!isKeywordRule && !isTimeoutRule ? (
              <p className="text-sm text-slate-500">New message rules are intentionally broad and match inbound traffic by default.</p>
            ) : null}
          </div>

          <div className="md:col-span-2 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Policy</h3>
                <p className="text-xs text-slate-500">Blocked categories and tone guidance live here for reuse by any provider.</p>
              </div>
              <Bot className="h-5 w-5 text-slate-400" />
            </div>
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Tone guide</span>
              <Textarea
                value={form.toneGuide}
                onChange={(event) => onChange({ ...form, toneGuide: event.target.value })}
                className="min-h-20 rounded-2xl border-slate-200 bg-white"
                placeholder="Professional, friendly, helpful"
              />
            </label>
            <div className="space-y-3">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Blocked categories</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {DEFAULT_BLOCKED_CATEGORIES.map((category) => (
                  <label key={category} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <Checkbox
                      checked={Boolean(form.blockedCategories[category])}
                      onCheckedChange={(checked) =>
                        onChange({
                          ...form,
                          blockedCategories: {
                            ...form.blockedCategories,
                            [category]: Boolean(checked),
                          },
                        })
                      }
                    />
                    <span className="text-sm text-slate-700">{category}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-xl border-slate-200" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" className="rounded-xl bg-slate-900 text-white hover:bg-slate-800" onClick={onSubmit} disabled={saving}>
            {saving ? "Saving..." : mode === "create" ? "Create rule" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApprovalDialog({
  open,
  approval,
  mode,
  value,
  saving,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  approval: SocialAutomationApprovalSummary | null;
  mode: "approve" | "reject";
  value: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "approve" ? "Approve action" : "Reject action"}</DialogTitle>
          <DialogDescription>
            {approval ? `${approval.entityType} · ${approval.pageName || approval.providerPageId || "Channel"}` : "Review the pending automation decision."}
          </DialogDescription>
        </DialogHeader>

        {approval ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getAutomationApprovalStatusTone(approval.status)}`}>
                  {formatAutomationApprovalStatus(approval.status)}
                </Badge>
                <Badge className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100">
                  {confidenceLabel(approval.confidence)}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-slate-700">
                {truncateText(approval.proposedContent || "No proposed content", 220)}
              </p>
            </div>

            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {mode === "approve" ? "Edited content" : "Rejection note"}
              </span>
              <Textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="min-h-40 rounded-2xl border-slate-200 bg-white"
                placeholder={mode === "approve" ? "Edit the approved content before sending" : "Why was this rejected?"}
              />
            </label>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-xl border-slate-200" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            className={mode === "approve" ? "rounded-xl bg-slate-900 text-white hover:bg-slate-800" : "rounded-xl bg-rose-600 text-white hover:bg-rose-700"}
            onClick={onSubmit}
            disabled={saving}
          >
            {saving ? "Saving..." : mode === "approve" ? "Approve & Send" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SocialAutomation() {
  const utils = trpc.useUtils();
  const [selectedPageId, setSelectedPageId] = useState<number | null | undefined>(undefined);
  const [approvalStatus, setApprovalStatus] = useState<"all" | SocialAutomationApprovalStatus>("pending");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleDialogMode, setRuleDialogMode] = useState<"create" | "edit">("create");
  const [editingRule, setEditingRule] = useState<SocialAutomationRuleSummary | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(buildRuleFormState());
  const [approveDialog, setApproveDialog] = useState<ApprovalDecisionState | null>(null);
  const [rejectDialog, setRejectDialog] = useState<RejectionState | null>(null);

  const pagesQuery = trpc.socialAutomation.listPages.useQuery();
  const rulesQuery = trpc.socialAutomation.listRules.useQuery(
    { pageId: selectedPageId === undefined ? null : selectedPageId },
    { refetchInterval: 20_000, refetchIntervalInBackground: false },
  );

  const approvalsQuery = trpc.socialAutomation.listApprovals.useInfiniteQuery(
    {
      pageId: selectedPageId === undefined ? null : selectedPageId,
      status: mapAutomationApprovalFilterToBackendStatus(approvalStatus),
      limit: APPROVAL_LIMIT,
    },
    {
      initialCursor: null,
      refetchInterval: 20_000,
      refetchIntervalInBackground: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );

  const createRuleMutation = trpc.socialAutomation.createRule.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.socialAutomation.listRules.invalidate(), utils.socialAutomation.listPages.invalidate()]);
      setRuleDialogOpen(false);
      setEditingRule(null);
      toast.success("Rule created");
    },
    onError: (error) => toast.error(error.message || "Failed to create rule"),
  });

  const updateRuleMutation = trpc.socialAutomation.updateRule.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.socialAutomation.listRules.invalidate(), utils.socialAutomation.listPages.invalidate()]);
      setRuleDialogOpen(false);
      setEditingRule(null);
      toast.success("Rule updated");
    },
    onError: (error) => toast.error(error.message || "Failed to update rule"),
  });

  const toggleRuleMutation = trpc.socialAutomation.toggleRule.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.socialAutomation.listRules.invalidate(), utils.socialAutomation.listPages.invalidate()]);
    },
    onError: (error) => toast.error(error.message || "Failed to update rule"),
  });

  const deleteRuleMutation = trpc.socialAutomation.deleteRule.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.socialAutomation.listRules.invalidate(), utils.socialAutomation.listPages.invalidate()]);
      toast.success("Rule deleted");
    },
    onError: (error) => toast.error(error.message || "Failed to delete rule"),
  });

  const approveActionMutation = trpc.socialAutomation.approveAction.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialAutomation.listApprovals.invalidate(),
        utils.socialAutomation.listRules.invalidate(),
        utils.socialAutomation.listPages.invalidate(),
      ]);
      setApproveDialog(null);
      toast.success("Action approved");
    },
    onError: (error) => toast.error(error.message || "Failed to approve action"),
  });

  const rejectActionMutation = trpc.socialAutomation.rejectAction.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.socialAutomation.listApprovals.invalidate(), utils.socialAutomation.listRules.invalidate()]);
      setRejectDialog(null);
      toast.success("Action rejected");
    },
    onError: (error) => toast.error(error.message || "Failed to reject action"),
  });

  const pages = useMemo<SocialAutomationPageOption[]>(() => pagesQuery.data ?? [], [pagesQuery.data]);
  const rules = useMemo<SocialAutomationRuleSummary[]>(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const approvals = useMemo<SocialAutomationApprovalSummary[]>(
    () => approvalsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [approvalsQuery.data?.pages],
  );

  useEffect(() => {
    if (selectedPageId !== undefined) return;
    if (pages.length === 0) return;
    setSelectedPageId(pages[0]?.id ?? null);
  }, [pages, selectedPageId]);

  useEffect(() => {
    if (selectedPageId === null || selectedPageId === undefined) return;
    if (pages.some((page) => page.id === selectedPageId)) return;
    setSelectedPageId(pages[0]?.id ?? null);
  }, [pages, selectedPageId]);

  const selectedPage = selectedPageId === null || selectedPageId === undefined
    ? null
    : pages.find((page) => page.id === selectedPageId) ?? null;
  const enabledRulesCount = rules.filter((rule) => rule.isEnabled).length;
  const autoSendRulesCount = rules.filter((rule) => rule.actionMode === "auto_send").length;
  const pendingApprovalsCount = approvals.filter((approval) => approval.status === "pending").length;
  const automationStats = [
    { label: "Rules", value: rules.length, color: "bg-violet-500" },
    { label: "Enabled", value: enabledRulesCount, color: "bg-emerald-500" },
    { label: "Pending", value: pendingApprovalsCount, color: "bg-amber-500" },
    { label: "Auto-send", value: autoSendRulesCount, color: "bg-cyan-500" },
  ];
  const automationMax = Math.max(...automationStats.map((stat) => stat.value), 1);
  const hero = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-4 xl:col-span-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-violet-600 shadow-sm shadow-violet-200/60">
            <Workflow className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
            Policy engine
          </p>
        </div>
        <p className="mt-2 text-2xl font-semibold text-slate-900">
          {rules.length} rule{rules.length === 1 ? "" : "s"} covering the social workspace
        </p>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Keep the rules provider-neutral now so future channels can inherit the same approval and automation model later.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {selectedPage?.label ?? "All channels"}
          </Badge>
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {enabledRulesCount} enabled
          </Badge>
        </div>
        <div className="mt-4 space-y-2">
          {automationStats.map((stat) => (
            <div key={stat.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>{stat.label}</span>
                <span>{stat.value}</span>
              </div>
              <div className="h-2 rounded-full bg-white/90">
                <div
                  className={`h-2 rounded-full ${stat.color}`}
                  style={{ width: `${Math.max((stat.value / automationMax) * 100, stat.value > 0 ? 22 : 8)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pending approvals</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{pendingApprovalsCount}</p>
        <p className="mt-2 text-sm text-slate-500">Actions waiting on human review.</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-amber-700">
          <ShieldCheck className="h-4 w-4" />
          Review gate
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Auto-send</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{autoSendRulesCount}</p>
        <p className="mt-2 text-sm text-slate-500">Rules allowed to send automatically when confidence is high enough.</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-cyan-700">
          <Bot className="h-4 w-4" />
          Fast lane
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Channel scope</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{pages.length}</p>
        <p className="mt-2 text-sm text-slate-500">Channels available for reuse across future providers.</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-700">
          <ChevronRight className="h-4 w-4" />
          Provider-neutral
        </div>
      </div>
    </div>
  );

  const openCreateRuleDialog = () => {
    setEditingRule(null);
    setRuleDialogMode("create");
    const nextForm = buildRuleFormState();
    nextForm.pageId = selectedPageId === null || selectedPageId === undefined ? "all" : String(selectedPageId);
    setRuleForm(nextForm);
    setRuleDialogOpen(true);
  };

  const openEditRuleDialog = (rule: SocialAutomationRuleSummary) => {
    setEditingRule(rule);
    setRuleDialogMode("edit");
    setRuleForm(buildRuleFormState(rule));
    setRuleDialogOpen(true);
  };

  const submitRule = async () => {
    const payload = {
      name: ruleForm.name.trim(),
      pageId: ruleForm.pageId === "all" ? null : Number(ruleForm.pageId),
      triggerType: ruleForm.triggerType,
      conditions: buildConditionsPayload(ruleForm),
      actionMode: ruleForm.actionMode,
      policyConfig: buildPolicyPayload(ruleForm),
    };

    if (ruleDialogMode === "create") {
      await createRuleMutation.mutateAsync(payload);
      return;
    }

    if (!editingRule) return;
    await updateRuleMutation.mutateAsync({
      ruleId: editingRule.id,
      name: payload.name,
      conditions: payload.conditions,
      actionMode: payload.actionMode,
      policyConfig: payload.policyConfig,
    });
  };

  const confirmDeleteRule = async (ruleId: number) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this automation rule?")) return;
    await deleteRuleMutation.mutateAsync({ ruleId });
  };

  const openApproveDialog = (approval: SocialAutomationApprovalSummary) => {
    setApproveDialog({
      approval,
      editedContent: approval.proposedContent || "",
    });
  };

  const openRejectDialog = (approval: SocialAutomationApprovalSummary) => {
    setRejectDialog({
      approval,
      note: "",
    });
  };

  const approvalPages = approvalsQuery.data?.pages ?? [];
  const hasMoreApprovals = approvalPages.at(-1)?.hasMore ?? false;

  return (
    <SocialPageShell
      icon={Workflow}
      title="Social Automation"
      eyebrow="Policy engine"
      description="Manage provider-neutral rules, keep approval work in one place, and leave room for future channels without rewriting the model."
      tone="automation"
      badge={
        <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
          {selectedPage ? selectedPage.label : "All channels"}
        </Badge>
      }
      actions={
        <>
          <label className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Channel</span>
            <Select
              value={selectedPageId === null || selectedPageId === undefined ? "all" : String(selectedPageId)}
              onValueChange={(value) => setSelectedPageId(value === "all" ? null : Number(value))}
            >
              <SelectTrigger className="w-[240px] rounded-xl border-slate-200 bg-white">
                <SelectValue placeholder="All channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                {pages.map((page) => (
                  <SelectItem key={page.id} value={String(page.id)}>
                    {page.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-xl border-slate-200 bg-white"
            onClick={() => {
              void pagesQuery.refetch();
              void rulesQuery.refetch();
              void approvalsQuery.refetch();
            }}
          >
            <RefreshCcw className="h-4 w-4" />
          Refresh
        </Button>
        </>
      }
      hero={hero}
    >
        {selectedPage?.aiActionMode === "off" ? (
          <Card className="border-amber-200 bg-amber-50 text-amber-900">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="font-semibold">Automation is disabled for this channel</h2>
                <p className="text-sm text-amber-800">
                  The selected channel is currently set to <code>off</code>. Rules can still be edited, but they will not execute until the channel is re-enabled.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-slate-200/80 bg-white/85 shadow-lg shadow-slate-200/60 backdrop-blur">
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-lg text-slate-900">Automation Rules</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Build broad rules that can be extended to other social providers later without changing the core model.
              </p>
            </div>
            <Button type="button" className="gap-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800" onClick={openCreateRuleDialog}>
              <Plus className="h-4 w-4" />
              Add Rule
            </Button>
          </CardHeader>
          <CardContent className="border-t border-slate-100 pt-5">
            {rules.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm text-slate-500">
                No automation rules yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 bg-white">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Rule</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Channel</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Trigger</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Action</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rules.map((rule) => (
                      <tr key={rule.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                              <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-slate-900">{rule.name}</p>
                                <Badge className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100">
                                  {rule.pageId ? "Scoped" : "Tenant-wide"}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-500">Updated {formatRelativeTime(rule.updatedAt)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          {rule.pageName || rule.providerPageId || "All channels"}
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                              {formatAutomationTriggerType(rule.triggerType)}
                            </Badge>
                            {rule.triggerType === "keyword_match" ? (
                              <p className="text-xs text-slate-500">{truncateText(String(rule.conditions?.keywords ?? "").replaceAll(",", ", "), 48)}</p>
                            ) : rule.triggerType === "unread_timeout" ? (
                              <p className="text-xs text-slate-500">
                                {String(rule.conditions?.threshold ?? 1)} unread · {String(rule.conditions?.timeoutMinutes ?? 30)} min
                              </p>
                            ) : (
                              <p className="text-xs text-slate-500">Matches inbound messages broadly.</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <AutomationToneBadge label={formatAutomationActionMode(rule.actionMode)} tone={getAutomationActionTone(rule.actionMode)} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={rule.isEnabled}
                              onCheckedChange={(checked) => {
                                void toggleRuleMutation.mutateAsync({
                                  ruleId: rule.id,
                                  isEnabled: checked,
                                });
                              }}
                            />
                            <Badge className={`rounded-full border px-2.5 py-1 text-xs font-medium ${rule.isEnabled ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                              {rule.isEnabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-xl border-slate-200"
                              onClick={() => openEditRuleDialog(rule)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-xl border-slate-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => void confirmDeleteRule(rule.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/85 shadow-lg shadow-slate-200/60 backdrop-blur">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg text-slate-900">Approval Queue</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Review AI-generated actions before they are sent or published.
                </p>
              </div>
              <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                {approvals.length} shown
              </Badge>
            </div>

            <Tabs value={approvalStatus} onValueChange={(value) => setApprovalStatus(value as "all" | SocialAutomationApprovalStatus)}>
              <TabsList className="grid w-full grid-cols-5 rounded-2xl bg-slate-100 p-1">
                <TabsTrigger value="pending" className="rounded-xl">Pending</TabsTrigger>
                <TabsTrigger value="approved" className="rounded-xl">Approved</TabsTrigger>
                <TabsTrigger value="rejected" className="rounded-xl">Rejected</TabsTrigger>
                <TabsTrigger value="expired" className="rounded-xl">Expired</TabsTrigger>
                <TabsTrigger value="all" className="rounded-xl">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>

          <CardContent className="border-t border-slate-100 pt-5">
            {approvals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm text-slate-500">
                No approvals in this view.
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 bg-white">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Entity</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Proposed content</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Confidence</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Channel</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Created</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {approvals.map((approval) => {
                        const isPending = approval.status === "pending";
                        return (
                          <tr key={approval.id} className="hover:bg-slate-50/60">
                            <td className="px-4 py-4">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                                    {approval.entityType}
                                  </Badge>
                                  <Badge className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getAutomationApprovalStatusTone(approval.status)}`}>
                                    {formatAutomationApprovalStatus(approval.status)}
                                  </Badge>
                                </div>
                                <span className="text-xs text-slate-500">ID #{approval.entityId}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">
                              {truncateText(approval.proposedContent || "—", 72)}
                              {approval.decisionNote ? <div className="mt-1 text-xs text-slate-500">Note: {truncateText(approval.decisionNote, 52)}</div> : null}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">{confidenceLabel(approval.confidence)}</td>
                            <td className="px-4 py-4 text-sm text-slate-600">{approval.pageName || approval.providerPageId || "Channel"}</td>
                            <td className="px-4 py-4 text-sm text-slate-600">{formatRelativeTime(approval.createdAt)}</td>
                            <td className="px-4 py-4">
                              <div className="flex justify-end gap-2">
                                {isPending ? (
                                  <>
                                    <Button
                                      type="button"
                                      className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                                      onClick={() => openApproveDialog(approval)}
                                    >
                                      Approve
                                      <ChevronRight className="ml-2 h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-xl border-slate-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                      onClick={() => openRejectDialog(approval)}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                ) : (
                                  <span className="text-sm text-slate-400">No actions available</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {hasMoreApprovals ? (
                  <div className="mt-4 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-slate-200 bg-white"
                      onClick={() => void approvalsQuery.fetchNextPage()}
                      disabled={approvalsQuery.isFetchingNextPage}
                    >
                      {approvalsQuery.isFetchingNextPage ? "Loading..." : "Load more"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      <RuleDialog
        open={ruleDialogOpen}
        mode={ruleDialogMode}
        form={ruleForm}
        pages={pages}
        saving={createRuleMutation.isPending || updateRuleMutation.isPending}
        onOpenChange={setRuleDialogOpen}
        onChange={setRuleForm}
        onSubmit={() => {
          void submitRule();
        }}
      />

      <ApprovalDialog
        open={approveDialog !== null}
        approval={approveDialog?.approval ?? null}
        mode="approve"
        value={approveDialog?.editedContent ?? ""}
        saving={approveActionMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setApproveDialog(null);
        }}
        onChange={(value) => setApproveDialog((current) => (current ? { ...current, editedContent: value } : current))}
        onSubmit={() => {
          if (!approveDialog) return;
          void approveActionMutation.mutateAsync({
            approvalId: approveDialog.approval.id,
            editedContent: approveDialog.editedContent,
          });
        }}
      />

      <ApprovalDialog
        open={rejectDialog !== null}
        approval={rejectDialog?.approval ?? null}
        mode="reject"
        value={rejectDialog?.note ?? ""}
        saving={rejectActionMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setRejectDialog(null);
        }}
        onChange={(value) => setRejectDialog((current) => (current ? { ...current, note: value } : current))}
        onSubmit={() => {
          if (!rejectDialog) return;
          void rejectActionMutation.mutateAsync({
            approvalId: rejectDialog.approval.id,
            note: rejectDialog.note,
          });
        }}
      />
    </SocialPageShell>
  );
}
