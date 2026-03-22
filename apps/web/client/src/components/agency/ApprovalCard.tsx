import { useState } from "react";
import { ShieldCheck, ShieldX, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ApprovalCardProps {
  approvalKey: string;
  step: string;
  summary: string;
  agentName: string;
  runId: string;
}

export function ApprovalCard({
  approvalKey,
  step,
  summary,
  agentName,
  runId,
}: ApprovalCardProps) {
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  const submitMutation = trpc.agency.submitApproval.useMutation({
    onSuccess: (_, variables) => {
      setDecision(variables.decision);
    },
  });

  const isSubmitting = submitMutation.isPending;
  const isResolved = decision !== null;

  const handleApprove = () => {
    submitMutation.mutate({
      runId,
      approvalKey,
      decision: "approved",
    });
  };

  const handleReject = () => {
    if (!showFeedback) {
      setShowFeedback(true);
      return;
    }
    submitMutation.mutate({
      runId,
      approvalKey,
      decision: "rejected",
      feedback: feedback || undefined,
    });
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 my-2">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-amber-500" />
        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
          Approval Required
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          from {agentName}
        </span>
      </div>

      <div className="text-sm font-medium mb-1">{step}</div>
      {summary && (
        <div className="text-xs text-muted-foreground mb-3">{summary}</div>
      )}

      {isResolved ? (
        <div
          className={`text-xs font-medium flex items-center gap-1.5 ${
            decision === "approved" ? "text-green-600" : "text-red-600"
          }`}
        >
          {decision === "approved" ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : (
            <ShieldX className="h-3.5 w-3.5" />
          )}
          {decision === "approved" ? "Approved" : "Rejected"}
          {feedback && (
            <span className="text-muted-foreground font-normal ml-1">
              — {feedback}
            </span>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {showFeedback && (
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Rejection feedback (optional)"
              className="w-full text-xs rounded-md border border-input bg-background px-2 py-1.5 resize-none h-16"
              maxLength={2000}
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={isSubmitting}
              className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting && decision === null ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ShieldCheck className="h-3 w-3" />
              )}
              Approve
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={isSubmitting}
              className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <ShieldX className="h-3 w-3" />
              {showFeedback ? "Confirm Reject" : "Reject"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
