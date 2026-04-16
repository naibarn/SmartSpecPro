import { Link } from "wouter";
import { DashboardCard, DashboardSectionHeader } from "@/components/dashboard";
import { trpc } from "@/lib/trpc";
import { buildWorkpackDetailHref } from "@/lib/workpackNavigation";

export default function WorkpackDiscovery() {
  const { data, isLoading } = trpc.workpack.discovery.useQuery();

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading discovery library...</div>;
  }

  if (!data) {
    return <div className="p-6 text-sm text-slate-500">Discovery library is unavailable.</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <DashboardSectionHeader
        eyebrow="Discovery"
        title="Browse reusable playbook starters and benchmark packs"
        description="Inspect lineage, trust posture, and last-known-good assets before you clone a pack into production."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard title="Starter Workpacks" description="Draft and reusable packs already in this tenant">
          <div className="space-y-3">
            {data.starters.map((starter: any) => (
              <div key={starter.workpackId} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{starter.title}</p>
                    <p className="text-xs text-slate-500">{starter.domainPack} • {starter.lifecycleState}</p>
                  </div>
                  <Link
                    href={buildWorkpackDetailHref(starter.workpackId)}
                    className="text-sm font-medium text-sky-700 no-underline hover:underline"
                  >
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard title="Benchmark Packs" description="Published packs with lineage and sharing posture">
          <div className="space-y-3">
            {data.benchmarks.length === 0 ? (
              <p className="text-sm text-slate-500">No benchmark packs have been published yet.</p>
            ) : (
              data.benchmarks.map((benchmark: any) => (
                <div key={benchmark.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">{benchmark.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Scope: {benchmark.publicationScope} • Trust: {benchmark.trustTags.join(", ")}
                  </p>
                  {benchmark.manifest ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Manifest: {benchmark.manifest.packId} • reversible {String(benchmark.manifest.reversible)} • connectors {benchmark.manifest.connectorFamilies.join(", ") || "n/a"}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
