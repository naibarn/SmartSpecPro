import { Link } from "wouter";
import { DashboardCard, DashboardSectionHeader } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
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
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Discovery</h1>
                <p className="max-w-3xl text-sm text-slate-600">
                  Inspect lineage, trust posture, and last-known-good assets before you clone a pack into production.
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-none flex-col gap-6">
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
        </main>
      </div>
    </div>
  );
}
