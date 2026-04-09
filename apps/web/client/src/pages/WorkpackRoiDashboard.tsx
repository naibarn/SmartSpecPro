import { DashboardCard, DashboardSectionHeader } from "@/components/dashboard";
import { trpc } from "@/lib/trpc";
import { WorkpackMetricCards } from "@/components/workpack/WorkpackMetricCards";

export default function WorkpackRoiDashboard() {
  const { data, isLoading } = trpc.workpack.roiDashboard.useQuery();

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading workpack ROI...</div>;
  }

  if (!data) {
    return <div className="p-6 text-sm text-slate-500">ROI data is unavailable.</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <DashboardSectionHeader
        eyebrow="ROI Dashboard"
        title="Measure where autonomous work is actually improving"
        description="Track completion, intervention, exception burden, cost, and time saved without rebuilding the run monitor."
      />

      <WorkpackMetricCards metrics={data.totals} />

      <DashboardCard title="Readiness Snapshot" description="Promotion and rollout posture across workpacks">
        <div className="space-y-3">
          {data.readiness.map((item: any) => (
            <div key={item.workpackId} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{item.workpackId}</p>
                <span className="text-xs text-slate-500">{item.gateResult}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{item.nextAction}</p>
            </div>
          ))}
        </div>
      </DashboardCard>
    </div>
  );
}
