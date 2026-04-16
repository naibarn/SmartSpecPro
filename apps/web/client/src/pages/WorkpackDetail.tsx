import { useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { WorkpackHistoryTimeline } from "@/components/workpack/WorkpackHistoryTimeline";
import { WorkpackSourcePanel } from "@/components/workpack/WorkpackSourcePanel";
import { WorkpackSummaryHeader } from "@/components/workpack/WorkpackSummaryHeader";

function formatLaneDetailLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatLaneDetailValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => typeof entry === "string" ? entry : JSON.stringify(entry))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return "n/a";
}

export default function WorkpackDetail() {
  const utils = trpc.useUtils();
  const [, params] = useRoute("/workpacks/:workpackId");
  const workpackId = params?.workpackId ?? "";
  const [scheduleTitle, setScheduleTitle] = useState("Daily routine");
  const [intervalMinutes, setIntervalMinutes] = useState("1440");
  const { data, isLoading } = trpc.workpack.getDetail.useQuery(
    { workpackId },
    { enabled: Boolean(workpackId) },
  );

  const startRunMutation = trpc.workpack.startRun.useMutation({
    onSuccess: async () => {
      toast.success("Workpack launched");
      await utils.workpack.getDetail.invalidate({ workpackId });
    },
    onError: (error) => toast.error(error.message),
  });

  const createScheduleMutation = trpc.workpack.createSchedule.useMutation({
    onSuccess: async () => {
      toast.success("Schedule created");
      await utils.workpack.getDetail.invalidate({ workpackId });
    },
    onError: (error) => toast.error(error.message),
  });

  const triggerScheduleMutation = trpc.workpack.triggerSchedule.useMutation({
    onSuccess: async () => {
      toast.success("Schedule triggered");
      await utils.workpack.getDetail.invalidate({ workpackId });
    },
    onError: (error) => toast.error(error.message),
  });

  const runDueSchedulesMutation = trpc.workpack.runDueSchedules.useMutation({
    onSuccess: async (result) => {
      toast.success(result.launchedRunIds.length > 0 ? "Due schedules processed" : "No due schedules to process");
      await utils.workpack.getDetail.invalidate({ workpackId });
    },
    onError: (error) => toast.error(error.message),
  });

  const reconcileRunsMutation = trpc.workpack.reconcileRuns.useMutation({
    onSuccess: async (result) => {
      toast.success(result.reconciledRunIds.length > 0 ? "Executor status refreshed" : "No active executor jobs needed reconciliation");
      await utils.workpack.getDetail.invalidate({ workpackId });
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading workpack detail...</div>;
  }

  if (!data) {
    return <div className="p-6 text-sm text-slate-500">Workpack detail is unavailable.</div>;
  }

  const activeRuns = (data.runs ?? []).filter((run: any) => run.status === "queued" || run.status === "running");
  const recentRuns = (data.runs ?? []).slice(0, 3);
  const executorSnapshotById = new Map((data.executorSnapshots ?? []).map((snapshot: any) => [snapshot.executionId, snapshot]));

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <WorkpackSummaryHeader
        workpackId={data.workpack.id}
        title={data.workpack.title}
        description={data.workpack.description}
        lifecycleState={data.workpack.lifecycleState}
        autonomyMode={data.workpack.autonomyMode}
        gateResult={data.readiness.gateResult}
        promotionState={data.workpack.promotionState}
        nextAction={data.readiness.nextAction}
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <WorkpackSourcePanel sources={data.caseSources} />
        <DashboardCard title="Policy & Coverage" description="Execution readiness and operator posture">
          <div className="space-y-3 text-sm text-slate-600">
            <p>Evidence completeness: {(data.readiness.evidenceCompleteness * 100).toFixed(0)}%</p>
            <p>Connector health: {data.readiness.connectorHealth}</p>
            <p>Trust status: {data.readiness.trustStatus}</p>
            <p>Benchmark available: {String(data.readiness.benchmarkAvailable)}</p>
            <p>Clarification queue: {(data.playbook?.clarificationQueue ?? []).filter((question: any) => question.status === "pending").length}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => startRunMutation.mutate({ workpackId: data.workpack.id, autonomyMode: "supervised" })}
              disabled={startRunMutation.isPending}
            >
              {startRunMutation.isPending ? "Launching..." : "Launch supervised"}
            </Button>
            <Button
              onClick={() => startRunMutation.mutate({ workpackId: data.workpack.id, autonomyMode: "autonomous" })}
              disabled={startRunMutation.isPending}
            >
              Launch autonomous
            </Button>
            <Button
              variant="secondary"
              onClick={() => reconcileRunsMutation.mutate({ workpackId: data.workpack.id })}
              disabled={reconcileRunsMutation.isPending}
            >
              {reconcileRunsMutation.isPending ? "Refreshing..." : "Refresh executor status"}
            </Button>
          </div>
        </DashboardCard>
      </div>

      {data.enterprise ? (
        <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
          <DashboardCard title="Enterprise Release Gate" description="Trace, replay, readiness, and pack evidence combined into one machine-readable gate">
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{data.enterprise.releaseGate.gateResult}</Badge>
                <Badge variant="outline">Trace {data.enterprise.releaseGate.traceId ?? "n/a"}</Badge>
                {data.enterprise.releaseGate.packId ? <Badge variant="outline">Pack {data.enterprise.releaseGate.packId}</Badge> : null}
              </div>
              <p>{data.enterprise.releaseGate.explanation}</p>
              <p>Readiness status: {data.enterprise.releaseGate.readinessStatus ?? "n/a"}</p>
              <p>Replay gate: {data.enterprise.releaseGate.replayGateStatus ?? "n/a"}</p>
              {data.enterprise.packManifest ? (
                <p>
                  Pack manifest: {data.enterprise.packManifest.packId} • {data.enterprise.packManifest.publicationScope} • reversible {String(data.enterprise.packManifest.reversible)}
                </p>
              ) : null}
              {data.enterprise.releaseGate.failedChecks.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Failed checks</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-900">
                    {data.enterprise.releaseGate.failedChecks.map((check: string) => (
                      <li key={check}>{check}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </DashboardCard>

          <DashboardCard title="SDK Standards" description="Internal contract for safe reuse of this workpack pattern">
            <div className="space-y-3 text-sm text-slate-600">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supported patterns</p>
                <ul className="mt-2 space-y-1">
                  {data.enterprise.sdkContract.supportedPatterns.map((pattern: string) => (
                    <li key={pattern}>• {pattern}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Blocked patterns</p>
                <ul className="mt-2 space-y-1">
                  {data.enterprise.sdkContract.blockedPatterns.map((pattern: string) => (
                    <li key={pattern}>• {pattern}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Required signals</p>
                <p className="mt-2 text-xs text-slate-600">{data.enterprise.sdkContract.requiredSignals.join(" · ")}</p>
              </div>
            </div>
          </DashboardCard>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <DashboardCard title="Schedules" description="Recurring routine execution for day-to-day automation">
          <div className="space-y-3">
            <Input value={scheduleTitle} onChange={(event) => setScheduleTitle(event.target.value)} placeholder="Schedule title" />
            <Input value={intervalMinutes} onChange={(event) => setIntervalMinutes(event.target.value)} placeholder="Interval minutes" />
            <Button
              onClick={() => {
                const interval = Number(intervalMinutes);
                if (!Number.isFinite(interval) || interval <= 0) {
                  toast.error("Interval minutes must be a positive number");
                  return;
                }
                createScheduleMutation.mutate({
                  workpackId: data.workpack.id,
                  title: scheduleTitle || "Routine schedule",
                  triggerType: "interval",
                  intervalMinutes: interval,
                  targetAutonomyMode: "supervised",
                });
              }}
              disabled={createScheduleMutation.isPending}
            >
              {createScheduleMutation.isPending ? "Creating..." : "Create schedule"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => runDueSchedulesMutation.mutate()}
              disabled={runDueSchedulesMutation.isPending}
            >
              {runDueSchedulesMutation.isPending ? "Processing..." : "Process due schedules"}
            </Button>
            <div className="space-y-3">
              {(data.schedules ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No schedules yet.</p>
              ) : (
                (data.schedules ?? []).map((schedule: any) => (
                  <div key={schedule.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-slate-900">{schedule.title}</h4>
                      <span className="text-xs text-slate-500">{schedule.status}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Trigger: {schedule.triggerType} • Next run: {schedule.nextRunAt ?? "n/a"} • Last error: {schedule.lastError ?? "none"}
                    </p>
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="outline"
                      onClick={() => triggerScheduleMutation.mutate({ scheduleId: schedule.id })}
                      disabled={triggerScheduleMutation.isPending}
                    >
                      Trigger now
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Latest Metrics" description="Most recent evidence about this workpack">
          <div className="space-y-3 text-sm text-slate-600">
            <p>Completion rate: {Math.round((data.latestMetricSnapshot.completionRate ?? 0) * 100)}%</p>
            <p>Success rate: {Math.round((data.latestMetricSnapshot.successRate ?? 0) * 100)}%</p>
            <p>Intervention rate: {Math.round((data.latestMetricSnapshot.interventionRate ?? 0) * 100)}%</p>
            <p>Exception rate: {Math.round((data.latestMetricSnapshot.exceptionRate ?? 0) * 100)}%</p>
            <p>Policy block frequency: {Math.round((data.latestMetricSnapshot.policyBlockFrequency ?? 0) * 100)}%</p>
          </div>
        </DashboardCard>
      </div>

      <DashboardCard
        title="Live Executor Status"
        description="Recent runs, worker job references, and step-level runtime health"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <p>Active runs: {activeRuns.length}</p>
            <p>Recent runs: {recentRuns.length}</p>
            <p>Queued/running steps: {recentRuns.flatMap((run: any) => run.actualSteps ?? []).filter((step: any) => step.status === "queued" || step.status === "running").length}</p>
            <p>Tracked executors: {(data.executorSnapshots ?? []).length}</p>
          </div>
          {recentRuns.length === 0 ? (
            <p className="text-sm text-slate-500">No launches have been recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {recentRuns.map((run: any) => (
                <div key={run.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">{run.notes || run.status}</h4>
                      <p className="mt-1 text-xs text-slate-500">
                        Run {run.id} • Trigger {run.trigger ?? "manual"} • Started {run.startedAt}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(run.actualSteps ?? []).length === 0 ? (
                      <p className="text-xs text-slate-500">No actual steps captured yet.</p>
                    ) : (
                      (run.actualSteps ?? []).map((step: any) => {
                        const snapshot = step.executionRef
                          ? executorSnapshotById.get(step.executionRef.executionId)
                          : null;

                        return (
                          <div key={`${run.id}-${step.stepId}`} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium text-slate-900">{step.title}</p>
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
                                {step.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              Runtime {step.runtimePath} • Side effect {step.sideEffectClass}
                            </p>
                            {step.executionRef ? (
                              <p className="mt-1 text-xs text-sky-700">
                                {step.executionRef.provider} {step.executionRef.executionId}
                                {step.executionRef.status ? ` • ${step.executionRef.status}` : ""}
                                {step.executionRef.runtimeType ? ` • ${step.executionRef.runtimeType}` : ""}
                              </p>
                            ) : null}
                            {snapshot ? (
                              <div className="mt-2 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-sky-900">
                                <p className="font-medium">
                                  {snapshot.laneLabel} • {snapshot.runtimeType ?? "runtime pending"} • {snapshot.jobType ?? "job pending"}
                                </p>
                                <p className="mt-1 text-sky-800">
                                  Worker {snapshot.workerId ?? "unassigned"} • Status reason {snapshot.statusReason ?? "n/a"} • Resource {snapshot.resourceProfile ?? "n/a"}
                                </p>
                                <p className="mt-1 text-sky-800">
                                  Artifacts {snapshot.artifactCount} • Published {snapshot.publishedArtifactCount} • Latest event {snapshot.latestEventType ?? "n/a"}
                                </p>
                                {snapshot.failureReason ? (
                                  <p className="mt-1 text-rose-700">Failure: {snapshot.failureReason}</p>
                                ) : null}
                                {(snapshot.laneDetails ? Object.entries(snapshot.laneDetails).filter(([key]) => key !== "lane") : []).slice(0, 5).map(([key, value]: [string, unknown]) => (
                                  <p key={`${snapshot.executionId}-${key}`} className="mt-1 text-sky-800">
                                    {formatLaneDetailLabel(key)} {formatLaneDetailValue(value)}
                                  </p>
                                ))}
                                {(snapshot.recentEvents ?? []).slice(0, 2).map((event: any) => (
                                  <p key={event.eventId} className="mt-1 text-sky-700">
                                    {event.eventType ?? "event"} • {event.createdAt ?? "pending"}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                            {step.outputSummary ? (
                              <p className="mt-1 text-xs text-slate-600">{step.outputSummary}</p>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DashboardCard>

      <WorkpackHistoryTimeline
        runs={(data.runs ?? []).map((run: any) => ({
          id: run.id,
          label: run.notes || run.status,
          status: run.status,
          timestamp: run.startedAt,
          summary: `${run.actualSteps.length} observed steps`,
        }))}
        exceptions={(data.exceptions ?? []).map((exceptionRecord: any) => ({
          id: exceptionRecord.id,
          label: exceptionRecord.title,
          status: exceptionRecord.riskClass,
          timestamp: exceptionRecord.createdAt,
          summary: exceptionRecord.summary,
        }))}
        promotions={(data.promotionRecords ?? []).map((record: any) => ({
          id: record.id,
          label: record.state,
          status: record.reasonCode ?? "n/a",
          timestamp: record.evidenceCapturedAt,
        }))}
      />
    </div>
  );
}
