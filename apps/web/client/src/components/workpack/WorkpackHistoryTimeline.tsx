import { DashboardCard } from "@/components/dashboard";

type TimelineItem = {
  id: string;
  label: string;
  status: string;
  timestamp: string;
  summary?: string | null;
};

type WorkpackHistoryTimelineProps = {
  runs?: TimelineItem[];
  exceptions?: TimelineItem[];
  promotions?: TimelineItem[];
};

export function WorkpackHistoryTimeline({
  runs = [],
  exceptions = [],
  promotions = [],
}: WorkpackHistoryTimelineProps) {
  const items = [
    ...runs.map((item) => ({ ...item, bucket: "Run" })),
    ...exceptions.map((item) => ({ ...item, bucket: "Exception" })),
    ...promotions.map((item) => ({ ...item, bucket: "Promotion" })),
  ].sort((left, right) => right.timestamp.localeCompare(left.timestamp));

  return (
    <DashboardCard
      title="History Timeline"
      description="Runs, exceptions, and promotion events in one ordered view"
    >
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No history has been recorded yet.</p>
        ) : (
          items.map((item) => (
            <div key={`${item.bucket}-${item.id}`} className="rounded-2xl border border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{item.bucket}: {item.label}</p>
                <span className="text-xs text-slate-500">{item.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.timestamp}</p>
              {item.summary ? <p className="mt-2 text-sm text-slate-600">{item.summary}</p> : null}
            </div>
          ))
        )}
      </div>
    </DashboardCard>
  );
}
