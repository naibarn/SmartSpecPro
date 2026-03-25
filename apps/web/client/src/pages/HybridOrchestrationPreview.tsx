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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildHybridPlanSummary,
  applyHybridBlendMode,
  describeHybridBlendMode,
  formatHybridPlanInstructions,
  hybridBlendModeSchema,
  type HybridOrchestrationPlan,
  type HybridBlendMode,
  type HybridOrchestrationExecution,
  type HybridPlanPayload,
} from "@shared/orchestration/hybridOrchestration";

type PreviewPayload = HybridPlanPayload | null;

function ownerLabel(owner: HybridOrchestrationPlan["stages"][number]["owner"]): string {
  if (owner === "workflow") return "Workflow";
  if (owner === "swarm") return "Swarm";
  return "Human";
}

function stageBadgeClass(owner: HybridOrchestrationPlan["stages"][number]["owner"]): string {
  if (owner === "workflow") return "border-violet-200 bg-violet-100 text-violet-900";
  if (owner === "swarm") return "border-cyan-200 bg-cyan-100 text-cyan-900";
  return "border-amber-200 bg-amber-100 text-amber-900";
}

export default function HybridOrchestrationPreview() {
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
      title: "Workflow-first",
      badge: "Best for control",
      icon: Workflow,
      tone: "border-violet-200 bg-violet-50/80 text-violet-900",
      strengths: [
        "Deterministic checkpoints and predictable execution.",
        "Stronger fit for approvals, publishing, and rollback-aware work.",
        "Easier to audit and hand off across agents or humans.",
      ],
      tradeoffs: [
        "Less room for open-ended exploration before the first commit.",
        "Can feel slower when the task is still fuzzy.",
      ],
      recommendation: activePlan.requiresApproval
        ? "Recommended when the plan must be safe, approved, and easy to audit."
        : "Recommended when you want a stable spine but still need strong guardrails.",
    };

    const swarmFirst = {
      title: "Swarm-first",
      badge: "Best for discovery",
      icon: Users2,
      tone: "border-cyan-200 bg-cyan-50/80 text-cyan-900",
      strengths: [
        "Faster idea generation across multiple angles and perspectives.",
        "Useful when the problem is fuzzy, broad, or heavily research-driven.",
        "Surfaces edge cases and alternatives early.",
      ],
      tradeoffs: [
        "Can produce more variation before the workflow reconciles the answer.",
        "Needs a clearer validation gate to avoid drifting off brief.",
      ],
      recommendation: "Recommended for exploration, critique, and option generation before commit.",
    };

    return {
      workflowFirst,
      swarmFirst,
      recommendation: activePlan.requiresApproval
        ? "For this preview, workflow-first should lead the execution while the swarm feeds options into the validation gate."
        : "For this preview, a lighter workflow-first spine with a swarm-heavy exploration stage gives the best balance.",
    };
  }, [activePlan]);

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
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
              Loading hybrid preview
            </CardTitle>
            <CardDescription>
              Fetching the signed preview payload from the server.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  const blendModeOptions: Array<{ value: HybridBlendMode; label: string; description: string }> = [
    {
      value: "workflow-first",
      label: "Workflow-first",
      description: "Lead with deterministic control, then let the swarm pressure-test the proposal.",
    },
    {
      value: "swarm-first",
      label: "Swarm-first",
      description: "Start with exploration, then let workflow converge the best path.",
    },
    {
      value: "balanced-mixed",
      label: "Balanced mixed",
      description: "Keep the workflow spine and swarm exploration tightly interleaved.",
    },
    {
      value: "adaptive-mixed",
      label: "Adaptive mixed",
      description: "Let the system re-route between workflow and swarm based on confidence and review feedback.",
    },
  ];

  if (!matched || !agencyId) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Preview not found
            </CardTitle>
            <CardDescription>We could not resolve the requested hybrid orchestration preview.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/agencies")} className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              Back to Agencies
            </Button>
          </CardContent>
        </Card>
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
        <Card className="max-w-lg border-amber-200 bg-amber-50/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertCircle className="h-5 w-5" />
              No hybrid plan loaded
            </CardTitle>
            <CardDescription className="text-amber-800/90">
              The preview payload is missing, expired, or not yet loaded. Go back to the agency or chat surface and reopen the hybrid flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={handleBackToAgency} className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              Back to Agency
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.08),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(34,211,238,0.08),_transparent_28%),linear-gradient(180deg,_rgba(250,250,255,1),_rgba(245,247,255,1))] px-4 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBackToAgency}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-violet-700">Hybrid Preview</p>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {agency?.name || "Agency"} orchestration plan
                </h1>
              </div>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Review the workflow spine, the swarm exploration stage, and the commit gate before starting the flow.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 border border-violet-200 bg-white text-violet-800">
              <Bot className="h-3.5 w-3.5" />
              {stageCount} stages
            </Badge>
            <Badge variant="secondary" className="gap-1.5 border border-cyan-200 bg-white text-cyan-800">
              <Workflow className="h-3.5 w-3.5" />
              {activePlan.workflowAnchor}
            </Badge>
            <Badge variant="secondary" className="gap-1.5 border border-slate-200 bg-white text-slate-700">
              <Sparkles className="h-3.5 w-3.5" />
              {describeHybridBlendMode(selectedBlendMode)}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleRegeneratePreviewToken} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Regenerate Preview Token
            </Button>
          </div>
        </div>

        <>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  <Sparkles className="h-5 w-5 text-violet-700" />
                  Blend Mode Selector
                </CardTitle>
                <CardDescription>
                  Pick the orchestration style before starting the run. This changes how the workflow spine and swarm are sequenced.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
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
                          {active && <Badge className="bg-violet-600 text-white">Selected</Badge>}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-600">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">
                  Active mode: <span className="font-medium text-slate-700">{describeHybridBlendMode(selectedBlendMode)}</span>
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <Card className="border-violet-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-900">
                    <Sparkles className="h-5 w-5 text-violet-700" />
                    Hybrid Summary
                  </CardTitle>
                  <CardDescription>{buildHybridPlanSummary(activePlan)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-700">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="gap-1.5">
                      <Users2 className="h-3.5 w-3.5" />
                      {activePlan.swarmRoles.join(", ")}
                    </Badge>
                    <Badge variant="outline" className="gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {activePlan.requiresApproval ? "Approval required" : "Approval optional"}
                    </Badge>
                  </div>

                  <p className="text-sm leading-6 text-slate-600">
                    {activePlan.reason}
                  </p>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Original draft</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {draft || "No draft text was preserved for this preview."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-cyan-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-900">
                    <Clock3 className="h-5 w-5 text-cyan-700" />
                    Execution Details
                  </CardTitle>
                  <CardDescription>What happens when the flow starts.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-700">
                  <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-cyan-800">Workflow anchor</p>
                    <p className="mt-1 font-medium text-cyan-900">{activePlan.workflowAnchor}</p>
                  </div>
                  <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-cyan-800">Approval gate</p>
                    <p className="mt-1 font-medium text-cyan-900">
                      {activePlan.requiresApproval ? "Human review before commit" : "Can proceed without manual approval"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-cyan-800">Preview note</p>
                    <p className="mt-1 leading-6 text-cyan-900/90">
                      The hybrid flow will keep workflow deterministic while the swarm explores alternatives and validates edge cases.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-emerald-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  <Activity className="h-5 w-5 text-emerald-700" />
                  Hybrid Execution
                </CardTitle>
                <CardDescription>
                  The state machine keeps the workflow and swarm phases in order, with approval and rework handled explicitly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-700">
                {execution ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-800">
                        Status: {execution.status}
                      </Badge>
                      <Badge variant="secondary" className="bg-slate-50 text-slate-700">
                        {describeHybridBlendMode(execution.blendMode)}
                      </Badge>
                      <Badge variant="secondary" className="bg-cyan-50 text-cyan-800">
                        Stage {execution.currentStageIndex + 1}
                      </Badge>
                    </div>
                    <p className="leading-6 text-slate-600">
                      Current stage: <span className="font-medium text-slate-800">{execution.currentStageId ?? "n/a"}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Revisions: {execution.revisionCount} • Approval: {execution.approvalDecision ?? "pending"}
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
                                note: "Approved from preview",
                              });
                            }}
                            className="gap-2"
                          >
                            Approve and Commit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void advanceExecutionMutation.mutateAsync({
                                executionId: execution.executionId,
                                action: "reject",
                                note: "Needs rework",
                              });
                            }}
                            className="gap-2"
                          >
                            Send Back to Swarm
                          </Button>
                        </>
                      ) : execution.status === "completed" ? (
                        <Badge className="bg-emerald-100 text-emerald-900">Completed</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            void advanceExecutionMutation.mutateAsync({
                              executionId: execution.executionId,
                              action: "advance",
                              note: "Advance hybrid state machine",
                            });
                          }}
                          className="gap-2"
                        >
                          Advance Execution
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void advanceExecutionMutation.mutateAsync({
                            executionId: execution.executionId,
                            action: "cancel",
                            note: "Cancelled from preview",
                          });
                        }}
                        className="gap-2 text-slate-600"
                      >
                        Cancel Run
                      </Button>
                    </div>
                    {execution.history.length > 0 && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest event</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {execution.history.at(-1)?.action ?? "unknown"}{execution.history.at(-1)?.note ? `: ${execution.history.at(-1)?.note}` : ""}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm text-slate-600">
                      No execution has started yet. Pick a mode and press <strong>Start Hybrid Flow</strong>.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  <ListChecks className="h-5 w-5 text-violet-700" />
                  Stage Breakdown
                </CardTitle>
                <CardDescription>
                  Each stage is explicit so the workflow spine and swarm reasoning can stay in sync.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {activePlan.stages.map((stage, index) => (
                      <div key={stage.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[11px] ${stageBadgeClass(stage.owner)}`}>
                              {ownerLabel(stage.owner)}
                            </Badge>
                            <span className="text-xs uppercase tracking-wide text-slate-400">Stage {index + 1}</span>
                          </div>
                          <h3 className="mt-2 text-sm font-semibold text-slate-900">{stage.title}</h3>
                        </div>
                        {stage.gate && (
                          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                            {stage.gate}
                          </Badge>
                        )}
                      </div>

                      <p className="mt-2 text-sm leading-6 text-slate-600">{stage.description}</p>

                      <div className="mt-3 space-y-2">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Inputs</p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            {stage.inputs.join(", ")}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Outputs</p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            {stage.outputs.join(", ")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {strategyComparison && (
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-900">
                    <Workflow className="h-5 w-5 text-violet-700" />
                    Workflow-first vs Swarm-first
                  </CardTitle>
                  <CardDescription>
                    Compare the two operating modes before choosing how much control versus exploration you want.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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

                          <p className="mt-3 text-sm leading-6 opacity-90">
                            {item.recommendation}
                          </p>

                          <div className="mt-4 space-y-3 text-sm">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide opacity-60">Strengths</p>
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
                              <p className="text-[11px] uppercase tracking-wide opacity-60">Tradeoffs</p>
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested balance</p>
                    <p className="mt-2 leading-6 text-slate-600">
                      {strategyComparison.recommendation}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-dashed border-violet-200 bg-violet-50/40 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  <Sparkles className="h-5 w-5 text-violet-700" />
                  Instructions Preview
                </CardTitle>
                <CardDescription>These instructions will be injected into the agency flow.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap rounded-lg border border-violet-100 bg-white/90 p-4 text-xs leading-6 text-slate-700">
                  {stageSummary}
                </pre>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleStartFlow} className="gap-2">
                <ArrowRight className="h-4 w-4" />
                Start Hybrid Flow
              </Button>
              <Button variant="outline" onClick={handleBackToAgency} className="gap-2">
                <ChevronLeft className="h-4 w-4" />
                Back to Agency
              </Button>
            </div>
          </>
      </div>
    </div>
  );
}
