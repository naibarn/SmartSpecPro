import { useRoute } from "wouter";
import { DashboardCard } from "@/components/dashboard";
import { trpc } from "@/lib/trpc";
import { WorkpackHistoryTimeline } from "@/components/workpack/WorkpackHistoryTimeline";
import { WorkpackSourcePanel } from "@/components/workpack/WorkpackSourcePanel";
import { WorkpackSummaryHeader } from "@/components/workpack/WorkpackSummaryHeader";

export default function WorkpackDetail() {
  const [, params] = useRoute("/workpacks/:workpackId");
  const workpackId = params?.workpackId ?? "";
  const { data, isLoading } = trpc.workpack.getDetail.useQuery(
    { workpackId },
    { enabled: Boolean(workpackId) },
  );

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
            <p>Clarification state: {data.workpack.lifecycleState}</p>
          </div>
        </DashboardCard>
      </div>

      <WorkpackHistoryTimeline
        runs={data.runs.map((run: any) => ({
          id: run.id,
          label: run.notes || run.status,
          status: run.status,
          timestamp: run.startedAt,
          summary: `${run.actualSteps.length} observed steps`,
        }))}
        exceptions={data.exceptions.map((exceptionRecord: any) => ({
          id: exceptionRecord.id,
          label: exceptionRecord.title,
          status: exceptionRecord.riskClass,
          timestamp: exceptionRecord.createdAt,
          summary: exceptionRecord.summary,
        }))}
        promotions={data.promotionRecords.map((record: any) => ({
          id: record.id,
          label: record.state,
          status: record.reasonCode ?? "n/a",
          timestamp: record.evidenceCapturedAt,
        }))}
      />
    </div>
  );
}
