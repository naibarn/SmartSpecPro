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
    ].includes(normalized)
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function stateLabel(state: string): string {
  return state.replaceAll("_", " ");
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
  const [expandedRunners, setExpandedRunners] = useState<Set<string>>(
    new Set()
  );
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
  ].some(query => query.isLoading && !query.data);
  const queryErrors = [
    summaryQuery,
    taskGroupsQuery,
    devicesQuery,
    connectionsQuery,
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

  function submitPrompt() {
    const value = prompt.trim();
    if (!value) return;
    onOpenPrompt(value);
    setPrompt("");
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
                      if (next.has(runner.runnerId)) next.delete(runner.runnerId);
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
                          : runner.profile.replaceAll("_", " ")} · {runner.toolCount} tools · {runner.capabilityCount} capabilities
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
                      Safe inventory projection; paths and credentials are hidden.
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
                            {tool.status.replaceAll("_", " ")} · {tool.availability.replaceAll("_", " ")}
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
                            {capability.status.replaceAll("_", " ")} · {capability.availability.replaceAll("_", " ")}
                          </span>
                        </li>
                      ))}
                      {runner.toolInventory.length === 0 &&
                      runner.capabilityInventory.length === 0 ? (
                        <li className="text-slate-500">No inventory reported.</li>
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
