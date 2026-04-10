import { useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { WorkpackDiffViewer } from "@/components/workpack/WorkpackDiffViewer";
import { WorkpackSummaryHeader } from "@/components/workpack/WorkpackSummaryHeader";

export default function WorkpackReplayLab() {
  const utils = trpc.useUtils();
  const [, params] = useRoute("/workpacks/:workpackId/replay");
  const workpackId = params?.workpackId ?? "";
  const [mode, setMode] = useState<"fixture" | "masked_history" | "synthetic" | "trace_replay">("fixture");
  const [payloadText, setPayloadText] = useState("{\n  \"record_id\": \"sample-1\",\n  \"status\": \"open\"\n}");

  const detailQuery = trpc.workpack.getDetail.useQuery({ workpackId }, { enabled: Boolean(workpackId) });
  const replayQuery = trpc.workpack.replay.useQuery({ workpackId }, { enabled: Boolean(workpackId) });
  const simulateMutation = trpc.workpack.simulate.useMutation({
    onSuccess: async () => {
      toast.success("Simulation replay updated");
      await Promise.all([
        utils.workpack.getDetail.invalidate({ workpackId }),
        utils.workpack.replay.invalidate({ workpackId }),
        utils.workpack.readiness.invalidate({ workpackId }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

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
        description="Inspection-only replay, drift evidence, masked history rehearsal, and synthetic dry-runs"
        lifecycleState={detailQuery.data.workpack.lifecycleState}
        autonomyMode={detailQuery.data.workpack.autonomyMode}
        gateResult={replayQuery.data.gateStatus}
        promotionState={detailQuery.data.workpack.promotionState}
        nextAction={replayQuery.data.nextAction}
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <DashboardCard title="Simulation Controls" description="Choose the replay mode that best matches the evidence you have">
          <div className="space-y-3">
            <label className="space-y-2 text-sm text-slate-600">
              <span>Replay mode</span>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                value={mode}
                onChange={(event) => setMode(event.target.value as typeof mode)}
              >
                <option value="fixture">Fixture</option>
                <option value="masked_history">Masked history</option>
                <option value="synthetic">Synthetic</option>
                <option value="trace_replay">Trace replay</option>
              </select>
            </label>
            <Textarea
              className="min-h-[220px] font-mono text-xs"
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  let payload: Record<string, unknown> | undefined;
                  try {
                    payload = payloadText.trim() ? JSON.parse(payloadText) as Record<string, unknown> : undefined;
                  } catch {
                    toast.error("Simulation payload JSON is invalid");
                    return;
                  }
                  simulateMutation.mutate({
                    workpackId,
                    mode,
                    payload,
                      replayRunId: mode === "trace_replay" ? (detailQuery.data.runs?.[0]?.id ?? null) : null,
                    });
                  }}
                disabled={simulateMutation.isPending}
              >
                {simulateMutation.isPending ? "Running..." : "Run simulation"}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Latest run count: {detailQuery.data.runs?.length ?? 0} • Latest simulation count: {detailQuery.data.simulations?.length ?? 0}
            </p>
          </div>
        </DashboardCard>

        <WorkpackDiffViewer diffs={replayQuery.data.diffs} />
      </div>
    </div>
  );
}
