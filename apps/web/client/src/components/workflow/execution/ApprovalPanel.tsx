/**
 * ApprovalPanel - Interactive approval gate UI for workflow HITL (Human-In-The-Loop).
 *
 * Renders different UIs based on approval_type:
 * - approve_reject: Approve/Reject buttons
 * - decision: Multiple option buttons
 * - input: Free-text input with submit
 *
 * All types include an optional comment textarea.
 * Calls tRPC `approvals.submitDecision` on action.
 */

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Loader2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

export interface ApprovalPanelProps {
  executionId: string;
  nodeId: string;
  approvalData: {
    approval_id: string;
    message: string;
    approval_type: "approve_reject" | "decision" | "input";
    options?: string[];
    timeout_minutes?: number;
    data?: unknown;
  };
}

type SubmissionState =
  | { kind: "idle" }
  | { kind: "submitting"; decision: string }
  | { kind: "success"; decision: string }
  | { kind: "error"; message: string };

export function ApprovalPanel({
  executionId,
  nodeId,
  approvalData,
}: ApprovalPanelProps) {
  const [comment, setComment] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [submissionState, setSubmissionState] = useState<SubmissionState>({
    kind: "idle",
  });
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const submitDecisionMutation = trpc.approvals.submitDecision.useMutation({
    onSuccess: (_data, variables) => {
      setSubmissionState({
        kind: "success",
        decision: variables.decision,
      });
    },
    onError: (error) => {
      setSubmissionState({
        kind: "error",
        message: error.message || "Failed to submit decision",
      });
    },
  });

  // Countdown timer for timeout
  useEffect(() => {
    if (
      approvalData.timeout_minutes &&
      approvalData.timeout_minutes > 0 &&
      submissionState.kind === "idle"
    ) {
      const totalSeconds = approvalData.timeout_minutes * 60;
      setRemainingSeconds(totalSeconds);

      timerRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev === null || prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [approvalData.timeout_minutes, submissionState.kind]);

  const handleSubmit = (decision: "approved" | "rejected") => {
    setSubmissionState({ kind: "submitting", decision });
    submitDecisionMutation.mutate({
      requestId: approvalData.approval_id,
      decision,
      comment: comment.trim() || undefined,
    });
  };

  const handleInputSubmit = () => {
    if (!inputValue.trim()) return;
    setSubmissionState({ kind: "submitting", decision: "approved" });
    submitDecisionMutation.mutate({
      requestId: approvalData.approval_id,
      decision: "approved",
      comment: inputValue.trim(),
    });
  };

  const handleDecisionOption = (option: string) => {
    setSubmissionState({ kind: "submitting", decision: option });
    submitDecisionMutation.mutate({
      requestId: approvalData.approval_id,
      decision: "approved",
      comment: option + (comment.trim() ? `\n\n${comment.trim()}` : ""),
    });
  };

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return "Expired";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs.toString().padStart(2, "0")}s`;
    }
    return `${secs}s`;
  };

  const isExpired = remainingSeconds !== null && remainingSeconds <= 0;
  const isDisabled =
    submissionState.kind === "submitting" ||
    submissionState.kind === "success" ||
    isExpired;

  // Success state
  if (submissionState.kind === "success") {
    return (
      <div className="border border-green-200 bg-green-50 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium text-green-800">
            Decision submitted:{" "}
            <span className="capitalize">{submissionState.decision}</span>
          </span>
        </div>
      </div>
    );
  }

  // Error state (allows retry)
  if (submissionState.kind === "error") {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <span className="text-sm font-medium text-red-800">
            Failed to submit decision
          </span>
        </div>
        <p className="text-xs text-red-700">{submissionState.message}</p>
        <button
          onClick={() => setSubmissionState({ kind: "idle" })}
          className="text-xs text-red-700 underline hover:text-red-900"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
      {/* Header with icon and timeout */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-medium text-amber-900">
              Approval Required
            </div>
            <p className="text-sm text-amber-800 mt-1">
              {approvalData.message}
            </p>
          </div>
        </div>

        {/* Timeout countdown */}
        {remainingSeconds !== null && (
          <div
            className={`text-xs font-mono px-2 py-1 rounded flex-shrink-0 ${
              isExpired
                ? "bg-red-100 text-red-700"
                : remainingSeconds < 60
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
            }`}
          >
            {isExpired ? "Expired" : formatTimeRemaining(remainingSeconds)}
          </div>
        )}
      </div>

      {/* Expired message */}
      {isExpired && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-100 rounded p-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          This approval request has expired.
        </div>
      )}

      {/* Type badge */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded">
          {approvalData.approval_type.replace("_", " ")}
        </span>
      </div>

      {/* Action area based on approval type */}
      {!isExpired && (
        <>
          {approvalData.approval_type === "approve_reject" && (
            <ApproveRejectActions
              isDisabled={isDisabled}
              submissionState={submissionState}
              onApprove={() => handleSubmit("approved")}
              onReject={() => handleSubmit("rejected")}
            />
          )}

          {approvalData.approval_type === "decision" && (
            <DecisionActions
              options={approvalData.options || []}
              isDisabled={isDisabled}
              submissionState={submissionState}
              onSelect={handleDecisionOption}
            />
          )}

          {approvalData.approval_type === "input" && (
            <InputAction
              isDisabled={isDisabled}
              submissionState={submissionState}
              inputValue={inputValue}
              onInputChange={setInputValue}
              onSubmit={handleInputSubmit}
            />
          )}

          {/* Optional comment toggle */}
          {approvalData.approval_type !== "input" && (
            <div>
              <button
                onClick={() => setShowComment(!showComment)}
                className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900"
              >
                <MessageSquare className="w-3 h-3" />
                {showComment ? "Hide comment" : "Add comment"}
                <ChevronRight
                  className={`w-3 h-3 transition-transform ${showComment ? "rotate-90" : ""}`}
                />
              </button>
              {showComment && (
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional comment..."
                  disabled={isDisabled}
                  maxLength={1000}
                  rows={2}
                  className="mt-2 w-full text-sm border border-amber-300 rounded-md px-3 py-2 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Approve/Reject action buttons
// -----------------------------------------------------------------------

function ApproveRejectActions({
  isDisabled,
  submissionState,
  onApprove,
  onReject,
}: {
  isDisabled: boolean;
  submissionState: SubmissionState;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isSubmitting = submissionState.kind === "submitting";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onApprove}
        disabled={isDisabled}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
      >
        {isSubmitting && submissionState.decision === "approved" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle className="w-4 h-4" />
        )}
        Approve
      </button>
      <button
        onClick={onReject}
        disabled={isDisabled}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
      >
        {isSubmitting && submissionState.decision === "rejected" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <XCircle className="w-4 h-4" />
        )}
        Reject
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------
// Decision (multiple options) action buttons
// -----------------------------------------------------------------------

function DecisionActions({
  options,
  isDisabled,
  submissionState,
  onSelect,
}: {
  options: string[];
  isDisabled: boolean;
  submissionState: SubmissionState;
  onSelect: (option: string) => void;
}) {
  const isSubmitting = submissionState.kind === "submitting";

  if (options.length === 0) {
    return (
      <p className="text-xs text-amber-700 italic">
        No options available for this decision.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onSelect(option)}
          disabled={isDisabled}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
        >
          {isSubmitting && submissionState.decision === option ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          {option}
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------
// Input (free-text) action
// -----------------------------------------------------------------------

function InputAction({
  isDisabled,
  submissionState,
  inputValue,
  onInputChange,
  onSubmit,
}: {
  isDisabled: boolean;
  submissionState: SubmissionState;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const isSubmitting = submissionState.kind === "submitting";

  return (
    <div className="space-y-2">
      <textarea
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="Enter your response..."
        disabled={isDisabled}
        rows={3}
        className="w-full text-sm border border-amber-300 rounded-md px-3 py-2 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500">
          Press Ctrl+Enter to submit
        </span>
        <button
          onClick={onSubmit}
          disabled={isDisabled || !inputValue.trim()}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          Submit
        </button>
      </div>
    </div>
  );
}
