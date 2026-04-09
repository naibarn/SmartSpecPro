import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { WorkpackDiffViewer } from "@/components/workpack/WorkpackDiffViewer";
import { WorkpackSummaryHeader } from "@/components/workpack/WorkpackSummaryHeader";

export default function WorkpackReplayLab() {
  const [, params] = useRoute("/workpacks/:workpackId/replay");
  const workpackId = params?.workpackId ?? "";
  const detailQuery = trpc.workpack.getDetail.useQuery({ workpackId }, { enabled: Boolean(workpackId) });
  const replayQuery = trpc.workpack.replay.useQuery({ workpackId }, { enabled: Boolean(workpackId) });

  if (detailQuery.isLoading || replayQuery.isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading replay evidence...</div>;
  }

  if (!detailQuery.data || !replayQuery.data) {
    return <div className="p-6 text-sm text-slate-500">Replay evidence is unavailable.</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <WorkpackSummaryHeader
        workpackId={detailQuery.data.workpack.id}
        title={`${detailQuery.data.workpack.title} Replay Lab`}
        description="Inspection-only replay, drift evidence, and remediation pointers"
        lifecycleState={detailQuery.data.workpack.lifecycleState}
        autonomyMode={detailQuery.data.workpack.autonomyMode}
        gateResult={replayQuery.data.gateStatus}
        promotionState={detailQuery.data.workpack.promotionState}
        nextAction={replayQuery.data.nextAction}
      />
      <WorkpackDiffViewer diffs={replayQuery.data.diffs} />
    </div>
  );
}
