import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, Clock, AlertCircle, Loader2 } from "lucide-react";

interface JobCardProps {
  executionId: string;
  workflowName?: string;
  initialStatus?: "pending" | "running" | "completed" | "failed" | "cancelled";
  onApprove?: (requestId: string, comment?: string) => void;
  onReject?: (requestId: string, comment?: string) => void;
}

/**
 * JobCard - Displays workflow execution progress in chat
 * Shows step results, approval gates, and allows user interaction
 */
export function JobCard({
  executionId,
  workflowName,
  initialStatus = "pending",
  onApprove,
  onReject,
}: JobCardProps) {
  const [comment, setComment] = useState("");
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);

  // Fetch execution status (polls every 2s if running)
  const { data: execution, refetch } = trpc.workflow.getStatus.useQuery(
    { executionId },
    {
      refetchInterval: initialStatus === "running" ? 2000 : false,
      enabled: !!executionId,
    }
  );

  // Submit approval decision mutation
  const submitDecision = trpc.approvals.submitDecision.useMutation({
    onSuccess: () => {
      setComment("");
      setShowCommentBox(false);
      setActionType(null);
      refetch();
    },
  });

  const handleApprovalAction = (action: "approve" | "reject", requestId: string) => {
    if (action === "approve" && !showCommentBox) {
      // Approve immediately without comment
      if (onApprove) {
        onApprove(requestId);
      } else {
        submitDecision.mutate({
          requestId,
          decision: "approved",
        });
      }
    } else {
      // Show comment box for reject or optional approve comment
      setActionType(action);
      setShowCommentBox(true);
    }
  };

  const handleSubmitWithComment = (requestId: string) => {
    if (!actionType) return;

    if (actionType === "approve" && onApprove) {
      onApprove(requestId, comment);
    } else if (actionType === "reject" && onReject) {
      onReject(requestId, comment);
    } else {
      submitDecision.mutate({
        requestId,
        decision: actionType === "approve" ? "approved" : "rejected",
        comment: comment || undefined,
      });
    }
  };

  const status = execution?.status || initialStatus;
  const steps = execution?.steps || [];
  const approvalRequest = execution?.approval_request;

  // Status badge configuration
  const statusConfig = {
    pending: { color: "secondary" as const, icon: Clock, label: "Pending" },
    running: { color: "default" as const, icon: Loader2, label: "Running" },
    completed: { color: "outline" as const, icon: CheckCircle, label: "Completed" },
    failed: { color: "destructive" as const, icon: XCircle, label: "Failed" },
    cancelled: { color: "secondary" as const, icon: AlertCircle, label: "Cancelled" },
  };

  const statusKey =
    typeof status === "string" && status in statusConfig
      ? (status as keyof typeof statusConfig)
      : "pending";
  const { color, icon: StatusIcon, label } = statusConfig[statusKey];

  return (
    <div className="border border-input rounded-lg p-4 bg-card shadow-sm my-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <StatusIcon
            className={`size-5 ${
              status === "running" ? "animate-spin text-primary" :
              status === "completed" ? "text-green-600 dark:text-green-400" :
              status === "failed" ? "text-destructive" :
              "text-muted-foreground"
            }`}
          />
          <h3 className="font-semibold text-foreground">
            {workflowName || execution?.workflow_name || "Workflow Execution"}
          </h3>
        </div>
        <Badge variant={color}>{label}</Badge>
      </div>

      {/* Step Progress */}
      {steps.length > 0 && (
        <div className="space-y-2 mb-3">
          {steps.map((step: any, index: number) => (
            <div
              key={step.id || index}
              className="flex items-start gap-2 text-sm"
            >
              {step.status === "completed" ? (
                <CheckCircle className="size-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              ) : step.status === "failed" ? (
                <XCircle className="size-4 text-destructive mt-0.5 shrink-0" />
              ) : step.status === "running" ? (
                <Loader2 className="size-4 text-primary mt-0.5 shrink-0 animate-spin" />
              ) : (
                <Clock className="size-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="flex-1">
                <p className="text-foreground">{step.name || step.id}</p>
                {step.output && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {typeof step.output === "string"
                      ? step.output.slice(0, 100)
                      : JSON.stringify(step.output).slice(0, 100)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approval Gate */}
      {approvalRequest && approvalRequest.status === "pending" && (
        <div className="border-t border-border pt-3 mt-3">
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="size-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">
                {approvalRequest.title || "Approval Required"}
              </p>
              {approvalRequest.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {approvalRequest.description}
                </p>
              )}
              {approvalRequest.risk_level && (
                <Badge
                  variant={approvalRequest.risk_level === "high" ? "destructive" : "secondary"}
                  className="mt-2"
                >
                  Risk: {approvalRequest.risk_level}
                </Badge>
              )}
            </div>
          </div>

          {!showCommentBox ? (
            <div className="flex gap-2">
              <Button
                onClick={() => handleApprovalAction("approve", approvalRequest.id)}
                variant="default"
                size="sm"
                disabled={submitDecision.isPending}
              >
                <CheckCircle className="size-4" />
                Approve
              </Button>
              <Button
                onClick={() => handleApprovalAction("reject", approvalRequest.id)}
                variant="destructive"
                size="sm"
                disabled={submitDecision.isPending}
              >
                <XCircle className="size-4" />
                Reject
              </Button>
              <Button
                onClick={() => {
                  setActionType("approve");
                  setShowCommentBox(true);
                }}
                variant="outline"
                size="sm"
              >
                Add Comment
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  actionType === "approve"
                    ? "Optional approval comment..."
                    : "Reason for rejection (required)"
                }
                className="w-full"
                rows={3}
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleSubmitWithComment(approvalRequest.id)}
                  variant={actionType === "approve" ? "default" : "destructive"}
                  size="sm"
                  disabled={
                    submitDecision.isPending ||
                    (actionType === "reject" && !comment.trim())
                  }
                >
                  {submitDecision.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : actionType === "approve" ? (
                    <>
                      <CheckCircle className="size-4" />
                      Approve
                    </>
                  ) : (
                    <>
                      <XCircle className="size-4" />
                      Reject
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => {
                    setShowCommentBox(false);
                    setComment("");
                    setActionType(null);
                  }}
                  variant="outline"
                  size="sm"
                  disabled={submitDecision.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {execution?.error && (
        <div className="border-t border-border pt-3 mt-3">
          <div className="flex items-start gap-2 text-destructive">
            <XCircle className="size-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Execution Failed</p>
              <p className="text-sm mt-1">{execution.error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Execution ID */}
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Execution ID: {executionId.slice(0, 8)}...
        </p>
      </div>
    </div>
  );
}
