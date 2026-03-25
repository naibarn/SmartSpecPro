import { useState } from "react";
import { useLocation } from "wouter";
import { Bot, ChevronRight, Loader2, Sparkles, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  buildHybridPlanSummary,
  formatHybridPlanInstructions,
  type HybridOrchestrationPlan,
  type HybridPlanPayload,
} from "@shared/orchestration/hybridOrchestration";

export interface HybridOrchestrationCardProps {
  message: string;
  reason: string;
  plan: HybridOrchestrationPlan;
  onKeepInChat: () => void;
}

export function HybridOrchestrationCard({
  message,
  reason,
  plan,
  onKeepInChat,
}: HybridOrchestrationCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();

  const { data: agencyData } = trpc.agency.list.useQuery(
    { status: "published" },
    { staleTime: 60_000 },
  );
  const agencyList = agencyData?.agencies as Array<{ id: string; name: string }> | undefined;
  const createHybridPreviewTokenMutation = trpc.hybridOrchestration.createPreviewToken.useMutation();

  const handlePreviewHybridFlow = async () => {
    if (!agencyList || agencyList.length === 0) {
      toast.error("No agencies available. Please create one in the Agency Builder.");
      return;
    }

    setIsLoading(true);
    try {
      const agency = agencyList[0];
      const payload: HybridPlanPayload = { draft: message, plan };
      const result = await createHybridPreviewTokenMutation.mutateAsync({
        agencyId: agency.id,
        payload,
        sourceSurface: "chat",
      });
      const query = new URLSearchParams({ hybridPreviewToken: result.token });
      setLocation(`/agencies/${agency.id}/hybrid-preview?${query.toString()}`);
    } catch {
      toast.error("Failed to open hybrid orchestration flow");
    } finally {
      setIsLoading(false);
    }
  };

  const stageSummary = plan.stages
    .map((stage) => `${stage.owner === "workflow" ? "Workflow" : stage.owner === "swarm" ? "Swarm" : "Human"}: ${stage.title}`)
    .join(" • ");

  return (
    <div className="max-w-xl space-y-3 rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900 dark:bg-violet-950/25">
      <div className="flex items-center gap-2 text-sm font-medium text-violet-800 dark:text-violet-200">
        <Workflow className="h-4 w-4" />
        <span>Hybrid Orchestration Ready</span>
      </div>

      <p className="text-sm text-muted-foreground">
        This request will work best as a cooperative flow: workflow for the deterministic spine, swarm for exploration and critique, then workflow for validation and commit.
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="gap-1 bg-white/80 text-violet-800">
          <Bot className="h-3 w-3" />
          {plan.workflowAnchor}
        </Badge>
        <Badge variant="secondary" className="gap-1 bg-white/80 text-violet-800">
          <Sparkles className="h-3 w-3" />
          {plan.requiresApproval ? "Approval required" : "Approval optional"}
        </Badge>
      </div>

      <div className="rounded-lg border border-violet-200 bg-white/80 p-3 text-xs text-slate-600">
        <p className="font-medium text-slate-800">{buildHybridPlanSummary(plan)}</p>
        <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">Stages</p>
        <p className="mt-1 leading-5">{stageSummary}</p>
      </div>

      {reason && (
        <p className="text-xs italic text-muted-foreground/70">
          Routing: {reason}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handlePreviewHybridFlow}
          disabled={isLoading || !agencyList?.length}
          className="gap-1.5"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Opening preview...
            </>
          ) : (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              Preview Hybrid Flow
            </>
          )}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onKeepInChat}
          className="gap-1.5"
        >
          Keep in Chat
        </Button>
      </div>

      <div className="rounded-md border border-violet-100 bg-violet-100/40 px-3 py-2 text-[11px] text-violet-900">
        <p className="font-medium">Hybrid instructions preview</p>
        <p className="mt-1 whitespace-pre-wrap leading-5">
          {formatHybridPlanInstructions(plan)}
        </p>
      </div>
    </div>
  );
}
