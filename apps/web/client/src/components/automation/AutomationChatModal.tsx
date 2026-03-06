/**
 * AutomationChatModal — Chat-style modal for building and monitoring automations.
 *
 * State machine: idle → analyzing → needs_clarification/preview_ready → executing → success/failed
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { AutomationPreviewPanel, type AutomationPlanSummary } from "./AutomationPreviewPanel";
import { AutomationStepTracker, type AutomationExecutionStatus } from "./AutomationStepTracker";

type AutomationModalState =
  | "idle"
  | "analyzing"
  | "needs_clarification"
  | "preview_ready"
  | "executing"
  | "success"
  | "failed";

interface ClarificationQuestion {
  id: string;
  question: string;
  type: "text" | "choice";
  options?: string[];
}

interface AutomationChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_WAIT_MS = 300_000; // 5 minutes

export function AutomationChatModal({ open, onOpenChange }: AutomationChatModalProps) {
  const [state, setState] = useState<AutomationModalState>("idle");
  const [prompt, setPrompt] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [planSummary, setPlanSummary] = useState<AutomationPlanSummary | null>(null);
  const [executionStatus, setExecutionStatus] = useState<AutomationExecutionStatus | null>(null);
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  const trpcUtils = trpc.useUtils();
  const analyzeMutation = trpc.automationCopilot.analyze.useMutation();
  const executeMutation = trpc.automationCopilot.execute.useMutation();
  const cancelMutation = trpc.automationCopilot.cancel.useMutation();

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    clearPolling();
    setState("idle");
    setPrompt("");
    setTaskId(null);
    setExecutionId(null);
    setPlanSummary(null);
    setExecutionStatus(null);
    setQuestions([]);
    setAnswers({});
    setErrorMessage(null);
  }, [clearPolling]);

  // Cleanup on unmount or close
  useEffect(() => {
    if (!open) {
      clearPolling();
    }
    return clearPolling;
  }, [open, clearPolling]);

  const startPolling = useCallback(
    (tid: string) => {
      clearPolling();
      pollStartRef.current = Date.now();

      pollRef.current = setInterval(async () => {
        // Timeout guard
        if (Date.now() - pollStartRef.current > MAX_POLL_WAIT_MS) {
          clearPolling();
          setErrorMessage("Timed out waiting for response");
          setState("failed");
          return;
        }

        try {
          const tenantId = ""; // extracted from auth context server-side
          const result = await trpcUtils.automationCopilot.getStatus.fetch({ taskId: tid });
          const status = result as Record<string, unknown>;

          if (status.status === "needs_clarification") {
            clearPolling();
            setQuestions((status.questions as ClarificationQuestion[]) ?? []);
            setState("needs_clarification");
          } else if (status.status === "ready" || status.status === "preview_ready") {
            clearPolling();
            if (status.intent) {
              setPlanSummary({
                steps: ((status.intent as Record<string, unknown>).steps as AutomationPlanSummary["steps"]) ?? [],
                estimatedCredits: (status.actual_credits_used as number) ?? 25,
                estimatedDurationSeconds: 30,
              });
            }
            setState("preview_ready");
          } else if (status.status === "success") {
            clearPolling();
            setExecutionStatus({
              status: "success",
              extractedData: status.extracted_data as Record<string, unknown> | undefined,
              actualCreditsUsed: status.actual_credits_used as number | undefined,
            });
            setState("success");
          } else if (status.status === "failed") {
            clearPolling();
            setErrorMessage((status.error_message as string) ?? "Automation failed");
            setExecutionStatus({
              status: "failed",
              error: (status.error_message as string) ?? "Automation failed",
            });
            setState("failed");
          }
          // For "queued", "analyzing", "executing" - keep polling
        } catch {
          // Transient polling errors - ignore and retry
        }
      }, POLL_INTERVAL_MS);
    },
    [clearPolling, trpcUtils],
  );

  const handleSubmitPrompt = useCallback(async () => {
    if (!prompt.trim()) return;

    setState("analyzing");
    try {
      const result = await analyzeMutation.mutateAsync({ prompt: prompt.trim() });
      setTaskId(result.taskId);
      startPolling(result.taskId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to analyze prompt";
      toast.error(message);
      setState("idle");
    }
  }, [prompt, analyzeMutation, startPolling]);

  const handleSubmitClarification = useCallback(async () => {
    const answersText = questions
      .map((q) => `${q.question}: ${answers[q.id] ?? ""}`)
      .join("\n");
    const fullPrompt = `${prompt}\n\nClarifications:\n${answersText}`;

    setState("analyzing");
    try {
      const result = await analyzeMutation.mutateAsync({ prompt: fullPrompt });
      setTaskId(result.taskId);
      startPolling(result.taskId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to analyze prompt";
      toast.error(message);
      setState("needs_clarification");
    }
  }, [prompt, questions, answers, analyzeMutation, startPolling]);

  const handleConfirmExecution = useCallback(async () => {
    if (!taskId) return;

    const execId = `exec-${crypto.randomUUID().slice(0, 12)}`;
    setExecutionId(execId);
    setState("executing");

    try {
      await executeMutation.mutateAsync({
        taskId,
        executionId: execId,
        intentJson: JSON.stringify(planSummary ?? {}),
      });
      startPolling(taskId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start execution";
      toast.error(message);
      setState("preview_ready");
    }
  }, [taskId, planSummary, executeMutation, startPolling]);

  const handleCancel = useCallback(async () => {
    clearPolling();
    if (taskId) {
      try {
        await cancelMutation.mutateAsync({ taskId });
      } catch {
        // Best-effort cancel
      }
    }
    resetState();
  }, [taskId, cancelMutation, clearPolling, resetState]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold">Automation Copilot</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              clearPolling();
              onOpenChange(false);
            }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {/* Idle state */}
          {state === "idle" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Describe what you want to automate in plain language.
              </p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., Go to example.com, click the login button, fill in my email..."
                className="w-full rounded-md border p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={3}
              />
              <button
                type="button"
                onClick={handleSubmitPrompt}
                disabled={!prompt.trim()}
                className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Analyze
              </button>
            </div>
          )}

          {/* Analyzing state */}
          {state === "analyzing" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm text-gray-600">Understanding your request...</p>
              <button
                type="button"
                onClick={handleCancel}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Needs clarification */}
          {state === "needs_clarification" && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Please clarify:</p>
              {questions.map((q) => (
                <div key={q.id} className="space-y-1">
                  <label className="text-sm text-gray-700">{q.question}</label>
                  {q.type === "choice" && q.options ? (
                    <select
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      className="w-full rounded-md border p-2 text-sm"
                    >
                      <option value="">Select...</option>
                      {q.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      className="w-full rounded-md border p-2 text-sm"
                    />
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={handleSubmitClarification}
                className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Submit Answers
              </button>
            </div>
          )}

          {/* Preview ready */}
          {state === "preview_ready" && planSummary && (
            <AutomationPreviewPanel
              planSummary={planSummary}
              onConfirm={handleConfirmExecution}
              onCancel={handleCancel}
            />
          )}

          {/* Executing */}
          {state === "executing" && (
            <div className="space-y-4">
              <AutomationStepTracker
                status={executionStatus ?? { status: "generating" }}
              />
              <button
                type="button"
                onClick={handleCancel}
                className="w-full rounded-md border border-red-300 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Cancel Execution
              </button>
            </div>
          )}

          {/* Success */}
          {state === "success" && executionStatus && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Automation complete!</span>
              </div>
              <AutomationStepTracker status={executionStatus} />
              <button
                type="button"
                onClick={() => toast.info("Template saving coming soon")}
                className="w-full rounded-md border py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Save as Template
              </button>
              <button
                type="button"
                onClick={resetState}
                className="w-full rounded-md bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                New Automation
              </button>
            </div>
          )}

          {/* Failed */}
          {state === "failed" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">Automation failed</span>
              </div>
              {errorMessage && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  {errorMessage}
                </div>
              )}
              <button
                type="button"
                onClick={resetState}
                className="w-full rounded-md bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
