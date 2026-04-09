import { Link } from "wouter";
import { DashboardCard, DashboardSectionHeader } from "@/components/dashboard";
import { trpc } from "@/lib/trpc";
import { WorkpackSourcePanel } from "@/components/workpack/WorkpackSourcePanel";
import { buildWorkpackEntrypointHref } from "@/lib/workpackNavigation";

export default function WorkpackIntakeStudio() {
  const { data: workpacks = [], isLoading } = trpc.workpack.list.useQuery();
  const { data: domainPacks = [] } = trpc.workpack.listDomainPackSuggestions.useQuery();

  const intakeCandidates = workpacks.filter((item) => (
    item.workpack.lifecycleState === "draft"
    || item.workpack.lifecycleState === "clarification_needed"
    || item.workpack.lifecycleState === "needs_review"
  ));
  const focus = intakeCandidates[0] ?? null;
  const focusDetailQuery = trpc.workpack.getDetail.useQuery(
    { workpackId: focus?.workpack.id ?? "" },
    { enabled: Boolean(focus?.workpack.id) },
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <DashboardSectionHeader
        eyebrow="Case Intake Studio"
        title="Draft cases into bounded autonomous workpacks"
        description="Review provenance, clarification gaps, and draft playbooks before the workpack moves into simulation."
      />

      <DashboardCard title="Pack Suggestions" description="Available starter domains for routine automation">
        <div className="flex flex-wrap gap-2">
          {domainPacks.map((pack) => (
            <span key={pack} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
              {pack}
            </span>
          ))}
        </div>
      </DashboardCard>

      <DashboardCard title="Draft Queue" description="Cases waiting for clarification, simulation, or operator review">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading draft workpacks...</p>
        ) : intakeCandidates.length === 0 ? (
          <p className="text-sm text-slate-500">No intake drafts are waiting right now.</p>
        ) : (
          <div className="space-y-3">
            {intakeCandidates.map(({ workpack, readiness }) => (
              <div key={workpack.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{workpack.title}</h3>
                    <p className="text-sm text-slate-600">{workpack.goal}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Lifecycle: {workpack.lifecycleState} • Next action: {readiness.nextAction}
                    </p>
                  </div>
                  <Link
                    href={buildWorkpackEntrypointHref({ entrypoint: "chat", workpackId: workpack.id })}
                    className="text-sm font-medium text-sky-700 no-underline hover:underline"
                  >
                    Open draft
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      {focus && focusDetailQuery.data ? <WorkpackSourcePanel sources={focusDetailQuery.data.caseSources} /> : null}
    </div>
  );
}
