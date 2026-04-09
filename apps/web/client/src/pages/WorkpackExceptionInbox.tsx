import { DashboardCard, DashboardSectionHeader } from "@/components/dashboard";
import { trpc } from "@/lib/trpc";

export default function WorkpackExceptionInbox() {
  const { data: exceptions = [], isLoading } = trpc.workpack.exceptionInbox.useQuery();
  const grouped = exceptions.reduce<Record<string, { count: number; title: string; summary: string; riskClass: string; nextAction: string }>>(
    (acc, item: any) => {
      const key = item.reasonCode ?? item.id;
      if (!acc[key]) {
        acc[key] = {
          count: 0,
          title: item.title,
          summary: item.summary,
          riskClass: item.riskClass,
          nextAction: item.nextAction,
        };
      }
      acc[key].count += 1;
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <DashboardSectionHeader
        eyebrow="Exception Inbox"
        title="Boundary failures, drift, and clarifications in one queue"
        description="Triage the reasons workpacks could not proceed, grouped by reusable remediation paths."
      />

      <DashboardCard title="Open Exceptions" description="Grouped by reason code and next action">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading exception inbox...</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-slate-500">No open exceptions right now.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([reasonCode, item]) => (
              <div key={reasonCode} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                  <span className="text-xs text-slate-500">{item.riskClass} • {item.count}x</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
                <p className="mt-2 text-xs text-slate-500">Next action: {item.nextAction}</p>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
