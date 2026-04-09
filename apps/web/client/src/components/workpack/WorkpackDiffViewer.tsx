import { DashboardCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";

type DiffItem = {
  category: string;
  severity: string;
  summary: string;
  remediationPointer: string;
};

type WorkpackDiffViewerProps = {
  diffs: DiffItem[];
};

export function WorkpackDiffViewer({ diffs }: WorkpackDiffViewerProps) {
  return (
    <DashboardCard
      title="Replay Diffs"
      description="Expected versus actual outcomes, drift markers, and remediation paths"
    >
      <div className="space-y-3">
        {diffs.length === 0 ? (
          <p className="text-sm text-slate-500">No replay drift detected.</p>
        ) : (
          diffs.map((diff, index) => (
            <div key={`${diff.category}-${index}`} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{diff.category}</Badge>
                <Badge variant="outline">{diff.severity}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-700">{diff.summary}</p>
              <p className="mt-2 text-xs text-slate-500">Remediation: {diff.remediationPointer}</p>
            </div>
          ))
        )}
      </div>
    </DashboardCard>
  );
}
