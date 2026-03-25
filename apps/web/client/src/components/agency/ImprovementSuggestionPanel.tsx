import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Lightbulb,
  Check,
  X,
  Loader2,
  Sparkles,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ImprovementSuggestionPanelProps {
  agencyId: string;
}

const PRIORITY_COLORS = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

const CATEGORY_LABELS: Record<string, string> = {
  node_instructions: "Instructions",
  model_selection: "Model",
  add_node: "Add Node",
  remove_node: "Remove Node",
  reorder_nodes: "Reorder",
  shared_instructions: "Shared Instructions",
  objective_refinement: "Objective",
  output_quality: "Quality",
};

export function ImprovementSuggestionPanel({ agencyId }: ImprovementSuggestionPanelProps) {
  const suggestionsQuery = trpc.agency.getImprovementSuggestions.useQuery(
    { agencyId },
    { refetchInterval: 30000 },
  );

  const historyQuery = trpc.agency.getImprovementHistory.useQuery(
    { agencyId, limit: 10 },
  );

  const reviewMutation = trpc.agency.reviewAgency.useMutation({
    onSuccess: () => {
      toast.success("Agency review completed");
      suggestionsQuery.refetch();
      historyQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to evaluate agency");
    },
  });

  const applyMutation = trpc.agency.applyImprovement.useMutation({
    onSuccess: (data) => {
      toast.success(data.applied ? "Improvement applied" : "Suggestion dismissed");
      suggestionsQuery.refetch();
      historyQuery.refetch();
    },
  });

  const suggestions = suggestionsQuery.data ?? [];
  const history = historyQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-slate-50/70 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-slate-700">Agency Review Center</p>
            <p className="text-[11px] text-slate-500">
              Run an LLM review to generate improvement suggestions, then approve or dismiss them.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ agencyId })}
          >
            {reviewMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Evaluate Agency
          </Button>
        </div>
      </div>

      {/* Active Suggestions */}
      {suggestions.length > 0 && (
        <div>
          <h4 className="text-xs font-medium flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            AI Suggestions ({suggestions.length})
          </h4>
          <div className="space-y-2">
            {suggestions.map((s: any, i: number) => (
              <div
                key={`${s.feedbackId}-${i}`}
                className="border rounded-md p-2.5 text-xs space-y-2 bg-gradient-to-r from-amber-50/50 to-transparent"
              >
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1.5 py-0",
                      PRIORITY_COLORS[s.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.medium,
                    )}
                  >
                    {s.priority}
                  </Badge>
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                    {CATEGORY_LABELS[s.category] || s.category}
                  </Badge>
                  {s.autoApplyable && (
                    <Badge className="text-[9px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200">
                      Auto-applied
                    </Badge>
                  )}
                </div>
                <p className="text-slate-700">{s.suggestion}</p>
                {!s.autoApplyable && (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="h-6 text-[10px] gap-1"
                      disabled={applyMutation.isPending}
                      onClick={() => applyMutation.mutate({
                        agencyId,
                        feedbackId: s.feedbackId,
                        suggestionIndex: s.suggestionIndex ?? i,
                        approved: true,
                      })}
                    >
                      {applyMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Apply
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] gap-1"
                      onClick={() => applyMutation.mutate({
                        agencyId,
                        feedbackId: s.feedbackId,
                        suggestionIndex: s.suggestionIndex ?? i,
                        approved: false,
                      })}
                    >
                      <X className="h-3 w-3" /> Dismiss
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {suggestions.length === 0 && (
        <div className="text-center py-4">
          <Lightbulb className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            No pending suggestions. Rate your runs to get AI improvement advice.
          </p>
        </div>
      )}

      {/* Improvement History */}
      {history.length > 0 && (
        <div>
          <h4 className="text-xs font-medium flex items-center gap-1.5 mb-2">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            Recent Improvements
          </h4>
          <div className="space-y-1">
            {history.map((h: any) => (
              <div key={h.id} className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">
                  {h.changeType}
                </Badge>
                <span className="truncate">{h.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
