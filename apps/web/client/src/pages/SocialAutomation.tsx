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
import { DashboardCard } from "@/components/dashboard";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const DEFAULT_BLOCKED_CATEGORIES = [
  "billing",
  "legal",
  "harassment",
  "refund",
  "complaint",
] as const;
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
  if (
    confidence === null ||
    confidence === undefined ||
    Number.isNaN(confidence)
  )
    return "—";
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`;
}

function parseRuleConditions(rule: SocialAutomationRuleSummary): {
  keywordText: string;
  threshold: string;
  timeoutMinutes: string;
} {
  const conditions = rule.conditions ?? {};
  const keywords = Array.isArray(conditions.keywords)
    ? conditions.keywords.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  return {
    keywordText: keywords.join(", "),
    threshold:
      typeof conditions.threshold === "number"
        ? String(conditions.threshold)
        : typeof conditions.threshold === "string"
          ? conditions.threshold
          : "1",
    timeoutMinutes:
      typeof conditions.timeoutMinutes === "number"
        ? String(conditions.timeoutMinutes)
        : typeof conditions.timeoutMinutes === "string"
          ? conditions.timeoutMinutes
          : "30",
  };
}

function parsePolicyConfig(rule: SocialAutomationRuleSummary): {
  toneGuide: string;
  blockedCategories: Record<string, boolean>;
} {
  const policyConfig = rule.policyConfig ?? {};
  const blockedCategories = new Set<string>(
    Array.isArray(policyConfig.blockedCategories)
      ? policyConfig.blockedCategories.filter(
          (value): value is string => typeof value === "string"
        )
      : DEFAULT_BLOCKED_CATEGORIES
  );

  const blockedSelection = DEFAULT_BLOCKED_CATEGORIES.reduce<
    Record<string, boolean>
  >((acc, category) => {
    acc[category] = blockedCategories.has(category);
    return acc;
  }, {});

  return {
    toneGuide:
      typeof policyConfig.toneGuide === "string" ? policyConfig.toneGuide : "",
    blockedCategories: blockedSelection,
  };
}

function buildRuleFormState(
  rule?: SocialAutomationRuleSummary | null
): RuleFormState {
  if (!rule) {
    return {
      name: "",
      pageId: "all",
      triggerType: "new_message",
      actionMode: "draft_only",
      keywordText: "",
      threshold: "1",
      timeoutMinutes: "30",
      toneGuide: "",
      blockedCategories: DEFAULT_BLOCKED_CATEGORIES.reduce<
        Record<string, boolean>
      >((acc, category) => {
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
    triggerType:
      (rule.triggerType as SocialAutomationTriggerType) || "new_message",
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
        .map(item => item.trim())
        .filter(item => item.length > 0),
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
    blockedCategories: DEFAULT_BLOCKED_CATEGORIES.filter(
      category => form.blockedCategories[category]
    ),
  };
}

function AutomationToneBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <Badge
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}
    >
      {label}
    </Badge>
  );
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
  const { t } = useScopedTranslation("social");
  const isKeywordRule = form.triggerType === "keyword_match";
  const isTimeoutRule = form.triggerType === "unread_timeout";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? t("automation.ruleDialog.createTitle")
              : t("automation.ruleDialog.editTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("automation.ruleDialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              {t("automation.ruleDialog.ruleName")}
            </span>
            <Input
              value={form.name}
              onChange={event =>
                onChange({ ...form, name: event.target.value })
              }
              placeholder={t("automation.ruleDialog.ruleNamePlaceholder")}
              className="rounded-xl border-slate-200 bg-white"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              {t("automation.ruleDialog.channel")}
            </span>
            <Select
              value={form.pageId}
              onValueChange={value => onChange({ ...form, pageId: value })}
            >
              <SelectTrigger className="rounded-xl border-slate-200 bg-white">
                <SelectValue
                  placeholder={t("automation.actions.allChannels")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("automation.actions.allChannels")}
                </SelectItem>
                {pages.map(page => (
                  <SelectItem key={page.id} value={String(page.id)}>
                    {page.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              {t("automation.ruleDialog.trigger")}
            </span>
            <Select
              value={form.triggerType}
              onValueChange={value =>
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
                <SelectItem value="new_message">
                  {t("automation.trigger.newMessage")}
                </SelectItem>
                <SelectItem value="keyword_match">
                  {t("automation.trigger.keywordMatch")}
                </SelectItem>
                <SelectItem value="unread_timeout">
                  {t("automation.trigger.unreadTimeout")}
                </SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              {t("automation.ruleDialog.actionMode")}
            </span>
            <Select
              value={form.actionMode}
              onValueChange={value =>
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
                <SelectItem value="off">
                  {t("automation.actionMode.off")}
                </SelectItem>
                <SelectItem value="draft_only">
                  {t("automation.actionMode.draftOnly")}
                </SelectItem>
                <SelectItem value="approval_required">
                  {t("automation.actionMode.approvalRequired")}
                </SelectItem>
                <SelectItem value="auto_send">
                  {t("automation.actionMode.autoSend")}
                </SelectItem>
              </SelectContent>
            </Select>
          </label>

          <div className="md:col-span-2 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {t("automation.ruleDialog.conditions")}
                </h3>
                <p className="text-xs text-slate-500">
                  {t("automation.ruleDialog.conditionsDescription")}
                </p>
              </div>
              <Badge className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100">
                {formatAutomationTriggerType(form.triggerType)}
              </Badge>
            </div>

            {isKeywordRule ? (
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  {t("automation.ruleDialog.keywords")}
                </span>
                <Textarea
                  value={form.keywordText}
                  onChange={event =>
                    onChange({ ...form, keywordText: event.target.value })
                  }
                  placeholder={t("automation.ruleDialog.keywordsPlaceholder")}
                  className="min-h-24 rounded-2xl border-slate-200 bg-white"
                />
              </label>
            ) : null}

            {isTimeoutRule ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    {t("automation.ruleDialog.unreadThreshold")}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={form.threshold}
                    onChange={event =>
                      onChange({ ...form, threshold: event.target.value })
                    }
                    className="rounded-xl border-slate-200 bg-white"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    {t("automation.ruleDialog.timeoutMinutes")}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={form.timeoutMinutes}
                    onChange={event =>
                      onChange({ ...form, timeoutMinutes: event.target.value })
                    }
                    className="rounded-xl border-slate-200 bg-white"
                  />
                </label>
              </div>
            ) : null}

            {!isKeywordRule && !isTimeoutRule ? (
              <p className="text-sm text-slate-500">
                {t("automation.ruleDialog.newMessageDescription")}
              </p>
            ) : null}
          </div>

          <div className="md:col-span-2 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {t("automation.ruleDialog.policy")}
                </h3>
                <p className="text-xs text-slate-500">
                  {t("automation.ruleDialog.policyDescription")}
                </p>
              </div>
              <Bot className="h-5 w-5 text-slate-400" />
            </div>
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {t("automation.ruleDialog.toneGuide")}
              </span>
              <Textarea
                value={form.toneGuide}
                onChange={event =>
                  onChange({ ...form, toneGuide: event.target.value })
                }
                className="min-h-20 rounded-2xl border-slate-200 bg-white"
                placeholder={t("automation.ruleDialog.toneGuidePlaceholder")}
              />
            </label>
            <div className="space-y-3">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {t("automation.ruleDialog.blockedCategories")}
              </span>
              <div className="grid gap-3 sm:grid-cols-2">
                {DEFAULT_BLOCKED_CATEGORIES.map(category => (
                  <label
                    key={category}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <Checkbox
                      checked={Boolean(form.blockedCategories[category])}
                      onCheckedChange={checked =>
                        onChange({
                          ...form,
                          blockedCategories: {
                            ...form.blockedCategories,
                            [category]: Boolean(checked),
                          },
                        })
                      }
                    />
                    <span className="text-sm text-slate-700">
                      {t(`automation.ruleDialog.categories.${category}`)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-slate-200"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("automation.ruleDialog.cancel")}
          </Button>
          <Button
            type="button"
            className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            onClick={onSubmit}
            disabled={saving}
          >
            {saving
              ? t("automation.ruleDialog.saving")
              : mode === "create"
                ? t("automation.ruleDialog.create")
                : t("automation.ruleDialog.save")}
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
  const { t } = useScopedTranslation("social");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "approve"
              ? t("automation.approvalDialog.approveTitle")
              : t("automation.approvalDialog.rejectTitle")}
          </DialogTitle>
          <DialogDescription>
            {approval
              ? t("automation.approvalDialog.description", {
                  entityType: approval.entityType,
                  channel:
                    approval.pageName ||
                    approval.providerPageId ||
                    t("automation.common.channelFallback"),
                })
              : t("automation.approvals.description")}
          </DialogDescription>
        </DialogHeader>

        {approval ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getAutomationApprovalStatusTone(approval.status)}`}
                >
                  {formatAutomationApprovalStatus(approval.status)}
                </Badge>
                <Badge className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100">
                  {confidenceLabel(approval.confidence)}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-slate-700">
                {truncateText(
                  approval.proposedContent ||
                    t("automation.approvalDialog.noProposedContent"),
                  220
                )}
              </p>
            </div>

            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {mode === "approve"
                  ? t("automation.approvalDialog.editedContent")
                  : t("automation.approvalDialog.rejectionNote")}
              </span>
              <Textarea
                value={value}
                onChange={event => onChange(event.target.value)}
                className="min-h-40 rounded-2xl border-slate-200 bg-white"
                placeholder={
                  mode === "approve"
                    ? t("automation.approvalDialog.editedContentPlaceholder")
                    : t("automation.approvalDialog.rejectionNotePlaceholder")
                }
              />
            </label>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-slate-200"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("automation.approvalDialog.cancel")}
          </Button>
          <Button
            type="button"
            className={
              mode === "approve"
                ? "rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                : "rounded-xl bg-rose-600 text-white hover:bg-rose-700"
            }
            onClick={onSubmit}
            disabled={saving}
          >
            {saving
              ? t("automation.approvalDialog.saving")
              : mode === "approve"
                ? t("automation.approvalDialog.approveAndSend")
                : t("automation.approvalDialog.reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SocialAutomation() {
  const { t } = useScopedTranslation("social");
  const utils = trpc.useUtils();
  const [selectedPageId, setSelectedPageId] = useState<
    number | null | undefined
  >(undefined);
  const [approvalStatus, setApprovalStatus] = useState<
    "all" | SocialAutomationApprovalStatus
  >("pending");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleDialogMode, setRuleDialogMode] = useState<"create" | "edit">(
    "create"
  );
  const [editingRule, setEditingRule] =
    useState<SocialAutomationRuleSummary | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(buildRuleFormState());
  const [approveDialog, setApproveDialog] =
    useState<ApprovalDecisionState | null>(null);
  const [rejectDialog, setRejectDialog] = useState<RejectionState | null>(null);

  const pagesQuery = trpc.socialAutomation.listPages.useQuery();
  const rulesQuery = trpc.socialAutomation.listRules.useQuery(
    { pageId: selectedPageId === undefined ? null : selectedPageId },
    { refetchInterval: 20_000, refetchIntervalInBackground: false }
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
      getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    }
  );

  const createRuleMutation = trpc.socialAutomation.createRule.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialAutomation.listRules.invalidate(),
        utils.socialAutomation.listPages.invalidate(),
      ]);
      setRuleDialogOpen(false);
      setEditingRule(null);
      toast.success(t("automation.toasts.ruleCreated"));
    },
    onError: error =>
      toast.error(error.message || t("automation.toasts.createRuleFailed")),
  });

  const updateRuleMutation = trpc.socialAutomation.updateRule.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialAutomation.listRules.invalidate(),
        utils.socialAutomation.listPages.invalidate(),
      ]);
      setRuleDialogOpen(false);
      setEditingRule(null);
      toast.success(t("automation.toasts.ruleUpdated"));
    },
    onError: error =>
      toast.error(error.message || t("automation.toasts.updateRuleFailed")),
  });

  const toggleRuleMutation = trpc.socialAutomation.toggleRule.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialAutomation.listRules.invalidate(),
        utils.socialAutomation.listPages.invalidate(),
      ]);
    },
    onError: error =>
      toast.error(error.message || t("automation.toasts.toggleRuleFailed")),
  });

  const deleteRuleMutation = trpc.socialAutomation.deleteRule.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialAutomation.listRules.invalidate(),
        utils.socialAutomation.listPages.invalidate(),
      ]);
      toast.success(t("automation.toasts.ruleDeleted"));
    },
    onError: error =>
      toast.error(error.message || t("automation.toasts.deleteRuleFailed")),
  });

  const approveActionMutation = trpc.socialAutomation.approveAction.useMutation(
    {
      onSuccess: async () => {
        await Promise.all([
          utils.socialAutomation.listApprovals.invalidate(),
          utils.socialAutomation.listRules.invalidate(),
          utils.socialAutomation.listPages.invalidate(),
        ]);
        setApproveDialog(null);
        toast.success(t("automation.toasts.actionApproved"));
      },
      onError: error =>
        toast.error(
          error.message || t("automation.toasts.approveActionFailed")
        ),
    }
  );

  const rejectActionMutation = trpc.socialAutomation.rejectAction.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialAutomation.listApprovals.invalidate(),
        utils.socialAutomation.listRules.invalidate(),
      ]);
      setRejectDialog(null);
      toast.success(t("automation.toasts.actionRejected"));
    },
    onError: error =>
      toast.error(error.message || t("automation.toasts.rejectActionFailed")),
  });

  const pages = useMemo<SocialAutomationPageOption[]>(
    () => pagesQuery.data ?? [],
    [pagesQuery.data]
  );
  const rules = useMemo<SocialAutomationRuleSummary[]>(
    () => rulesQuery.data ?? [],
    [rulesQuery.data]
  );
  const approvals = useMemo<SocialAutomationApprovalSummary[]>(
    () => approvalsQuery.data?.pages.flatMap(page => page.items) ?? [],
    [approvalsQuery.data?.pages]
  );

  useEffect(() => {
    if (selectedPageId !== undefined) return;
    if (pages.length === 0) return;
    setSelectedPageId(pages[0]?.id ?? null);
  }, [pages, selectedPageId]);

  useEffect(() => {
    if (selectedPageId === null || selectedPageId === undefined) return;
    if (pages.some(page => page.id === selectedPageId)) return;
    setSelectedPageId(pages[0]?.id ?? null);
  }, [pages, selectedPageId]);

  const selectedPage =
    selectedPageId === null || selectedPageId === undefined
      ? null
      : (pages.find(page => page.id === selectedPageId) ?? null);
  const enabledRulesCount = rules.filter(rule => rule.isEnabled).length;
  const autoSendRulesCount = rules.filter(
    rule => rule.actionMode === "auto_send"
  ).length;
  const pendingApprovalsCount = approvals.filter(
    approval => approval.status === "pending"
  ).length;
  const automationStats = [
    {
      label: t("automation.stats.rules"),
      value: rules.length,
      color: "bg-violet-500",
    },
    {
      label: t("automation.stats.enabled"),
      value: enabledRulesCount,
      color: "bg-emerald-500",
    },
    {
      label: t("automation.stats.pending"),
      value: pendingApprovalsCount,
      color: "bg-amber-500",
    },
    {
      label: t("automation.stats.autoSend"),
      value: autoSendRulesCount,
      color: "bg-cyan-500",
    },
  ];
  const automationMax = Math.max(...automationStats.map(stat => stat.value), 1);
  const hero = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-4 xl:col-span-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-violet-600 shadow-sm shadow-violet-200/60">
            <Workflow className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
            {t("automation.hero.policyEngine")}
          </p>
        </div>
        <p className="mt-2 text-2xl font-semibold text-slate-900">
          {t("automation.hero.rulesCovering", { count: rules.length })}
        </p>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          {t("automation.hero.description")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {selectedPage?.label ?? t("automation.actions.allChannels")}
          </Badge>
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {t("automation.hero.enabled", { count: enabledRulesCount })}
          </Badge>
        </div>
        <div className="mt-4 space-y-2">
          {automationStats.map(stat => (
            <div key={stat.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>{stat.label}</span>
                <span>{stat.value}</span>
              </div>
              <div className="h-2 rounded-full bg-white/90">
                <div
                  className={`h-2 rounded-full ${stat.color}`}
                  style={{
                    width: `${Math.max((stat.value / automationMax) * 100, stat.value > 0 ? 22 : 8)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("automation.cards.pendingApprovals.title")}
        </p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">
          {pendingApprovalsCount}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {t("automation.cards.pendingApprovals.description")}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-amber-700">
          <ShieldCheck className="h-4 w-4" />
          {t("automation.cards.pendingApprovals.footer")}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("automation.cards.autoSend.title")}
        </p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">
          {autoSendRulesCount}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {t("automation.cards.autoSend.description")}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-cyan-700">
          <Bot className="h-4 w-4" />
          {t("automation.cards.autoSend.footer")}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("automation.cards.channelScope.title")}
        </p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">
          {pages.length}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {t("automation.cards.channelScope.description")}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-700">
          <ChevronRight className="h-4 w-4" />
          {t("automation.cards.channelScope.footer")}
        </div>
      </div>
    </div>
  );

  const openCreateRuleDialog = () => {
    setEditingRule(null);
    setRuleDialogMode("create");
    const nextForm = buildRuleFormState();
    nextForm.pageId =
      selectedPageId === null || selectedPageId === undefined
        ? "all"
        : String(selectedPageId);
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
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("automation.rules.confirmDelete"))
    )
      return;
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
      title={t("automation.title")}
      eyebrow={t("automation.eyebrow")}
      description={t("automation.description")}
      tone="automation"
      badge={
        <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
          {selectedPage ? selectedPage.label : t("automation.noPageSelected")}
        </Badge>
      }
      actions={
        <>
          <label className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              {t("automation.actions.channel")}
            </span>
            <Select
              value={
                selectedPageId === null || selectedPageId === undefined
                  ? "all"
                  : String(selectedPageId)
              }
              onValueChange={value =>
                setSelectedPageId(value === "all" ? null : Number(value))
              }
            >
              <SelectTrigger className="w-[240px] rounded-xl border-slate-200 bg-white">
                <SelectValue
                  placeholder={t("automation.actions.allChannels")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("automation.actions.allChannels")}
                </SelectItem>
                {pages.map(page => (
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
            {t("automation.actions.refresh")}
          </Button>
        </>
      }
      hero={hero}
    >
      {selectedPage?.aiActionMode === "off" ? (
        <DashboardCard className="border-amber-200 bg-amber-50 text-amber-900">
          <div className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-semibold">
                {t("automation.disabled.title")}
              </h2>
              <p className="text-sm text-amber-800">
                {t("automation.disabled.description")}
              </p>
            </div>
          </div>
        </DashboardCard>
      ) : null}

      <DashboardCard className="border-slate-200/80 bg-white/85 shadow-lg shadow-slate-200/60 backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg text-slate-900">
              {t("automation.rules.title")}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {t("automation.rules.description")}
            </p>
          </div>
          <Button
            type="button"
            className="gap-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            onClick={openCreateRuleDialog}
          >
            <Plus className="h-4 w-4" />
            {t("automation.rules.add")}
          </Button>
        </div>
        <div className="border-t border-slate-100 pt-5">
          {rules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm text-slate-500">
              {t("automation.rules.empty")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 bg-white">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {t("automation.rules.columns.rule")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {t("automation.rules.columns.channel")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {t("automation.rules.columns.trigger")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {t("automation.rules.columns.action")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {t("automation.rules.columns.status")}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {t("automation.rules.columns.controls")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rules.map(rule => (
                    <tr key={rule.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                            <ShieldCheck className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-900">
                                {rule.name}
                              </p>
                              <Badge className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100">
                                {rule.pageId
                                  ? t("automation.rules.scope.scoped")
                                  : t("automation.rules.scope.tenantWide")}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500">
                              {t("automation.rules.updated", {
                                time: formatRelativeTime(rule.updatedAt),
                              })}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {rule.pageName ||
                          rule.providerPageId ||
                          t("automation.rules.allChannels")}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                            {formatAutomationTriggerType(rule.triggerType)}
                          </Badge>
                          {rule.triggerType === "keyword_match" ? (
                            <p className="text-xs text-slate-500">
                              {truncateText(
                                String(
                                  rule.conditions?.keywords ?? ""
                                ).replaceAll(",", ", "),
                                48
                              )}
                            </p>
                          ) : rule.triggerType === "unread_timeout" ? (
                            <p className="text-xs text-slate-500">
                              {t("automation.rules.unreadSummary", {
                                threshold: String(
                                  rule.conditions?.threshold ?? 1
                                ),
                                minutes: String(
                                  rule.conditions?.timeoutMinutes ?? 30
                                ),
                              })}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-500">
                              {t("automation.rules.triggerBroad")}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <AutomationToneBadge
                          label={formatAutomationActionMode(rule.actionMode)}
                          tone={getAutomationActionTone(rule.actionMode)}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={rule.isEnabled}
                            onCheckedChange={checked => {
                              void toggleRuleMutation.mutateAsync({
                                ruleId: rule.id,
                                isEnabled: checked,
                              });
                            }}
                          />
                          <Badge
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${rule.isEnabled ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}
                          >
                            {rule.isEnabled
                              ? t("automation.rules.status.enabled")
                              : t("automation.rules.status.disabled")}
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
                            {t("automation.rules.edit")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl border-slate-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => void confirmDeleteRule(rule.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("automation.rules.delete")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DashboardCard>

      <DashboardCard className="border-slate-200/80 bg-white/85 shadow-lg shadow-slate-200/60 backdrop-blur">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg text-slate-900">
                {t("automation.approvals.title")}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {t("automation.approvals.description")}
              </p>
            </div>
            <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
              {t("automation.approvals.shown", { count: approvals.length })}
            </Badge>
          </div>

          <Tabs
            value={approvalStatus}
            onValueChange={value =>
              setApprovalStatus(value as "all" | SocialAutomationApprovalStatus)
            }
          >
            <TabsList className="grid w-full grid-cols-5 rounded-2xl bg-slate-100 p-1">
              <TabsTrigger value="pending" className="rounded-xl">
                {t("automation.tabs.pending")}
              </TabsTrigger>
              <TabsTrigger value="approved" className="rounded-xl">
                {t("automation.tabs.approved")}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="rounded-xl">
                {t("automation.tabs.rejected")}
              </TabsTrigger>
              <TabsTrigger value="expired" className="rounded-xl">
                {t("automation.tabs.expired")}
              </TabsTrigger>
              <TabsTrigger value="all" className="rounded-xl">
                {t("automation.tabs.all")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="border-t border-slate-100 pt-5">
          {approvals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm text-slate-500">
              {t("automation.approvals.empty")}
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 bg-white">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {t("automation.approvals.columns.entity")}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {t("automation.approvals.columns.proposedContent")}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {t("automation.approvals.columns.confidence")}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {t("automation.approvals.columns.channel")}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {t("automation.approvals.columns.created")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {t("automation.approvals.columns.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {approvals.map(approval => {
                      const isPending = approval.status === "pending";
                      return (
                        <tr key={approval.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                                  {approval.entityType}
                                </Badge>
                                <Badge
                                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getAutomationApprovalStatusTone(approval.status)}`}
                                >
                                  {formatAutomationApprovalStatus(
                                    approval.status
                                  )}
                                </Badge>
                              </div>
                              <span className="text-xs text-slate-500">
                                ID #{approval.entityId}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-700">
                            {truncateText(approval.proposedContent || "—", 72)}
                            {approval.decisionNote ? (
                              <div className="mt-1 text-xs text-slate-500">
                                {t("automation.approvals.note", {
                                  note: truncateText(approval.decisionNote, 52),
                                })}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-700">
                            {confidenceLabel(approval.confidence)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {approval.pageName ||
                              approval.providerPageId ||
                              t("automation.common.channelFallback")}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {formatRelativeTime(approval.createdAt)}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              {isPending ? (
                                <>
                                  <Button
                                    type="button"
                                    className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                                    onClick={() => openApproveDialog(approval)}
                                  >
                                    {t(
                                      "automation.approvalDialog.approveTitle"
                                    )}
                                    <ChevronRight className="ml-2 h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-xl border-slate-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                    onClick={() => openRejectDialog(approval)}
                                  >
                                    {t("automation.approvalDialog.reject")}
                                  </Button>
                                </>
                              ) : (
                                <span className="text-sm text-slate-400">
                                  {t("automation.approvals.noActions")}
                                </span>
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
                    {approvalsQuery.isFetchingNextPage
                      ? t("automation.approvals.loading")
                      : t("automation.approvals.loadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </DashboardCard>
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
        onOpenChange={open => {
          if (!open) setApproveDialog(null);
        }}
        onChange={value =>
          setApproveDialog(current =>
            current ? { ...current, editedContent: value } : current
          )
        }
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
        onOpenChange={open => {
          if (!open) setRejectDialog(null);
        }}
        onChange={value =>
          setRejectDialog(current =>
            current ? { ...current, note: value } : current
          )
        }
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
