import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { WorkpackConnectorMatrix } from "@/components/workpack/WorkpackConnectorMatrix";
import { WorkpackSummaryHeader } from "@/components/workpack/WorkpackSummaryHeader";

export default function WorkpackConnectorStudio() {
  const [, params] = useRoute("/workpacks/:workpackId/connectors");
  const workpackId = params?.workpackId ?? "";
  const detailQuery = trpc.workpack.getDetail.useQuery({ workpackId }, { enabled: Boolean(workpackId) });
  const connectorQuery = trpc.workpack.connectors.useQuery({ workpackId }, { enabled: Boolean(workpackId) });

  if (detailQuery.isLoading || connectorQuery.isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading connector posture...</div>;
  }

  if (!detailQuery.data || !connectorQuery.data) {
    return <div className="p-6 text-sm text-slate-500">Connector studio is unavailable.</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <WorkpackSummaryHeader
        workpackId={detailQuery.data.workpack.id}
        title={`${detailQuery.data.workpack.title} Connector Studio`}
        description="Field mappings, scope posture, and side-effect boundaries"
        lifecycleState={detailQuery.data.workpack.lifecycleState}
        autonomyMode={detailQuery.data.workpack.autonomyMode}
        gateResult={detailQuery.data.readiness.gateResult}
        promotionState={detailQuery.data.workpack.promotionState}
        nextAction={detailQuery.data.readiness.nextAction}
      />
      <WorkpackConnectorMatrix connectorMaps={connectorQuery.data.connectorMaps} />
    </div>
  );
}
