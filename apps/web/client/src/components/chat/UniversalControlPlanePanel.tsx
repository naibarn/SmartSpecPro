import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock3,
  Cpu,
  ExternalLink,
  Loader2,
  Network,
  Plug,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export interface UniversalControlPlanePanelProps {
  conversationId: number | null;
  onClose: () => void;
  onOpenPrompt: (prompt: string) => void;
}

type TaskGroupView = {
  groupId: string;
  groupKind: "plan" | "workflow" | "single";
  title: string;
  status: string;
  progressPercent: number | null;
  completedSteps: number;
  totalSteps: number;
  activeStepId: string | null;
  metadataState: "clean" | "degraded";
  latestEvent: { message: string | null; phase: string | null } | null;
  jobs: Array<{
    id: string;
    jobType: string;
    status: string;
    progressPercent: number | null;
    progressPhase: string | null;
    canCancel: boolean;
    orchestration: {
      stepId: string | null;
      stepIndex: number | null;
      totalSteps: number | null;
      dependsOnJobIds: string[];
    };
    latestEvent: { message: string | null; phase: string | null } | null;
    worker: { displayName: string | null; machineName: string | null } | null;
  }>;
};

function stateTone(state: string): string {
  const normalized = state.toLowerCase();
  if (
    [
      "connected",
      "active",
      "online",
      "ready",
      "succeeded",
      "completed",
      "ready_for_live",
    ].includes(normalized)
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (
    [
      "failed",
      "revoked",
      "offline",
      "expired",
      "canceled",
      "cancelled",
      "error",
      "runner_unavailable",
    ].includes(normalized)
  ) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (
    [
      "running",
      "claimed",
      "leased",
      "queued",
      "pending",
      "retry_scheduled",
      "waiting_external",
      "reconciling",
      "verification_pending",
      "waiting_for_compatible_runner",
      "authentication_required",
      "runner_binding_required",
      "workspace_approval_required",
      "approval_required",
      "budget_required",
    ].includes(normalized)
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function stateLabel(state: string): string {
  return state.replaceAll("_", " ");
}

function developmentStateLabel(state: string): string {
  return stateLabel(state).toLowerCase();
}

function isTerminalDevelopmentRun(state: string): boolean {
  return ["COMPLETED", "CANCELLED", "FAILED_TERMINAL"].includes(state);
}

function needsDevelopmentAttention(run: {
  state: string;
  nextSafeAction: { command: string };
  closure: { blockers: Array<{ status: string }> } | null;
}): boolean {
  return (
    run.nextSafeAction.command === "WAIT_FOR_HUMAN_DECISION" ||
    [
      "WAITING_HUMAN_DECISION",
      "PAUSED_POLICY",
      "BLOCKED_RECOVERABLE",
      "RECOVERY_EXHAUSTED_PENDING_DECISION",
    ].includes(run.state) ||
    Boolean(run.closure?.blockers.some(blocker => blocker.status !== "CLOSED"))
  );
}

function nextSafeActionLabel(action: {
  command: string;
  phase?: string;
  reason?: string;
}): string {
  if (action.command === "RUN_PHASE" || action.command === "RECOVER_PHASE") {
    return `${developmentStateLabel(action.command)} · ${developmentStateLabel(action.phase ?? "")}`;
  }
  if (action.command === "WAIT_FOR_HUMAN_DECISION") {
    return `${developmentStateLabel(action.command)} · ${action.reason ?? "decision required"}`;
  }
  return `${developmentStateLabel(action.command)}${action.reason ? ` · ${action.reason}` : ""}`;
}

function QueryState({
  loading,
  error,
  empty,
}: {
  loading: boolean;
  error?: string;
  empty: string;
}) {
  if (loading) {
    return (
      <p
        className="flex items-center gap-2 text-xs text-slate-500"
        aria-busy="true"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Checking...
      </p>
    );
  }
  if (error) {
    return <p className="text-xs text-rose-700">{error}</p>;
  }
  return <p className="text-xs text-slate-500">{empty}</p>;
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  detail,
  state,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  detail: string;
  state: string;
}) {
  return (
    <li className={cn("rounded-xl border p-3", stateTone(state))}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{detail}</p>
    </li>
  );
}

export function UniversalControlPlanePanel({
  conversationId,
  onClose,
  onOpenPrompt,
}: UniversalControlPlanePanelProps) {
  const [prompt, setPrompt] = useState("");
  const [taskOffset, setTaskOffset] = useState(0);
  const [taskGroups, setTaskGroups] = useState<TaskGroupView[]>([]);
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<Set<string>>(
    new Set()
  );
  const [expandedDevelopmentRunId, setExpandedDevelopmentRunId] = useState<
    string | null
  >(null);
  const [expandedRunners, setExpandedRunners] = useState<Set<string>>(
    new Set()
  );
  const trpcUtils = trpc.useUtils();
  const summaryQuery = trpc.workerJobs.dashboardSummary.useQuery(undefined, {
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const taskGroupsQuery = trpc.workerJobs.taskGroups.useQuery(
    { limit: 25, offset: taskOffset },
    { refetchInterval: 10_000, refetchIntervalInBackground: false }
  );
  const devicesQuery = trpc.connectedDevices.list.useQuery(undefined, {
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const runnersQuery = trpc.runnerNodes.list.useQuery(undefined, {
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const connectionsQuery = trpc.mcpConnections.listConnections.useQuery(
    undefined,
    {
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
    }
  );
  const cancelMutation = trpc.workerJobs.cancelQueued.useMutation();
  const developmentRunsQuery = trpc.spec226DevelopmentControl.list.useQuery(
    { limit: 25 },
    { refetchInterval: 10_000, refetchIntervalInBackground: false }
  );
  const developmentRunQuery = trpc.spec226DevelopmentControl.get.useQuery(
    { runId: expandedDevelopmentRunId ?? "" },
    {
      enabled: Boolean(expandedDevelopmentRunId),
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
    }
  );
  const developmentEventsQuery = trpc.spec226DevelopmentControl.events.useQuery(
    {
      runId: expandedDevelopmentRunId ?? "",
      afterSequence: 0,
      limit: 50,
    },
    {
      enabled: Boolean(expandedDevelopmentRunId),
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
    }
  );
  const developmentCommandMutation =
    trpc.spec226DevelopmentControl.command.useMutation();
  // Keep the panel compatible with older test doubles/rolling deployments
  // while the additive Spec 226 D3 procedures roll out.
  const authorizationProcedures = trpc.spec226DevelopmentControl as typeof trpc.spec226DevelopmentControl & {
    authorizationStatus?: typeof trpc.spec226DevelopmentControl.authorizationStatus;
    requestAuthorizationApproval?: typeof trpc.spec226DevelopmentControl.requestAuthorizationApproval;
    reserveAuthorizationBudget?: typeof trpc.spec226DevelopmentControl.reserveAuthorizationBudget;
    bindAuthorization?: typeof trpc.spec226DevelopmentControl.bindAuthorization;
    revokeAuthorization?: typeof trpc.spec226DevelopmentControl.revokeAuthorization;
  };
  const authorizationStatusQuery = authorizationProcedures.authorizationStatus
    ? authorizationProcedures.authorizationStatus.useQuery(
        {
          runId: expandedDevelopmentRunId ?? "",
          runnerId: runnersQuery.data?.runners.find(
            runner => runner.status === "online" && runner.trustState === "trusted"
          )?.runnerId,
          provider: "codex",
        },
        {
          enabled: Boolean(expandedDevelopmentRunId),
          refetchInterval: 10_000,
          refetchIntervalInBackground: false,
        }
      )
    : {
        data: undefined,
        error: null,
        isLoading: false,
        refetch: async () => undefined,
      };
  const unavailableAuthorizationMutation = {
    isPending: false,
    mutateAsync: async () => {
      throw new Error("Spec 226 authorization procedures are unavailable");
    },
  };
  const requestAuthorizationApprovalMutation = authorizationProcedures.requestAuthorizationApproval
    ? authorizationProcedures.requestAuthorizationApproval.useMutation()
    : unavailableAuthorizationMutation;
  const reserveAuthorizationBudgetMutation = authorizationProcedures.reserveAuthorizationBudget
    ? authorizationProcedures.reserveAuthorizationBudget.useMutation()
    : unavailableAuthorizationMutation;
  const bindAuthorizationMutation = authorizationProcedures.bindAuthorization
    ? authorizationProcedures.bindAuthorization.useMutation()
    : unavailableAuthorizationMutation;
  const revokeAuthorizationMutation = authorizationProcedures.revokeAuthorization
    ? authorizationProcedures.revokeAuthorization.useMutation()
    : unavailableAuthorizationMutation;
  const [authorizationBudgetIds, setAuthorizationBudgetIds] = useState<
    Record<string, string>
  >({});
  const [authorizationAmounts, setAuthorizationAmounts] = useState<
    Record<string, string>
  >({});

  const summary = summaryQuery.data;
  const devices = devicesQuery.data?.devices ?? [];
  const connections = connectionsQuery.data ?? [];
  const workerDevices = devices.filter(
    device => device.authKind === "worker_executor"
  );
  const runners = runnersQuery.data?.runners ?? [];
  const activeRunners = runners.filter(
    runner => runner.status === "online" && runner.trustState === "trusted"
  );
  const activeConnections = connections.filter(
    connection => connection.status === "connected"
  );
  const developmentRuns = developmentRunsQuery.data ?? [];
  const activeDevelopmentRuns = developmentRuns.filter(
    run =>
      !isTerminalDevelopmentRun(run.state) && !needsDevelopmentAttention(run)
  );
  const developmentAttentionInbox = developmentRuns.filter(
    needsDevelopmentAttention
  );
  useEffect(() => {
    const incoming = (taskGroupsQuery.data?.groups ?? []) as TaskGroupView[];
    setTaskGroups(previous => {
      if (taskOffset === 0) return incoming;
      const merged = new Map(previous.map(group => [group.groupId, group]));
      incoming.forEach(group => merged.set(group.groupId, group));
      return Array.from(merged.values());
    });
  }, [taskGroupsQuery.data, taskOffset]);
  const hasLoadingState = [
    summaryQuery,
    taskGroupsQuery,
    devicesQuery,
    runnersQuery,
    connectionsQuery,
    developmentRunsQuery,
      ...(expandedDevelopmentRunId
        ? [
            developmentRunQuery,
            developmentEventsQuery,
            authorizationStatusQuery,
          ]
        : []),
  ].some(query => query.isLoading && !query.data);
  const queryErrors = [
    summaryQuery,
    taskGroupsQuery,
    devicesQuery,
    connectionsQuery,
    developmentRunsQuery,
    ...(expandedDevelopmentRunId
      ? [developmentRunQuery, developmentEventsQuery, authorizationStatusQuery]
      : []),
  ]
    .map(query => query.error?.message)
    .filter((message): message is string => Boolean(message));

  async function refresh() {
    setTaskOffset(0);
    setTaskGroups([]);
    await Promise.all([
      summaryQuery.refetch(),
      taskGroupsQuery.refetch(),
      devicesQuery.refetch(),
      runnersQuery.refetch(),
      connectionsQuery.refetch(),
      developmentRunsQuery.refetch(),
      ...(expandedDevelopmentRunId
        ? [
            developmentRunQuery.refetch(),
            developmentEventsQuery.refetch(),
            authorizationStatusQuery.refetch(),
          ]
        : []),
    ]);
  }

  async function cancelJob(jobId: string) {
    try {
      await cancelMutation.mutateAsync({ jobId });
      toast.success("ยกเลิกงานแล้ว");
      setTaskOffset(0);
      setTaskGroups([]);
      await Promise.all([summaryQuery.refetch(), taskGroupsQuery.refetch()]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ยกเลิกงานไม่สำเร็จ"
      );
    }
  }

  async function controlDevelopmentRun(
    run: (typeof developmentRuns)[number],
    action: "pause" | "cancel"
  ) {
    try {
      const fresh = await trpcUtils.spec226DevelopmentControl.get.fetch({
        runId: run.runId,
      });
      if (
        fresh.bridgeVersion !== run.bridgeVersion ||
        fresh.revision !== run.revision ||
        fresh.fencingVersion !== run.fencingVersion ||
        fresh.decisionEpoch !== run.decisionEpoch ||
        !fresh.actions[action]
      ) {
        toast.error("DevelopmentRun เปลี่ยนแปลงแล้ว กรุณาตรวจสอบสถานะล่าสุด");
        await Promise.all([
          developmentRunsQuery.refetch(),
          ...(expandedDevelopmentRunId === run.runId
            ? [developmentRunQuery.refetch(), developmentEventsQuery.refetch()]
            : []),
        ]);
        return;
      }
      await developmentCommandMutation.mutateAsync({
        runId: run.runId,
        action,
        expectedRevision: fresh.revision,
        expectedFencingVersion: fresh.fencingVersion,
        expectedDecisionEpoch: fresh.decisionEpoch,
        idempotencyKey: `spec226-ui:${run.runId}:${action}:${fresh.revision}:${fresh.fencingVersion}:${fresh.decisionEpoch}`,
      });
      toast.success(
        action === "pause"
          ? "หยุดงานชั่วคราวแล้ว"
          : "ยกเลิก DevelopmentRun แล้ว"
      );
      await Promise.all([
        developmentRunsQuery.refetch(),
        ...(expandedDevelopmentRunId === run.runId
          ? [developmentRunQuery.refetch(), developmentEventsQuery.refetch()]
          : []),
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "ควบคุม DevelopmentRun ไม่สำเร็จ"
      );
    }
  }

  function submitPrompt() {
    const value = prompt.trim();
    if (!value) return;
    onOpenPrompt(value);
    setPrompt("");
  }

  async function requestCodexApproval(runId: string) {
    const runnerId = runners.find(
      runner => runner.status === "online" && runner.trustState === "trusted"
    )?.runnerId;
    if (!runnerId) {
      toast.error("ต้องเชื่อมต่อและ trust Runner ก่อน");
      return;
    }
    try {
      const result = await requestAuthorizationApprovalMutation.mutateAsync({
        runId,
        runnerId,
        provider: "codex",
        deadline: new Date(Date.now() + 15 * 60_000).toISOString(),
        spendCeilingMicros: Number(authorizationAmounts[runId] || "500"),
      });
      toast.success(`สร้างคำขออนุมัติแล้ว: ${result.approvalRef}`);
      await authorizationStatusQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "สร้างคำขออนุมัติไม่สำเร็จ");
    }
  }

  async function reserveCodexBudget(runId: string) {
    const status = authorizationStatusQuery.data;
    const runnerId = status?.references?.runnerId;
    const approvalRef = status?.references?.approvalRef;
    const budgetId = authorizationBudgetIds[runId]?.trim();
    const amountMinorUnits = Number(authorizationAmounts[runId] || "500");
    if (!runnerId || !approvalRef || !budgetId) {
      toast.error("ต้องมี Runner, approval และ budget ID ก่อน");
      return;
    }
    try {
      await reserveAuthorizationBudgetMutation.mutateAsync({
        runId,
        runnerId,
        provider: "codex",
        approvalRef,
        budgetId,
        amountMinorUnits,
        currency: "USD",
      });
      toast.success("กันวงเงินแบบ durable แล้ว");
      await authorizationStatusQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "กันวงเงินไม่สำเร็จ");
    }
  }

  async function bindCodexAuthorization(runId: string) {
    const status = authorizationStatusQuery.data;
    const runnerId = status?.references?.runnerId;
    const approvalRef = status?.references?.approvalRef;
    const budgetReservationRef = status?.references?.budgetReservationRef;
    if (!runnerId || !approvalRef || !budgetReservationRef) return;
    try {
      const result = await bindAuthorizationMutation.mutateAsync({
        runId,
        runnerId,
        approvalRef,
        budgetReservationRef,
      });
      toast.success(result.status === "READY_FOR_LIVE" ? "พร้อมสำหรับ Owner ตรวจอนุมัติ Live" : result.status);
      await authorizationStatusQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ผูก authorization ไม่สำเร็จ");
    }
  }

  async function revokeCodexAuthorization(runId: string) {
    const status = authorizationStatusQuery.data;
    const approvalRef = status?.references?.approvalRef;
    const budgetReservationRef = status?.references?.budgetReservationRef;
    if (!approvalRef || !budgetReservationRef) return;
    try {
      await revokeAuthorizationMutation.mutateAsync({
        runId,
        approvalRef,
        budgetReservationRef,
      });
      toast.success("เพิกถอน authorization และคืนวงเงินแล้ว");
      await authorizationStatusQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เพิกถอนไม่สำเร็จ");
    }
  }

  return (
    <aside
      data-testid="control-plane-panel"
      className="flex h-full min-h-0 flex-col bg-[var(--color-background-surface)]"
      aria-label="Task Control Center panel"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <section className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
            <Network className="h-3.5 w-3.5" aria-hidden="true" />
            Task control center
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-[var(--color-text-primary)]">
            Task Control Center
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            Chat composer → approval → canonical worker job → Runner/MCP →
            verified result
          </p>
        </section>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onClose}
          aria-label="Close Task Control Center"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>

      <section
        className="shrink-0 border-b border-[var(--color-border)] bg-sky-50/50 px-4 py-3"
        aria-labelledby="control-plane-task-heading"
      >
        <h3
          id="control-plane-task-heading"
          className="text-sm font-semibold text-slate-900"
        >
          Start a task in Chat
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          The task is placed in the existing Chat composer so the normal plan,
          approval, streaming, and billing safeguards remain in one path.
        </p>
        <Textarea
          aria-label="Task to run"
          value={prompt}
          onChange={event => setPrompt(event.target.value)}
          placeholder="Describe what you want the agent to do..."
          className="mt-3 min-h-20 resize-none bg-white text-sm"
        />
        {!conversationId ? (
          <p className="mt-2 text-xs text-amber-700">
            A new Chat conversation will be created when you continue.
          </p>
        ) : null}
        <Button
          type="button"
          className="mt-3 w-full gap-2"
          onClick={submitPrompt}
          disabled={!prompt.trim()}
        >
          <Activity className="h-4 w-4" aria-hidden="true" />
          Add to chat composer
        </Button>
      </section>

      <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">
        {queryErrors.length > 0 ? (
          <section
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
            role="alert"
          >
            <p className="flex items-center gap-2 font-semibold">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              Some readiness data is unavailable
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {Array.from(new Set(queryErrors)).map(message => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="control-plane-readiness-heading">
          <header className="flex items-center justify-between gap-3">
            <section>
              <h3
                id="control-plane-readiness-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Execution readiness
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Tenant-scoped live state from the control-plane APIs
              </p>
            </section>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => void refresh()}
              disabled={hasLoadingState}
              aria-label="Refresh Task Control Center"
            >
              <RefreshCw
                className={cn("h-4 w-4", hasLoadingState && "animate-spin")}
                aria-hidden="true"
              />
            </Button>
          </header>

          {hasLoadingState ? (
            <p
              className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"
              aria-busy="true"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Checking execution readiness...
            </p>
          ) : null}

          <ul
            className="mt-3 grid grid-cols-2 gap-2"
            aria-label="Execution readiness summary"
          >
            <SummaryMetric
              icon={Activity}
              label="Chat"
              value={conversationId ? "Ready" : "New chat"}
              detail={
                conversationId
                  ? `Conversation #${conversationId}`
                  : "Conversation created on continue"
              }
              state={conversationId ? "ready" : "pending"}
            />
            <SummaryMetric
              icon={Clock3}
              label="Jobs"
              value={
                (summary?.counts.active ?? 0) +
                (summary?.counts.queued ?? 0) +
                (summary?.counts.pending ?? 0)
              }
              detail={`${summary?.counts.active ?? 0} active · ${summary?.counts.queued ?? 0} queued`}
              state={
                (summary?.alerts.hasIncident ?? false)
                  ? "error"
                  : (summary?.counts.active ?? 0) > 0
                    ? "running"
                    : "ready"
              }
            />
            <SummaryMetric
              icon={Cpu}
              label="Runner"
              value={`${activeRunners.length}/${runners.length}`}
              detail={
                runners.length
                  ? "SmartAIHub Runner nodes"
                  : "No registered SmartAIHub Runner"
              }
              state={activeRunners.length > 0 ? "online" : "offline"}
            />
            <SummaryMetric
              icon={Plug}
              label="MCP"
              value={`${activeConnections.length}/${connections.length}`}
              detail={
                connections.length
                  ? "connected provider accounts"
                  : "No connected MCP account"
              }
              state={activeConnections.length > 0 ? "connected" : "offline"}
            />
          </ul>
        </section>

        <section className="mt-5" aria-labelledby="development-runs-heading">
          <header className="flex items-center justify-between gap-3">
            <section>
              <h3
                id="development-runs-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Development runs
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Owner-scoped Spec 224 state through the canonical Spec 226
                control surface
              </p>
            </section>
            <span className="text-xs text-slate-500">
              {activeDevelopmentRuns.length} active ·{" "}
              {developmentAttentionInbox.length} needs attention
            </span>
          </header>
          <section
            className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3"
            aria-labelledby="development-attention-heading"
          >
            <header className="flex items-center justify-between gap-2">
              <h4
                id="development-attention-heading"
                className="text-xs font-semibold text-amber-950"
              >
                Needs Attention / Decision Inbox
              </h4>
              <Badge
                variant="outline"
                className="border-amber-300 text-amber-900"
              >
                {developmentAttentionInbox.length}
              </Badge>
            </header>
            {developmentAttentionInbox.length ? (
              <ul
                className="mt-2 space-y-1"
                aria-label="DevelopmentRun decisions"
              >
                {developmentAttentionInbox.map(run => (
                  <li key={`attention-${run.runId}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setExpandedDevelopmentRunId(run.runId)}
                    >
                      <span className="min-w-0 truncate">{run.runId}</span>
                      <span className="shrink-0">
                        {developmentStateLabel(run.state)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-amber-900">
                No persisted decision or recovery attention is currently
                advertised.
              </p>
            )}
          </section>
          <section className="mt-3" aria-label="Active DevelopmentRuns">
            <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Active runs
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              {activeDevelopmentRuns.length} active · terminal runs remain below
              for history
            </p>
          </section>
          <ul className="mt-2 space-y-2" aria-label="Development runs">
            {developmentRuns.length === 0 ? (
              <li>
                <QueryState
                  loading={developmentRunsQuery.isLoading}
                  error={developmentRunsQuery.error?.message}
                  empty="No DevelopmentRun is available for this account."
                />
              </li>
            ) : (
              developmentRuns.map(run => {
                const expanded = expandedDevelopmentRunId === run.runId;
                const detail = expanded ? developmentRunQuery.data : null;
                const events = expanded
                  ? (developmentEventsQuery.data?.events ?? [])
                  : [];
                return (
                  <li
                    key={run.runId}
                    data-testid={`development-run-${run.runId}`}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <section className="flex items-start gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        aria-label={`${expanded ? "Collapse" : "Expand"} development run ${run.runId}`}
                        aria-expanded={expanded}
                        aria-controls={`development-run-details-${run.runId}`}
                        onClick={() =>
                          setExpandedDevelopmentRunId(current =>
                            current === run.runId ? null : run.runId
                          )
                        }
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {expanded ? (
                            <ChevronDown
                              className="h-4 w-4 shrink-0 text-sky-700"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronRight
                              className="h-4 w-4 shrink-0 text-sky-700"
                              aria-hidden="true"
                            />
                          )}
                          <span className="truncate text-sm font-medium text-slate-900">
                            {run.runId}
                          </span>
                        </span>
                        <span className="mt-1 block pl-6 text-xs text-slate-500">
                          Attempt {run.phaseAttempt}/{run.maxPhaseAttempts} ·
                          Revision {run.revision} · Fence {run.fencingVersion}
                        </span>
                      </button>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 capitalize",
                          stateTone(run.state)
                        )}
                      >
                        {developmentStateLabel(run.state)}
                      </Badge>
                    </section>
                    <p className="mt-2 text-xs text-slate-600">
                      Next safe action:{" "}
                      {nextSafeActionLabel(run.nextSafeAction)}
                    </p>
                    <section className="mt-2 flex flex-wrap gap-2">
                      {run.actions.pause ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`Pause run ${run.runId}`}
                          onClick={() =>
                            void controlDevelopmentRun(run, "pause")
                          }
                          disabled={developmentCommandMutation.isPending}
                        >
                          Pause
                        </Button>
                      ) : null}
                      {run.actions.cancel ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-rose-700 hover:text-rose-800"
                          aria-label={`Cancel run ${run.runId}`}
                          onClick={() =>
                            void controlDevelopmentRun(run, "cancel")
                          }
                          disabled={developmentCommandMutation.isPending}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </section>
                    {expanded ? (
                      <section
                        id={`development-run-details-${run.runId}`}
                        className="mt-3 border-t border-slate-100 pt-3"
                        aria-label={`${run.runId} details`}
                      >
                        {developmentRunQuery.isLoading ? (
                          <QueryState
                            loading
                            empty="Loading DevelopmentRun details..."
                          />
                        ) : detail ? (
                          <section aria-label="Selected DevelopmentRun details">
                            <p className="text-xs text-slate-600">
                              Canonical event sequence {detail.eventSequence} ·
                              Worker job {detail.workerJobId ?? "not admitted"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Source{" "}
                              {detail.closure?.baseline.revision ??
                                "closure baseline unavailable"}
                              {detail.closure
                                ? ` · SHA-256 ${detail.closure.baseline.digest}`
                                : ""}
                              {` · decision epoch ${detail.decisionEpoch}`}
                            </p>
                            {detail.closure ? (
                              <section
                                className="mt-3"
                                aria-label="PlanSection and WorkPackage progress"
                              >
                                <h4 className="text-xs font-semibold text-slate-800">
                                  Plan and package progress
                                </h4>
                                <ul className="mt-2 space-y-2">
                                  {detail.closure.planSections.map(section => {
                                    const packages =
                                      detail.closure!.workPackages.filter(
                                        workPackage =>
                                          workPackage.planSectionId ===
                                          section.id
                                      );
                                    return (
                                      <li
                                        key={section.id}
                                        className="rounded-lg border border-slate-200 p-2"
                                      >
                                        <p className="text-xs font-medium text-slate-800">
                                          {section.id} ·{" "}
                                          {section.requirementIds.length}{" "}
                                          requirements
                                        </p>
                                        <ul className="mt-1 space-y-1 pl-2">
                                          {packages.map(workPackage => {
                                            const requirements =
                                              detail.closure!.requirements.filter(
                                                requirement =>
                                                  workPackage.requirementIds.includes(
                                                    requirement.id
                                                  )
                                              );
                                            const completed =
                                              requirements.filter(requirement =>
                                                [
                                                  "VERIFIED_PASS",
                                                  "WAIVED_BY_AUTHORIZED_DECISION",
                                                  "NOT_APPLICABLE_WITH_EVIDENCE",
                                                ].includes(requirement.state)
                                              ).length;
                                            return (
                                              <li
                                                key={workPackage.id}
                                                className="text-xs text-slate-600"
                                              >
                                                <span className="font-medium text-slate-800">
                                                  {workPackage.id}
                                                </span>
                                                {` · ${completed}/${requirements.length} requirements closed · depends on ${workPackage.dependsOn.join(", ") || "none"}`}
                                                <ul className="mt-1 space-y-1 pl-2">
                                                  {requirements.map(
                                                    requirement => (
                                                      <li key={requirement.id}>
                                                        {requirement.id} ·{" "}
                                                        {developmentStateLabel(
                                                          requirement.state
                                                        )}
                                                      </li>
                                                    )
                                                  )}
                                                </ul>
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </section>
                            ) : (
                              <p className="mt-3 text-xs text-slate-500">
                                No persisted requirement-closure graph is
                                attached to this run.
                              </p>
                            )}
                            <section
                              className="mt-3"
                              aria-label="Blockers and evidence"
                            >
                              <h4 className="text-xs font-semibold text-slate-800">
                                Blockers and evidence
                              </h4>
                              {detail.closure?.blockers.length ? (
                                <ul className="mt-1 space-y-1">
                                  {detail.closure.blockers.map(blocker => (
                                    <li
                                      key={blocker.blockerId}
                                      className="text-xs text-amber-900"
                                    >
                                      {blocker.blockerId} · {blocker.status} ·{" "}
                                      {blocker.severity} ·{" "}
                                      {blocker.classification}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-xs text-slate-500">
                                  No persisted blockers in the closure ledger.
                                </p>
                              )}
                              {detail.evidenceRefs.length ? (
                                <ul
                                  className="mt-1 space-y-1"
                                  aria-label="Evidence references"
                                >
                                  {detail.evidenceRefs.map(reference => (
                                    <li
                                      key={reference}
                                      className="break-all text-xs text-slate-600"
                                    >
                                      {reference}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-xs text-slate-500">
                                  No evidence references recorded.
                                </p>
                              )}
                            </section>
                            <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                              Deferred test obligations are not exposed by the
                              canonical Spec 226 bridge; no local test status is
                              inferred.
                            </p>
                          </section>
                        ) : null}
                        {developmentEventsQuery.error ? (
                          <p className="mt-2 text-xs text-rose-700">
                            {developmentEventsQuery.error.message}
                          </p>
                        ) : events.length > 0 ? (
                          <ol
                            className="mt-2 space-y-1 text-xs text-slate-600"
                            aria-label={`${run.runId} event history`}
                          >
                            {events.slice(-10).map(event => (
                              <li key={event.eventId}>
                                <time dateTime={event.occurredAt}>
                                  {new Date(event.occurredAt).toLocaleString()}
                                </time>
                                {` · #${event.sequence} · ${stateLabel(event.type)}`}
                              </li>
                            ))}
                          </ol>
                        ) : null}
                        <section
                          className="mt-4 rounded-xl border border-sky-100 bg-sky-50/60 p-3"
                          aria-label={`${run.runId} Codex authorization`}
                          data-testid={`development-authorization-${run.runId}`}
                        >
                          <section className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-900">
                              Codex live authorization
                            </h4>
                            <Badge
                              variant="outline"
                              className={cn(
                                "uppercase",
                                stateTone(
                                  authorizationStatusQuery.data?.status ??
                                    "not_configured"
                                )
                              )}
                            >
                              {authorizationStatusQuery.data?.status ??
                                "NOT_CONFIGURED"}
                            </Badge>
                          </section>
                          <p className="mt-2 text-xs text-slate-600">
                            สถานะนี้อ่านจาก Runner, approval authority และ
                            economic hold ที่บันทึกจริง เท่านั้น ไม่มี local
                            readiness flag
                          </p>
                          {authorizationStatusQuery.data?.reasons?.length ? (
                            <p className="mt-1 text-xs text-amber-800">
                              {authorizationStatusQuery.data.reasons.join(
                                " · "
                              )}
                            </p>
                          ) : null}
                          <section className="mt-3 grid gap-2 sm:grid-cols-[1fr_130px]">
                            <Input
                              value={authorizationBudgetIds[run.runId] ?? ""}
                              onChange={event =>
                                setAuthorizationBudgetIds(current => ({
                                  ...current,
                                  [run.runId]: event.target.value,
                                }))
                              }
                              placeholder="Existing budget ID"
                              aria-label={`Budget ID for ${run.runId}`}
                            />
                            <Input
                              value={authorizationAmounts[run.runId] ?? "500"}
                              onChange={event =>
                                setAuthorizationAmounts(current => ({
                                  ...current,
                                  [run.runId]: event.target.value,
                                }))
                              }
                              inputMode="numeric"
                              aria-label={`Budget ceiling for ${run.runId}`}
                            />
                          </section>
                          <section className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                requestAuthorizationApprovalMutation.isPending ||
                                !runners.some(
                                  runner =>
                                    runner.status === "online" &&
                                    runner.trustState === "trusted"
                                )
                              }
                              onClick={() =>
                                void requestCodexApproval(run.runId)
                              }
                            >
                              Request owner approval
                            </Button>
                            {authorizationStatusQuery.data?.references
                              ?.approvalRef ? (
                              <Button
                                asChild
                                type="button"
                                size="sm"
                                variant="ghost"
                              >
                                <Link href="/admin/approvals">
                                  Open approval queue
                                </Link>
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                reserveAuthorizationBudgetMutation.isPending ||
                                authorizationStatusQuery.data?.status !==
                                  "BUDGET_REQUIRED"
                              }
                              onClick={() => void reserveCodexBudget(run.runId)}
                            >
                              Reserve budget
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={
                                bindAuthorizationMutation.isPending ||
                                authorizationStatusQuery.data?.status !==
                                  "READY_FOR_LIVE"
                              }
                              onClick={() =>
                                void bindCodexAuthorization(run.runId)
                              }
                            >
                              Bind verified policy
                            </Button>
                            {authorizationStatusQuery.data?.references
                              ?.budgetReservationRef ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-rose-700 hover:text-rose-800"
                                disabled={revokeAuthorizationMutation.isPending}
                                onClick={() =>
                                  void revokeCodexAuthorization(run.runId)
                                }
                              >
                                Revoke
                              </Button>
                            ) : null}
                          </section>
                          <p className="mt-2 text-[11px] text-slate-500">
                            การกด Bind ยังไม่เริ่ม provider execution;
                            จะส่งเพียง policy binding เข้า canonical worker job
                          </p>
                        </section>
                      </section>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section className="mt-5" aria-labelledby="control-plane-jobs-heading">
          <header className="flex items-center justify-between gap-3">
            <h3
              id="control-plane-jobs-heading"
              className="text-sm font-semibold text-slate-900"
            >
              Tracked tasks
            </h3>
            <section className="flex items-center gap-2">
              <span className="text-xs text-slate-500">
                {taskGroups.length} group{taskGroups.length === 1 ? "" : "s"}
              </span>
              <Button
                asChild
                variant="link"
                size="sm"
                className="h-auto gap-1 px-0 text-xs"
              >
                <Link href="/worker-jobs">
                  Open queue{" "}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </Link>
              </Button>
            </section>
          </header>
          <ul className="mt-2 space-y-2" aria-label="Tracked task groups">
            {taskGroups.length === 0 ? (
              <li>
                <QueryState
                  loading={taskGroupsQuery.isLoading}
                  error={taskGroupsQuery.error?.message}
                  empty="No open tasks in this account."
                />
              </li>
            ) : (
              taskGroups.map(group => {
                const expanded = expandedTaskGroups.has(group.groupId);
                const progress = group.progressPercent ?? 0;
                return (
                  <li
                    key={group.groupId}
                    data-testid={`task-group-${group.groupId}`}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <section className="flex items-start gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        aria-label={`${expanded ? "Collapse" : "Expand"} task ${group.title}`}
                        aria-expanded={expanded}
                        aria-controls={`task-group-details-${group.groupId}`}
                        onClick={() =>
                          setExpandedTaskGroups(previous => {
                            const next = new Set(previous);
                            if (next.has(group.groupId))
                              next.delete(group.groupId);
                            else next.add(group.groupId);
                            return next;
                          })
                        }
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {expanded ? (
                            <ChevronDown
                              className="h-4 w-4 shrink-0 text-sky-700"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronRight
                              className="h-4 w-4 shrink-0 text-sky-700"
                              aria-hidden="true"
                            />
                          )}
                          <span className="truncate text-sm font-medium text-slate-900">
                            {group.title}
                          </span>
                        </span>
                        <span className="mt-1 block pl-6 text-xs text-slate-500">
                          {group.completedSteps}/{group.totalSteps} steps ·{" "}
                          {progress}%
                          {group.activeStepId
                            ? ` · Active: ${group.activeStepId}`
                            : ""}
                        </span>
                      </button>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 capitalize",
                          stateTone(group.status)
                        )}
                      >
                        {stateLabel(group.status)}
                      </Badge>
                    </section>
                    <section
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-label={`${group.title} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress}
                    >
                      <span
                        aria-hidden="true"
                        className="block h-full rounded-full bg-sky-600 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </section>
                    <p className="mt-2 truncate text-xs text-slate-500">
                      {group.latestEvent?.message ??
                        group.latestEvent?.phase ??
                        "Waiting for the first worker event."}
                    </p>
                    {group.metadataState === "degraded" ? (
                      <p className="mt-1 text-xs text-amber-700">
                        Some step metadata needs review; this task is kept
                        isolated.
                      </p>
                    ) : null}

                    {expanded ? (
                      <section
                        id={`task-group-details-${group.groupId}`}
                        className="mt-3 border-t border-slate-100 pt-3"
                        aria-label={`${group.title} steps`}
                      >
                        <ol className="space-y-2">
                          {group.jobs.map((job, index) => {
                            const stepNumber =
                              job.orchestration.stepIndex ?? index + 1;
                            const stepLabel = `Step ${stepNumber}/${group.totalSteps}`;
                            const stepProgress = job.progressPercent ?? 0;
                            return (
                              <li
                                key={job.id}
                                className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5"
                              >
                                <section className="flex items-start justify-between gap-2">
                                  <section className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-slate-800">
                                      {stepLabel} · {job.jobType}
                                    </p>
                                    <p className="mt-1 truncate text-xs text-slate-500">
                                      {job.latestEvent?.message ??
                                        job.progressPhase ??
                                        "No progress event yet."}
                                    </p>
                                  </section>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "shrink-0 capitalize",
                                      stateTone(job.status)
                                    )}
                                  >
                                    {stateLabel(job.status)}
                                  </Badge>
                                </section>
                                <section
                                  className="mt-2 h-1 rounded-full bg-slate-200"
                                  role="progressbar"
                                  aria-label={`${stepLabel} progress`}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={stepProgress}
                                >
                                  <span
                                    aria-hidden="true"
                                    className="block h-full rounded-full bg-sky-500"
                                    style={{ width: `${stepProgress}%` }}
                                  />
                                </section>
                                <section className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                                  <span>{stepProgress}%</span>
                                  {job.worker?.displayName ||
                                  job.worker?.machineName ? (
                                    <span>
                                      Worker:{" "}
                                      {job.worker.displayName ??
                                        job.worker.machineName}
                                    </span>
                                  ) : null}
                                  {job.orchestration.dependsOnJobIds.length >
                                  0 ? (
                                    <span>
                                      {job.orchestration.dependsOnJobIds.length}{" "}
                                      prerequisite(s)
                                    </span>
                                  ) : null}
                                </section>
                                {job.canCancel ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="mt-1 h-7 px-2 text-xs text-rose-700 hover:text-rose-800"
                                    onClick={() => void cancelJob(job.id)}
                                    disabled={cancelMutation.isPending}
                                  >
                                    Cancel {stepLabel.toLowerCase()}
                                  </Button>
                                ) : null}
                              </li>
                            );
                          })}
                        </ol>
                      </section>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
          {taskGroupsQuery.data?.hasMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() =>
                setTaskOffset(
                  taskGroupsQuery.data?.nextOffset ?? taskOffset + 25
                )
              }
              disabled={taskGroupsQuery.isFetching}
            >
              {taskGroupsQuery.isFetching
                ? "Loading tasks..."
                : "Load more tasks"}
            </Button>
          ) : null}
          {taskGroupsQuery.data?.sourceTruncated ? (
            <p className="mt-2 text-xs text-amber-700">
              This view is showing the first 500 open tasks. Open queue has the
              full list.
            </p>
          ) : null}
        </section>

        <section
          className="mt-5"
          aria-labelledby="control-plane-connections-heading"
        >
          <header className="flex items-center justify-between gap-3">
            <h3
              id="control-plane-connections-heading"
              className="text-sm font-semibold text-slate-900"
            >
              SmartAIHub Runner & MCP connections
            </h3>
            <Button
              asChild
              variant="link"
              size="sm"
              className="h-auto gap-1 px-0 text-xs"
            >
              <Link href="/settings?tab=integrations">
                Manage <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            </Button>
          </header>
          <ul className="mt-2 space-y-2">
            {runners.slice(0, 4).map(runner => (
              <li
                key={runner.runnerId}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-left"
                  aria-expanded={expandedRunners.has(runner.runnerId)}
                  aria-controls={`runner-inventory-${runner.runnerId}`}
                  aria-label={`${expandedRunners.has(runner.runnerId) ? "Collapse" : "Expand"} runner ${runner.displayName}`}
                  onClick={() =>
                    setExpandedRunners(previous => {
                      const next = new Set(previous);
                      if (next.has(runner.runnerId))
                        next.delete(runner.runnerId);
                      else next.add(runner.runnerId);
                      return next;
                    })
                  }
                >
                  <section className="flex min-w-0 items-center gap-2">
                    {expandedRunners.has(runner.runnerId) ? (
                      <ChevronDown
                        className="h-4 w-4 shrink-0 text-sky-700"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-sky-700"
                        aria-hidden="true"
                      />
                    )}
                    <Server
                      className="h-4 w-4 shrink-0 text-sky-600"
                      aria-hidden="true"
                    />
                    <section className="min-w-0">
                      <p className="truncate text-sm text-slate-800">
                        {runner.displayName}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {runner.platform
                          ? `${runner.platform.os} ${runner.platform.architecture}`
                          : runner.profile.replaceAll("_", " ")}{" "}
                        · {runner.toolCount} tools · {runner.capabilityCount}{" "}
                        capabilities
                      </p>
                    </section>
                  </section>
                  <Badge
                    variant="outline"
                    className={cn("capitalize", stateTone(runner.displayState))}
                  >
                    {stateLabel(runner.displayState)}
                  </Badge>
                </button>
                {expandedRunners.has(runner.runnerId) ? (
                  <section
                    id={`runner-inventory-${runner.runnerId}`}
                    className="mt-3 border-t border-slate-100 pt-3"
                    aria-label={`${runner.displayName} tool and capability inventory`}
                  >
                    <p className="text-[11px] text-slate-500">
                      Safe inventory projection; paths and credentials are
                      hidden.
                    </p>
                    <ul className="mt-2 space-y-1.5 text-xs">
                      {runner.toolInventory.map(tool => (
                        <li
                          key={`tool-${tool.id}`}
                          className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5"
                        >
                          <span className="min-w-0 truncate text-slate-700">
                            {tool.label}
                            {tool.version ? ` · ${tool.version}` : ""}
                          </span>
                          <span className="shrink-0 capitalize text-slate-500">
                            {tool.status.replaceAll("_", " ")} ·{" "}
                            {tool.availability.replaceAll("_", " ")}
                          </span>
                        </li>
                      ))}
                      {runner.capabilityInventory.map(capability => (
                        <li
                          key={`capability-${capability.id}`}
                          className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-2 py-1.5"
                        >
                          <span className="min-w-0 truncate text-slate-700">
                            {capability.id} · {capability.label}
                          </span>
                          <span className="shrink-0 capitalize text-slate-500">
                            {capability.status.replaceAll("_", " ")} ·{" "}
                            {capability.availability.replaceAll("_", " ")}
                          </span>
                        </li>
                      ))}
                      {runner.toolInventory.length === 0 &&
                      runner.capabilityInventory.length === 0 ? (
                        <li className="text-slate-500">
                          No inventory reported.
                        </li>
                      ) : null}
                    </ul>
                  </section>
                ) : null}
              </li>
            ))}
            {workerDevices.slice(0, 2).map(device => (
              <li
                key={device.deviceId}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3"
              >
                <section className="flex min-w-0 items-center gap-2">
                  <Server
                    className="h-4 w-4 shrink-0 text-sky-600"
                    aria-hidden="true"
                  />
                  <p className="truncate text-sm text-slate-800">
                    {device.displayName} · Worker App
                  </p>
                </section>
                <Badge
                  variant="outline"
                  className={cn("capitalize", stateTone(device.status))}
                >
                  {stateLabel(device.status)}
                </Badge>
              </li>
            ))}
            {connections.slice(0, 2).map(connection => (
              <li
                key={connection.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3"
              >
                <section className="flex min-w-0 items-center gap-2">
                  <ShieldCheck
                    className="h-4 w-4 shrink-0 text-violet-600"
                    aria-hidden="true"
                  />
                  <section className="min-w-0">
                    <p className="truncate text-sm text-slate-800">
                      {connection.displayName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {connection.providerDisplayName} ·{" "}
                      {connection.connectionScope}
                    </p>
                  </section>
                </section>
                <Badge
                  variant="outline"
                  className={cn("capitalize", stateTone(connection.status))}
                >
                  {stateLabel(connection.status)}
                </Badge>
              </li>
            ))}
            {runners.length === 0 &&
            workerDevices.length === 0 &&
            connections.length === 0 ? (
              <li className="rounded-xl border border-dashed border-slate-300 p-3">
                <QueryState
                  loading={devicesQuery.isLoading || connectionsQuery.isLoading}
                  error={
                    devicesQuery.error?.message ||
                    connectionsQuery.error?.message
                  }
                  empty="Connect a Worker or MCP account to make external execution available."
                />
              </li>
            ) : null}
          </ul>
        </section>

        <nav
          className="mt-5 grid gap-2 sm:grid-cols-2"
          aria-label="Task Control Center destinations"
        >
          <Button
            asChild
            variant="outline"
            size="sm"
            className="justify-start gap-2"
          >
            <Link href="/workers/connect">
              <Server className="h-4 w-4" aria-hidden="true" />
              Connect Worker
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="justify-start gap-2"
          >
            <Link href="/settings?tab=mcpDevices">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Review access
            </Link>
          </Button>
        </nav>
      </section>
    </aside>
  );
}
