import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  Activity,
  Bot,
  ChevronLeft,
  Clock3,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Users2,
  Workflow,
} from "lucide-react";
import { useAgencyById } from "@/hooks/useAgencyQuery";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/dashboard";
import { LocaleToggle } from "@/components/LocaleToggle";
import { useScopedTranslation } from "@/i18n";
import {
  buildHybridPlanSummary,
  applyHybridBlendMode,
  formatHybridPlanInstructions,
  hybridBlendModeSchema,
  type HybridOrchestrationPlan,
  type HybridBlendMode,
  type HybridOrchestrationExecution,
  type HybridPlanPayload,
} from "@shared/orchestration/hybridOrchestration";

type PreviewPayload = HybridPlanPayload | null;

function stageBadgeClass(owner: HybridOrchestrationPlan["stages"][number]["owner"]): string {
  if (owner === "workflow") return "border-violet-200 bg-violet-100 text-violet-900";
  if (owner === "swarm") return "border-cyan-200 bg-cyan-100 text-cyan-900";
  return "border-amber-200 bg-amber-100 text-amber-900";
}

export default function HybridOrchestrationPreview() {
  const { t } = useScopedTranslation("agency");
  const [matched, params] = useRoute("/agencies/:id/hybrid-preview");
  const [, setLocation] = useLocation();
  const agencyId = params?.id;
  const { data: agency, isLoading: agencyLoading } = useAgencyById(agencyId);
  const utils = trpc.useUtils();
  const [payload, setPayload] = useState<PreviewPayload>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [selectedBlendMode, setSelectedBlendMode] = useState<HybridBlendMode>("balanced-mixed");
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [isRefreshingPreviewToken, setIsRefreshingPreviewToken] = useState(false);
  const previewRefreshAttemptedRef = useRef<string | null>(null);

  const previewQuery = trpc.hybridOrchestration.getPreview.useQuery(
    { token: previewToken ?? "" },
    { enabled: Boolean(previewToken) },
  );
  const executionQuery = trpc.hybridOrchestration.getExecution.useQuery(
    { executionId: executionId ?? "" },
    { enabled: Boolean(executionId) },
  );
  const createPreviewTokenMutation = trpc.hybridOrchestration.createPreviewToken.useMutation();
  const refreshPreviewTokenMutation = trpc.hybridOrchestration.refreshPreviewToken.useMutation();
  const startExecutionMutation = trpc.hybridOrchestration.startExecution.useMutation({
    onSuccess: (result) => {
      setExecutionId(result.execution.executionId);
      void utils.hybridOrchestration.getExecution.invalidate({ executionId: result.execution.executionId });
    },
  });
  const advanceExecutionMutation = trpc.hybridOrchestration.advanceExecution.useMutation({
    onSuccess: (result) => {
      setExecutionId(result.execution.executionId);
      void utils.hybridOrchestration.getExecution.invalidate({ executionId: result.execution.executionId });
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const token = query.get("hybridPreviewToken");
    const queryExecutionId = query.get("executionId");
    setPreviewToken(token);
    setExecutionId(queryExecutionId);

    if (token) {
      setPayload(null);
      return;
    }
    setPayload(null);
  }, [matched, agencyId]);

  useEffect(() => {
    const plan = previewQuery.data?.plan;
    if (plan?.mode === "hybrid") {
      setPayload(previewQuery.data ?? null);
      setSelectedBlendMode(hybridBlendModeSchema.parse(plan.blendMode ?? "balanced-mixed"));
    }
  }, [previewQuery.data]);

  useEffect(() => {
    if (!previewToken || !previewQuery.isFetched) {
      return;
    }

    if (previewQuery.data?.plan?.mode === "hybrid") {
      setIsRefreshingPreviewToken(false);
      previewRefreshAttemptedRef.current = null;
      return;
    }

    if (previewQuery.data || previewRefreshAttemptedRef.current === previewToken) {
      return;
    }

    previewRefreshAttemptedRef.current = previewToken;
    setIsRefreshingPreviewToken(true);
    void (async () => {
      try {
        const refreshed = await refreshPreviewTokenMutation.mutateAsync({ previewToken });
        setPreviewToken(refreshed.token);
        previewRefreshAttemptedRef.current = null;

        if (agencyId) {
          const params = new URLSearchParams(window.location.search);
          params.set("hybridPreviewToken", refreshed.token);
          if (executionId) {
            params.set("executionId", executionId);
          }
          setLocation(`/agencies/${agencyId}/hybrid-preview?${params.toString()}`);
        }
      } catch {
        previewRefreshAttemptedRef.current = null;
      } finally {
        setIsRefreshingPreviewToken(false);
      }
    })();
  }, [agencyId, executionId, previewQuery.data, previewQuery.isFetched, previewToken, refreshPreviewTokenMutation, setLocation]);

  const hybridPlan = previewQuery.data?.plan ?? payload?.plan ?? null;
  const draft = previewQuery.data?.draft ?? payload?.draft ?? "";
  const activePlan = useMemo(
    () => (hybridPlan ? applyHybridBlendMode(hybridPlan, selectedBlendMode) : null),
    [hybridPlan, selectedBlendMode],
  );
  const execution: HybridOrchestrationExecution | null = executionQuery.data ?? null;
  const isPreviewBootstrapping = Boolean(
    previewToken
      && previewQuery.isFetched
      && !previewQuery.data
      && previewRefreshAttemptedRef.current !== previewToken,
  );
  const isPreviewLoading = Boolean(previewToken) && (previewQuery.isLoading || isRefreshingPreviewToken || isPreviewBootstrapping);
  const stageCount = activePlan?.stages.length ?? 0;
  const stageSummary = useMemo(
    () => (activePlan ? formatHybridPlanInstructions(activePlan) : ""),
    [activePlan],
  );
  const strategyComparison = useMemo(() => {
    if (!activePlan) {
      return null;
    }

    const workflowFirst = {
      title: t("hybridPreview.compare.workflowFirst.title"),
      badge: t("hybridPreview.compare.workflowFirst.badge"),
      icon: Workflow,
      tone: "border-violet-200 bg-violet-50/80 text-violet-900",
      strengths: [
        t("hybridPreview.compare.workflowFirst.strengths.deterministic"),
        t("hybridPreview.compare.workflowFirst.strengths.approvals"),
        t("hybridPreview.compare.workflowFirst.strengths.audit"),
      ],
      tradeoffs: [
        t("hybridPreview.compare.workflowFirst.tradeoffs.exploration"),
        t("hybridPreview.compare.workflowFirst.tradeoffs.speed"),
      ],
      recommendation: activePlan.requiresApproval
        ? t("hybridPreview.compare.workflowFirst.recommendedApproval")
        : t("hybridPreview.compare.workflowFirst.recommended"),
    };

    const swarmFirst = {
      title: t("hybridPreview.compare.swarmFirst.title"),
      badge: t("hybridPreview.compare.swarmFirst.badge"),
      icon: Users2,
      tone: "border-cyan-200 bg-cyan-50/80 text-cyan-900",
      strengths: [
        t("hybridPreview.compare.swarmFirst.strengths.ideas"),
        t("hybridPreview.compare.swarmFirst.strengths.research"),
        t("hybridPreview.compare.swarmFirst.strengths.edgeCases"),
      ],
      tradeoffs: [
        t("hybridPreview.compare.swarmFirst.tradeoffs.variation"),
        t("hybridPreview.compare.swarmFirst.tradeoffs.validation"),
      ],
      recommendation: t("hybridPreview.compare.swarmFirst.recommended"),
    };

    return {
      workflowFirst,
      swarmFirst,
      recommendation: activePlan.requiresApproval
        ? t("hybridPreview.compare.balancedApproval")
        : t("hybridPreview.compare.balanced"),
    };
  }, [activePlan, t]);

  const blendModeLabel = (mode: HybridBlendMode): string => {
    switch (mode) {
      case "workflow-first":
        return t("hybridPreview.blendMode.workflowFirst.label");
      case "swarm-first":
        return t("hybridPreview.blendMode.swarmFirst.label");
      case "balanced-mixed":
        return t("hybridPreview.blendMode.balancedMixed.label");
      case "adaptive-mixed":
        return t("hybridPreview.blendMode.adaptiveMixed.label");
      default:
        return mode;
    }
  };

  const ownerLabel = (owner: HybridOrchestrationPlan["stages"][number]["owner"]): string => {
    if (owner === "workflow") return t("hybridPreview.owner.workflow");
    if (owner === "swarm") return t("hybridPreview.owner.swarm");
    return t("hybridPreview.owner.human");
  };

  const handleStartFlow = () => {
    if (!agencyId || !hybridPlan) {
      return;
    }

    void (async () => {
      try {
        const tokenToUse = previewToken ?? (await createPreviewTokenMutation.mutateAsync({
          agencyId,
          payload: {
            draft,
            plan: hybridPlan,
          },
          sourceSurface: "review-center",
        })).token;
        const result = await startExecutionMutation.mutateAsync({
          previewToken: tokenToUse,
          blendMode: selectedBlendMode,
        });
        setExecutionId(result.execution.executionId);
        setLocation(
          `/agencies/${agencyId}/hybrid-preview?hybridPreviewToken=${encodeURIComponent(tokenToUse)}&executionId=${encodeURIComponent(result.execution.executionId)}`,
        );
      } catch {
        // The button remains available for a retry; errors are shown by the mutation layer.
      }
    })();
  };

  const handleBackToAgency = () => {
    if (!agencyId) {
      setLocation("/agencies");
      return;
    }

    setLocation(`/agencies/${agencyId}`);
  };

  const handleRegeneratePreviewToken = () => {
    if (!agencyId || !hybridPlan) {
      return;
    }

    void (async () => {
      try {
        const result = await createPreviewTokenMutation.mutateAsync({
          agencyId,
          payload: {
            draft,
            plan: hybridPlan,
          },
          sourceSurface: "review-center",
        });

        setPreviewToken(result.token);
        if (typeof window !== "undefined") {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set("hybridPreviewToken", result.token);
          if (executionId) {
            nextUrl.searchParams.set("executionId", executionId);
          }
          setLocation(`/agencies/${agencyId}/hybrid-preview?${nextUrl.searchParams.toString()}`);
        }
      } catch {
        // Keep the current state visible if regeneration is unavailable.
      }
    })();
  };

  if (isPreviewLoading) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <DashboardCard className="w-full max-w-lg">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
              {t("hybridPreview.loading.title")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {t("hybridPreview.loading.description")}
            </p>
          </div>
        </DashboardCard>
      </div>
    );
  }
  const blendModeOptions: Array<{ value: HybridBlendMode; label: string; description: string }> = [
    {
      value: "workflow-first",
      label: t("hybridPreview.blendMode.workflowFirst.label"),
      description: t("hybridPreview.blendMode.workflowFirst.description"),
    },
    {
      value: "swarm-first",
      label: t("hybridPreview.blendMode.swarmFirst.label"),
      description: t("hybridPreview.blendMode.swarmFirst.description"),
    },
    {
      value: "balanced-mixed",
      label: t("hybridPreview.blendMode.balancedMixed.label"),
      description: t("hybridPreview.blendMode.balancedMixed.description"),
    },
    {
      value: "adaptive-mixed",
      label: t("hybridPreview.blendMode.adaptiveMixed.label"),
      description: t("hybridPreview.blendMode.adaptiveMixed.description"),
    },
  ];

  if (!matched || !agencyId) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <DashboardCard className="max-w-lg">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              {t("hybridPreview.notFound.title")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {t("hybridPreview.notFound.description")}
            </p>
          </div>
          <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
            <Button onClick={() => setLocation("/agencies")} className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              {t("hybridPreview.backToAgencies")}
            </Button>
          </div>
        </DashboardCard>
      </div>
    );
  }

  if (agencyLoading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activePlan) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <DashboardCard className="max-w-lg border-amber-200 bg-amber-50/60">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-amber-900">
              <AlertCircle className="h-5 w-5" />
              {t("hybridPreview.noPlan.title")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-amber-800/90">
              {t("hybridPreview.noPlan.description")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
            <Button onClick={handleBackToAgency} className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              {t("hybridPreview.backToAgency")}
            </Button>
          </div>
        </DashboardCard>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.08),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(34,211,238,0.08),_transparent_28%),linear-gradient(180deg,_rgba(250,250,255,1),_rgba(245,247,255,1))] px-4 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBackToAgency}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-violet-700">{t("hybridPreview.eyebrow")}</p>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {t("hybridPreview.title", { name: agency?.name || t("browser.header.title") })}
                </h1>
              </div>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              {t("hybridPreview.subtitle")}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <LocaleToggle />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant="secondary" className="gap-1.5 border border-violet-200 bg-white text-violet-800">
                <Bot className="h-3.5 w-3.5" />
                {t("hybridPreview.stageCount", { count: stageCount })}
              </Badge>
              <Badge variant="secondary" className="gap-1.5 border border-cyan-200 bg-white text-cyan-800">
                <Workflow className="h-3.5 w-3.5" />
                {activePlan.workflowAnchor}
              </Badge>
              <Badge variant="secondary" className="gap-1.5 border border-slate-200 bg-white text-slate-700">
                <Sparkles className="h-3.5 w-3.5" />
                {blendModeLabel(selectedBlendMode)}
              </Badge>
              <Button variant="outline" size="sm" onClick={handleRegeneratePreviewToken} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                {t("hybridPreview.regeneratePreviewToken")}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <DashboardCard className="border-slate-200 shadow-sm">
            <div className="px-5 pt-5 sm:px-6 sm:pt-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Sparkles className="h-5 w-5 text-violet-700" />
                {t("hybridPreview.blendMode.title")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {t("hybridPreview.blendMode.description")}
              </p>
            </div>
            <div className="space-y-3 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {blendModeOptions.map((option) => {
                  const active = selectedBlendMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                        active
                          ? "border-violet-300 bg-violet-50 text-violet-900 shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/40"
                      }`}
                      onClick={() => setSelectedBlendMode(option.value)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{option.label}</span>
                        {active && <Badge className="bg-violet-600 text-white">{t("hybridPreview.selected")}</Badge>}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{option.description}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500">
                {t("hybridPreview.activeMode")}: <span className="font-medium text-slate-700">{blendModeLabel(selectedBlendMode)}</span>
              </p>
            </div>
          </DashboardCard>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <DashboardCard className="border-violet-200 shadow-sm">
              <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <Sparkles className="h-5 w-5 text-violet-700" />
                  {t("hybridPreview.summary.title")}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{buildHybridPlanSummary(activePlan)}</p>
              </div>
              <div className="space-y-3 px-5 pb-5 pt-4 text-sm text-slate-700 sm:px-6 sm:pb-6">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="gap-1.5">
                    <Users2 className="h-3.5 w-3.5" />
                    {activePlan.swarmRoles.join(", ")}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {activePlan.requiresApproval ? t("hybridPreview.approval.required") : t("hybridPreview.approval.optional")}
                  </Badge>
                </div>
                <p className="text-sm leading-6 text-slate-600">{activePlan.reason}</p>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("hybridPreview.originalDraft")}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {draft || t("hybridPreview.noDraft")}
                  </p>
                </div>
              </div>
            </DashboardCard>

            <DashboardCard className="border-cyan-200 shadow-sm">
              <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <Clock3 className="h-5 w-5 text-cyan-700" />
                  {t("hybridPreview.execution.title")}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{t("hybridPreview.execution.description")}</p>
              </div>
              <div className="space-y-3 px-5 pb-5 pt-4 text-sm text-slate-700 sm:px-6 sm:pb-6">
                <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-cyan-800">{t("hybridPreview.workflowAnchor")}</p>
                  <p className="mt-1 font-medium text-cyan-900">{activePlan.workflowAnchor}</p>
                </div>
                <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-cyan-800">{t("hybridPreview.approvalGate")}</p>
                  <p className="mt-1 font-medium text-cyan-900">
                    {activePlan.requiresApproval ? t("hybridPreview.approval.humanBeforeCommit") : t("hybridPreview.approval.noManual")}
                  </p>
                </div>
                <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-cyan-800">{t("hybridPreview.previewNote")}</p>
                  <p className="mt-1 leading-6 text-cyan-900/90">
                    {t("hybridPreview.execution.note")}
                  </p>
                </div>
              </div>
            </DashboardCard>
          </div>

          <DashboardCard className="border-emerald-200 shadow-sm">
            <div className="px-5 pt-5 sm:px-6 sm:pt-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Activity className="h-5 w-5 text-emerald-700" />
                {t("hybridPreview.executionState.title")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {t("hybridPreview.executionState.description")}
              </p>
            </div>
            <div className="space-y-4 px-5 pb-5 pt-4 text-sm text-slate-700 sm:px-6 sm:pb-6">
                {execution ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-800">
                      {t("hybridPreview.status")}: {t(`workflow.status.${execution.status}`)}
                    </Badge>
                    <Badge variant="secondary" className="bg-slate-50 text-slate-700">
                      {blendModeLabel(execution.blendMode)}
                    </Badge>
                    <Badge variant="secondary" className="bg-cyan-50 text-cyan-800">
                      {t("hybridPreview.stageNumber", { number: execution.currentStageIndex + 1 })}
                    </Badge>
                  </div>
                  <p className="leading-6 text-slate-600">
                      {t("hybridPreview.currentStage")}: <span className="font-medium text-slate-800">{execution.currentStageId ?? t("common.na")}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {t("hybridPreview.revisions")}: {execution.revisionCount} • {t("hybridPreview.approvalDecision")}: {execution.approvalDecision ?? t("hybridPreview.pending")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {execution.status === "awaiting_approval" ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => {
                            void advanceExecutionMutation.mutateAsync({
                              executionId: execution.executionId,
                              action: "approve",
                            note: t("hybridPreview.execution.noteApprovedFromPreview"),
                            });
                          }}
                          className="gap-2"
                        >
                          {t("hybridPreview.actions.approveAndCommit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void advanceExecutionMutation.mutateAsync({
                              executionId: execution.executionId,
                              action: "reject",
                            note: t("hybridPreview.execution.noteNeedsRework"),
                            });
                          }}
                          className="gap-2"
                        >
                          {t("hybridPreview.actions.sendBackToSwarm")}
                        </Button>
                      </>
                    ) : execution.status === "completed" ? (
                      <Badge className="bg-emerald-100 text-emerald-900">{t("hybridPreview.completed")}</Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => {
                          void advanceExecutionMutation.mutateAsync({
                            executionId: execution.executionId,
                            action: "advance",
                            note: t("hybridPreview.execution.noteAdvanceStateMachine"),
                          });
                        }}
                        className="gap-2"
                      >
                          {t("hybridPreview.advanceExecution")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void advanceExecutionMutation.mutateAsync({
                          executionId: execution.executionId,
                          action: "cancel",
                          note: t("hybridPreview.execution.noteCancelledFromPreview"),
                        });
                      }}
                      className="gap-2 text-slate-600"
                    >
                      {t("hybridPreview.cancelRun")}
                    </Button>
                  </div>
                  {execution.history.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("hybridPreview.latestEvent")}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {execution.history.at(-1)?.action ?? t("common.unknown")}
                        {execution.history.at(-1)?.note ? `: ${execution.history.at(-1)?.note}` : ""}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-600">
                    {t("hybridPreview.execution.empty")}
                  </p>
                </div>
              )}
            </div>
          </DashboardCard>

          <DashboardCard className="border-slate-200 shadow-sm">
            <div className="px-5 pt-5 sm:px-6 sm:pt-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <ListChecks className="h-5 w-5 text-violet-700" />
                {t("hybridPreview.stages.title")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {t("hybridPreview.stages.description")}
              </p>
            </div>
            <div className="space-y-3 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {activePlan.stages.map((stage, index) => (
                  <div key={stage.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[11px] ${stageBadgeClass(stage.owner)}`}>
                            {ownerLabel(stage.owner)}
                          </Badge>
                          <span className="text-xs uppercase tracking-wide text-slate-400">
                            {t("hybridPreview.stageNumber", { number: index + 1 })}
                          </span>
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-slate-900">{stage.title}</h3>
                      </div>
                      {stage.gate && (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                          {stage.gate === "required" ? t("hybridPreview.approval.required") : stage.gate}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{stage.description}</p>
                    <div className="mt-3 space-y-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">{t("hybridPreview.inputs")}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{stage.inputs.join(", ")}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">{t("hybridPreview.outputs")}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{stage.outputs.join(", ")}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DashboardCard>

          {strategyComparison && (
            <DashboardCard className="border-slate-200 shadow-sm">
            <div className="px-5 pt-5 sm:px-6 sm:pt-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Workflow className="h-5 w-5 text-violet-700" />
                {t("hybridPreview.compare.title")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {t("hybridPreview.compare.description")}
              </p>
            </div>
              <div className="space-y-4 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  {[strategyComparison.workflowFirst, strategyComparison.swarmFirst].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className={`rounded-xl border p-4 shadow-sm ${item.tone}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                          </div>
                          <Badge variant="secondary" className="bg-white/80 text-inherit">
                            {item.badge}
                          </Badge>
                        </div>
                        <p className="mt-3 text-sm leading-6 opacity-90">{item.recommendation}</p>
                        <div className="mt-4 space-y-3 text-sm">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide opacity-60">{t("hybridPreview.compare.strengths")}</p>
                            <ul className="mt-2 space-y-2">
                              {item.strengths.map((strength) => (
                                <li key={strength} className="flex gap-2 leading-6 opacity-90">
                                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-current/70" />
                                  <span>{strength}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide opacity-60">{t("hybridPreview.compare.tradeoffs")}</p>
                            <ul className="mt-2 space-y-2">
                              {item.tradeoffs.map((tradeoff) => (
                                <li key={tradeoff} className="flex gap-2 leading-6 opacity-90">
                                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-current/60" />
                                  <span>{tradeoff}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("hybridPreview.suggestedBalance")}</p>
                  <p className="mt-2 leading-6 text-slate-600">{strategyComparison.recommendation}</p>
                </div>
              </div>
            </DashboardCard>
          )}

          <DashboardCard className="border-dashed border-violet-200 bg-violet-50/40 shadow-sm">
            <div className="px-5 pt-5 sm:px-6 sm:pt-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Sparkles className="h-5 w-5 text-violet-700" />
                {t("hybridPreview.instructions.title")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {t("hybridPreview.instructions.description")}
              </p>
            </div>
            <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
              <pre className="whitespace-pre-wrap rounded-lg border border-violet-100 bg-white/90 p-4 text-xs leading-6 text-slate-700">
                {stageSummary}
              </pre>
            </div>
          </DashboardCard>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleStartFlow} className="gap-2">
              <ArrowRight className="h-4 w-4" />
              {t("hybridPreview.startHybridFlow")}
            </Button>
            <Button variant="outline" onClick={handleBackToAgency} className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              {t("hybridPreview.backToAgency")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
