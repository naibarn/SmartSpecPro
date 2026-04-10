import { useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { WorkpackHistoryTimeline } from "@/components/workpack/WorkpackHistoryTimeline";
import { WorkpackSourcePanel } from "@/components/workpack/WorkpackSourcePanel";
import { WorkpackSummaryHeader } from "@/components/workpack/WorkpackSummaryHeader";

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

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading workpack detail...</div>;
  }

  if (!data) {
    return <div className="p-6 text-sm text-slate-500">Workpack detail is unavailable.</div>;
  }

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
          </div>
        </DashboardCard>
      </div>

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
