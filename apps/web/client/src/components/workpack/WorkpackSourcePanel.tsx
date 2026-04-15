import { DashboardCard } from "@/components/dashboard";

type SourceItem = {
  id: string;
  title: string;
  type: string;
  summary: string;
  trace?: Array<{
    originSurface: string;
    label: string;
  }>;
};

type WorkpackSourcePanelProps = {
  sources: SourceItem[];
};

export function WorkpackSourcePanel({ sources }: WorkpackSourcePanelProps) {
  return (
    <DashboardCard
      title="Source Provenance"
      description="Original materials, provenance traces, and normalized summaries"
    >
      <div className="space-y-3">
        {sources.length === 0 ? (
          <p className="text-sm text-slate-500">No source artifacts attached yet.</p>
        ) : (
          sources.map((source) => (
            <div key={source.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-slate-900">{source.title}</h4>
                <span className="text-xs uppercase tracking-wide text-slate-500">{source.type}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{source.summary || "No summary available."}</p>
              {source.trace?.length ? (
                <p className="mt-2 text-xs text-slate-500">
                  Trace: {source.trace.map((trace) => `${trace.originSurface}: ${trace.label}`).join(" • ")}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </DashboardCard>
  );
}
