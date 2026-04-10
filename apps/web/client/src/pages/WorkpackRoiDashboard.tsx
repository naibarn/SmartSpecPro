import { useState } from "react";
import { DashboardCard, DashboardSectionHeader } from "@/components/dashboard";
import { trpc } from "@/lib/trpc";
import { WorkpackMetricCards } from "@/components/workpack/WorkpackMetricCards";

export default function WorkpackRoiDashboard() {
  const [sliceDimension, setSliceDimension] = useState<"workpack" | "team" | "profession" | "connector" | "runtime" | "risk_tier" | "policy_profile">("profession");
  const { data, isLoading } = trpc.workpack.roiDashboard.useQuery({ sliceDimension });
  const recommendations = data?.recommendations ?? [];
  const slices = data?.slices ?? [];

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
        description="Track completion, intervention, rollback pressure, policy friction, and evidence-based recommendations for the next workpack to automate."
      />

      <WorkpackMetricCards metrics={data.totals} />

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
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

        <DashboardCard title="Automation Recommendations" description="Use evidence, not gut feel, to decide what to promote or automate next">
          <div className="space-y-3">
            {recommendations.length === 0 ? (
              <p className="text-sm text-slate-500">No recommendations yet.</p>
            ) : (
              recommendations.map((item: any, index: number) => (
                <div key={`${item.kind}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{item.kind}</p>
                    <span className="text-xs text-slate-500">{item.count}x</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
                  {item.workpackId ? <p className="mt-1 text-xs text-slate-500">Workpack: {item.workpackId}</p> : null}
                </div>
              ))
            )}
          </div>
        </DashboardCard>
      </div>

      <DashboardCard title="ROI Slices" description="Compare automation outcomes by workpack, profession, connector, runtime, or policy profile">
        <div className="mb-4 max-w-xs">
          <label className="space-y-2 text-sm text-slate-600">
            <span>Slice dimension</span>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={sliceDimension}
              onChange={(event) => setSliceDimension(event.target.value as typeof sliceDimension)}
            >
              {["workpack", "team", "profession", "connector", "runtime", "risk_tier", "policy_profile"].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="space-y-3">
          {slices.length === 0 ? (
            <p className="text-sm text-slate-500">No slice data available yet.</p>
          ) : (
            slices.map((slice: any) => (
              <div key={`${slice.dimension}-${slice.value}`} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">{slice.value}</p>
                  <span className="text-xs text-slate-500">{slice.dimension}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Completion {Math.round(slice.completionRate * 100)}% • Intervention {Math.round(slice.interventionRate * 100)}% • Exception {Math.round(slice.exceptionRate * 100)}%
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Throughput/day {slice.throughputPerDay.toFixed(0)} • Cost/run {slice.averageCostPerRun.toFixed(2)}
                </p>
              </div>
            ))
          )}
        </div>
      </DashboardCard>
    </div>
  );
}
