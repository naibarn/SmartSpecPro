import { useMemo, useState } from "react";
import { Link } from "wouter";
import { DashboardCard, DashboardKpiCard, DashboardSectionHeader } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { WorkpackMetricCards } from "@/components/workpack/WorkpackMetricCards";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, PackageSearch } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

export default function WorkpackRoiDashboard() {
  const [sliceDimension, setSliceDimension] = useState<"workpack" | "team" | "profession" | "connector" | "runtime" | "risk_tier" | "policy_profile">("profession");
  const [roadmapTrendScope, setRoadmapTrendScope] = useState<"all" | "workpack" | "owner">("all");
  const [roadmapTrendWorkpackId, setRoadmapTrendWorkpackId] = useState<string>("all");
  const [roadmapTrendOwner, setRoadmapTrendOwner] = useState<string>("all");
  const { data, isLoading } = trpc.workpack.roiDashboard.useQuery({ sliceDimension });
  const recommendations = data?.recommendations ?? [];
  const slices = data?.slices ?? [];
  const roadmapProgress = data?.roadmapProgress ?? [];
  const roadmapTrend = data?.roadmapTrend ?? [];
  const enterprise = data?.enterprise ?? [];
  const roadmapSummary = data?.roadmapSummary ?? {
    workpackCount: 0,
    phaseCounts: { ready: 0, review_required: 0, blocked: 0 },
    blockerCounts: [],
  };

  const roadmapTrendWorkpackOptions = useMemo(() => [
    { value: "all", label: "All workpacks" },
    ...roadmapProgress.map((item: any) => ({
      value: item.workpackId,
      label: item.title ?? item.workpackId,
    })),
  ], [roadmapProgress]);

  const roadmapTrendOwnerOptions = useMemo(() => {
    const owners = new Set<string>();
    for (const item of roadmapProgress) {
      for (const phase of item?.phases ?? []) {
        if (typeof phase?.owner === "string" && phase.owner.trim()) {
          owners.add(phase.owner);
        }
      }
    }
    return [
      { value: "all", label: "All owners" },
      ...Array.from(owners).sort().map((owner) => ({ value: owner, label: owner })),
    ];
  }, [roadmapProgress]);

  const filteredRoadmapTrend = useMemo(() => {
    const filteredProgress = roadmapProgress.filter((item: any) => {
      if (roadmapTrendScope === "workpack") {
        return roadmapTrendWorkpackId === "all" || item.workpackId === roadmapTrendWorkpackId;
      }
      if (roadmapTrendScope === "owner") {
        if (roadmapTrendOwner === "all") return true;
        return (item?.phases ?? []).some((phase: any) => phase?.owner === roadmapTrendOwner);
      }
      return true;
    });

    const ordered = [...filteredProgress].sort((left, right) => String(left.updatedAt ?? "").localeCompare(String(right.updatedAt ?? "")));
    const accumulator = { ready: 0, review_required: 0, blocked: 0 };

    return ordered.map((item: any, index: number) => {
      for (const phase of item?.phases ?? []) {
        if (phase?.status in accumulator) {
          accumulator[phase.status as keyof typeof accumulator] += 1;
        }
      }
      return {
        workpackId: item.workpackId,
        title: item.title,
        owner: roadmapTrendScope === "owner" ? roadmapTrendOwner : "all",
        updatedAt: item.updatedAt,
        sequence: index + 1,
        ready: accumulator.ready,
        review_required: accumulator.review_required,
        blocked: accumulator.blocked,
        totalPhases: accumulator.ready + accumulator.review_required + accumulator.blocked,
      };
    });
  }, [roadmapProgress, roadmapTrendOwner, roadmapTrendScope, roadmapTrendWorkpackId]);

  const displayedRoadmapTrend = roadmapTrendScope === "all"
    ? (roadmapTrend.length > 0 ? roadmapTrend : filteredRoadmapTrend)
    : filteredRoadmapTrend;
  const roadmapTrendScopeLabel = roadmapTrendScope === "all"
    ? "All workpacks"
    : roadmapTrendScope === "workpack"
      ? roadmapTrendWorkpackOptions.find((option) => option.value === roadmapTrendWorkpackId)?.label ?? "Selected workpack"
      : roadmapTrendOwnerOptions.find((option) => option.value === roadmapTrendOwner)?.label ?? "Selected owner";

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading workpack ROI...</div>;
  }

  if (!data) {
    return <div className="p-6 text-sm text-slate-500">ROI data is unavailable.</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-sky-50/40">
      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-none flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="gap-1">
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4" />
                  Dashboard
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">ROI Dashboard</h1>
                <p className="max-w-3xl text-sm text-slate-600">
                  Track completion, intervention, rollback pressure, policy friction, and evidence-based recommendations for the next workpack to automate.
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-none flex-col gap-6">
            <DashboardSectionHeader
              eyebrow="ROI Dashboard"
              title="Measure where autonomous work is actually improving"
              description="Track completion, intervention, rollback pressure, policy friction, and evidence-based recommendations for the next workpack to automate."
            />

            <WorkpackMetricCards metrics={data.totals} />

      <DashboardCard
        title="097 Roadmap Control Plane"
        description="Monitor the overall progress of governed context, tracing, exchange, and readiness across all workpacks."
      >
        <div className="grid gap-3 md:grid-cols-4">
          <DashboardKpiCard
            icon={PackageSearch}
            label="Workpacks"
            value={roadmapSummary.workpackCount}
            subLabel={<Badge variant="outline">Across roadmap</Badge>}
          />
          <DashboardKpiCard
            icon={CheckCircle2}
            label="Ready phases"
            value={roadmapSummary.phaseCounts.ready}
            subLabel={<Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Stable</Badge>}
          />
          <DashboardKpiCard
            icon={CircleDashed}
            label="Review required"
            value={roadmapSummary.phaseCounts.review_required}
            subLabel={<Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Needs attention</Badge>}
          />
          <DashboardKpiCard
            icon={AlertTriangle}
            label="Blocked phases"
            value={roadmapSummary.phaseCounts.blocked}
            subLabel={<Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Needs action</Badge>}
          />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Top blockers</p>
            <p className="text-xs text-slate-500">Aggregated from all roadmap phases</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {roadmapSummary.blockerCounts.length === 0 ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                No blockers detected
              </Badge>
            ) : (
              roadmapSummary.blockerCounts.map((item) => (
                <Badge
                  key={item.blocker}
                  variant="outline"
                  className="border-slate-200 bg-white text-slate-700"
                  title={`Appears in ${item.count} phase(s)`}
                >
                  {item.blocker} · {item.count}
                </Badge>
              ))
            )}
          </div>
        </div>
      </DashboardCard>

      <DashboardCard
        title="097 Roadmap Trend"
        description="Cumulative ready, review-required, and blocked phase counts ordered by workpack recency."
      >
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <label className="space-y-2 text-sm text-slate-600">
            <span>Trend scope</span>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={roadmapTrendScope}
              onChange={(event) => setRoadmapTrendScope(event.target.value as typeof roadmapTrendScope)}
            >
              <option value="all">All workpacks</option>
              <option value="workpack">Single workpack</option>
              <option value="owner">Phase owner</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-600">
            <span>Workpack</span>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={roadmapTrendWorkpackId}
              onChange={(event) => setRoadmapTrendWorkpackId(event.target.value)}
              disabled={roadmapTrendScope !== "workpack"}
            >
              {roadmapTrendWorkpackOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-600">
            <span>Phase owner</span>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={roadmapTrendOwner}
              onChange={(event) => setRoadmapTrendOwner(event.target.value)}
              disabled={roadmapTrendScope !== "owner"}
            >
              {roadmapTrendOwnerOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Showing {displayedRoadmapTrend.length} point(s) · scope {roadmapTrendScopeLabel}
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Ready</Badge>
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Review required</Badge>
          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Blocked</Badge>
          <Badge variant="outline" className="border-slate-200 bg-white text-slate-700" title="Currently selected filter context">
            {roadmapTrendScopeLabel}
          </Badge>
        </div>
        {displayedRoadmapTrend.length === 0 ? (
          <p className="text-sm text-slate-500">No roadmap trend data yet.</p>
        ) : (
          <ChartContainer
            config={{
              ready: { label: "Ready", color: "hsl(142, 71%, 45%)" },
              review_required: { label: "Review required", color: "hsl(38, 92%, 50%)" },
              blocked: { label: "Blocked", color: "hsl(0, 84%, 60%)" },
            }}
            className="h-[260px] w-full"
          >
            <LineChart data={displayedRoadmapTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="sequence"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                tickFormatter={(value) => `#${value}`}
              />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={36} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const item = payload?.[0]?.payload as { title?: string; updatedAt?: string; owner?: string } | undefined;
                      if (!item) return "Roadmap trend";
                      const dateText = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                      const ownerText = item.owner && item.owner !== "all" ? ` • ${item.owner}` : "";
                      return `${item.title ?? "Workpack"}${ownerText}${dateText ? ` • ${dateText}` : ""}`;
                    }}
                  />
                }
              />
              <Line type="monotone" dataKey="ready" stroke="var(--color-ready)" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="review_required" stroke="var(--color-review_required)" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="blocked" stroke="var(--color-blocked)" strokeWidth={3} dot={false} />
            </LineChart>
          </ChartContainer>
        )}
      </DashboardCard>

      <DashboardCard title="097 Roadmap Progress" description="Phase-by-phase status for governed context, tracing, exchange, and readiness">
        <div className="space-y-3">
          {roadmapProgress.length === 0 ? (
            <p className="text-sm text-slate-500">No roadmap progress records yet.</p>
          ) : (
            roadmapProgress.map((item: any) => {
              const phases = Array.isArray(item?.phases) ? item.phases : [];
              return (
                <div key={item.workpackId} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.workpackId}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {phases.map((phase: any) => (
                        <Badge
                          key={`${item.workpackId}-${phase.phase}`}
                          variant="outline"
                          className={
                            phase.status === "ready"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : phase.status === "review_required"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-rose-200 bg-rose-50 text-rose-700"
                          }
                          title={`${phase.title} • ${phase.nextAction}`}
                        >
                          P{phase.phase} {phase.status}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {phases.map((phase: any) => (
                      <div key={`${item.workpackId}-${phase.phase}-panel`} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{phase.title}</p>
                          <span className="text-xs text-slate-500">P{phase.phase}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Owner: {phase.owner} • Reviewer: {phase.reviewer}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">{phase.nextAction}</p>
                        {phase.blockers?.length > 0 ? (
                          <p className="mt-2 text-xs text-rose-700">Blockers: {phase.blockers.join(", ")}</p>
                        ) : (
                          <p className="mt-2 text-xs text-emerald-700">No blocking issues detected</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DashboardCard>

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

      <DashboardCard title="Enterprise Posture" description="Release gates, pack manifests, and SDK standards derived from durable evidence">
        <div className="space-y-3">
          {enterprise.length === 0 ? (
            <p className="text-sm text-slate-500">No enterprise posture records yet.</p>
          ) : (
            enterprise.map((item: any) => (
              <div key={item.workpackId} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.workpackId}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{item.releaseGate.gateResult}</Badge>
                    <Badge variant="outline">{item.sdkContract.kind}</Badge>
                    {item.manifest ? <Badge variant="outline">Pack {item.manifest.packId}</Badge> : null}
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.releaseGate.explanation}</p>
                <p className="mt-1 text-xs text-slate-500">
                  SDK support: {item.sdkContract.supportedPatterns.length} • blocked: {item.sdkContract.blockedPatterns.length} • signals: {item.sdkContract.requiredSignals.join(" · ")}
                </p>
                {item.manifest ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Manifest: {item.manifest.publicationScope} • reversible {String(item.manifest.reversible)} • connectors {item.manifest.connectorFamilies.join(", ") || "n/a"}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </DashboardCard>

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
        </main>
      </div>
    </div>
  );
}
