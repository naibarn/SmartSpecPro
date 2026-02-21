/**
 * AutoEditWorkflowModal - AI-powered workflow fixing AND improvement.
 *
 * Modes:
 *  - FIX: auto-resolve compilation errors/warnings
 *  - IMPROVE: add features from natural language (Thai or English)
 *  - BOTH: fix errors then apply improvements
 *
 * Same async queue pattern as AutoCreateWorkflowModal:
 * submit → poll status → preview changes → apply to canvas
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Wrench,
  GitBranch,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ListChecks,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { Node, Edge } from "reactflow";

const MAX_INSTRUCTIONS = 5000;
const POLL_INTERVAL_MS = 3000;

// ── Example instruction chips ──────────────────────────────────────────
const EXAMPLE_CHIPS: { label: string; text: string; category: string }[] = [
  // ─── Human Review ───
  {
    category: "Human Review",
    label: "Add Approval Step",
    text: "Add a human approval step before proceeding. If approved, continue the workflow. If rejected, send an email notification to the submitter.",
  },
  // ─── Notifications ───
  {
    category: "Notifications",
    label: "Email on Completion",
    text: "Add an email notification to the user when the workflow completes, including a summary of the results.",
  },
  {
    category: "Notifications",
    label: "Slack Notification",
    text: "Add a Slack channel notification when the workflow produces results.",
  },
  {
    category: "Notifications",
    label: "Discord Notification",
    text: "Add a Discord webhook notification when the workflow completes successfully.",
  },
  // ─── Output Format ───
  {
    category: "Output Format",
    label: "Let User Choose Format",
    text: "Add a step letting the user choose the output format: Article / JSON / CSV — then generate output according to the selection.",
  },
  {
    category: "Output Format",
    label: "Export CSV / Excel",
    text: "Add a step to convert results into a CSV file (openable in Excel) and provide a download link.",
  },
  {
    category: "Output Format",
    label: "Export Markdown Report",
    text: "Add a step to generate a Markdown report from the results and save it as a .md file for download.",
  },
  {
    category: "Output Format",
    label: "Generate HTML Template",
    text: "Add a template engine node to generate HTML from the results, suitable for email delivery or browser rendering.",
  },
  // ─── User Input ───
  {
    category: "User Input",
    label: "Add Input Form",
    text: "Add a form input for the user to fill in required fields before the workflow begins — e.g. name, email, topic, preferred language.",
  },
  {
    category: "User Input",
    label: "Confirm Before Action",
    text: "Add a confirmation step asking the user whether to proceed before a critical action (such as sending email or deleting data).",
  },
  // ─── Error Handling ───
  {
    category: "Error Handling",
    label: "Add Try-Catch",
    text: "Add error handling: if any step fails, send an email notification to admin with full error details and return an error response.",
  },
  {
    category: "Error Handling",
    label: "Auto Retry on Failure",
    text: "Add a retry node around any potentially failing nodes to automatically retry up to 3 times with exponential backoff delay.",
  },
  {
    category: "Error Handling",
    label: "Set Execution Timeout",
    text: "Add timeout protection for LLM calls or API calls. If execution exceeds 30 seconds, return an error response.",
  },
  // ─── Scheduling ───
  {
    category: "Scheduling",
    label: "Run Daily (Scheduled)",
    text: "Replace the current trigger with a schedule_trigger to run the workflow automatically every day at 09:00 Asia/Bangkok timezone.",
  },
  {
    category: "Scheduling",
    label: "Receive Webhook Trigger",
    text: "Add a webhook_trigger as the entry point so external systems can call this workflow via HTTP POST request.",
  },
  {
    category: "Scheduling",
    label: "Run Every 2 Hours",
    text: "Add a schedule_trigger to run the workflow automatically every 2 hours around the clock.",
  },
  // ─── AI & Knowledge ───
  {
    category: "AI & Knowledge",
    label: "Search Knowledge Base (RAG)",
    text: "Add a RAG node to search the knowledge base for relevant information before sending to the AI, for more accurate answers.",
  },
  {
    category: "AI & Knowledge",
    label: "Compare Multiple AI Models",
    text: "Add a multi-model router to select the best AI model for this task, or compare results across multiple models.",
  },
  {
    category: "AI & Knowledge",
    label: "Generate AI Image",
    text: "Add an image generation node after the LLM creates a detailed prompt, to generate an AI image from the workflow output.",
  },
  {
    category: "AI & Knowledge",
    label: "Translate Output",
    text: "Add a translation step to translate the output to English (or Thai) before returning, using an LLM translation node.",
  },
  // ─── External API ───
  {
    category: "External API",
    label: "Call External REST API",
    text: "Add an HTTP request node to fetch data from an external REST API and process it further in the workflow.",
  },
  {
    category: "External API",
    label: "Fetch API Key from Vault",
    text: "Add a secrets_vault node to securely retrieve an API key, then pass it to the http_request headers for authentication.",
  },
  {
    category: "External API",
    label: "Extract JSON Fields",
    text: "Add a json_path_extractor after the API call to extract specific fields from a complex response JSON object.",
  },
  // ─── Data Processing ───
  {
    category: "Data Processing",
    label: "Process in Parallel",
    text: "Split the workflow into 2 parallel branches running simultaneously, then merge the results when both complete to reduce total time.",
  },
  {
    category: "Data Processing",
    label: "Loop / Batch Processing",
    text: "Add a map_array or batch node to process each item in an array individually with configurable concurrency.",
  },
  {
    category: "Data Processing",
    label: "Validate Input Data",
    text: "Add a validator node before the main processing step to check format and required fields. Return an error response immediately if validation fails.",
  },
  // ─── Improve ───
  {
    category: "Improve",
    label: "Improve AI Prompts",
    text: "Improve the prompt and systemPrompt of all llm_call nodes to be clearer, with full context appropriate for each node's specific task.",
  },
  {
    category: "Improve",
    label: "Add Structured Output",
    text: "Add an output_parser node after the LLM to convert the response into structured JSON, making downstream processing easier.",
  },
  {
    category: "Improve",
    label: "Add Metrics Tracking",
    text: "Add metrics_collector nodes at key checkpoints in the workflow to track performance and monitor execution.",
  },
];

const CATEGORIES = [...new Set(EXAMPLE_CHIPS.map((c) => c.category))];

interface AutoEditWorkflowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentNodes: Node[];
  currentEdges: Edge[];
  errors: string[];
  warnings: string[];
  nodeTypes?: Array<{
    type: string;
    display_name: string;
    description: string;
    inputs: Array<Record<string, unknown>>;
    outputs: Array<Record<string, unknown>>;
  }>;
  modelId?: string;
  onEdited: (
    nodes: Node[],
    edges: Edge[],
    description: string,
    changes: string[]
  ) => void;
}

type EditPhase =
  | "idle"
  | "sending"
  | "queued"
  | "processing"
  | "done"
  | "error";

const PHASE_LABELS: Record<EditPhase, string> = {
  idle: "",
  sending: "Submitting to AI editor queue...",
  queued: "Queued — waiting for available worker...",
  processing: "AI is analyzing and editing your workflow...",
  done: "Done!",
  error: "Editing failed",
};

export function AutoEditWorkflowModal({
  open,
  onOpenChange,
  currentNodes,
  currentEdges,
  errors,
  warnings,
  nodeTypes,
  modelId,
  onEdited,
}: AutoEditWorkflowModalProps) {
  const [instructions, setInstructions] = useState("");
  const [showExamples, setShowExamples] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [result, setResult] = useState<{
    nodes: Node[];
    edges: Edge[];
    description: string;
    changes: string[];
  } | null>(null);
  const [phase, setPhase] = useState<EditPhase>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const editMutation = (trpc as any).workflow.autoEdit.useMutation();
  const trpcUtils = (trpc as any).useUtils();

  const hasIssues = errors.length > 0 || warnings.length > 0;
  const isProcessing =
    phase === "sending" || phase === "queued" || phase === "processing";

  // Determine mode label for the button
  const modeLabel = (() => {
    if (hasIssues && instructions.trim())
      return `Fix ${errors.length + warnings.length} Issue${errors.length + warnings.length !== 1 ? "s" : ""} + Apply Instructions`;
    if (hasIssues)
      return `Fix ${errors.length + warnings.length} Issue${errors.length + warnings.length !== 1 ? "s" : ""} with AI`;
    if (instructions.trim()) return "Apply Instructions with AI";
    return "Improve Workflow with AI";
  })();

  // Elapsed timer
  useEffect(() => {
    if (isProcessing) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s: number) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isProcessing]);

  // Poll for task status
  useEffect(() => {
    if (!taskId || !isProcessing) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const status = await trpcUtils.workflow.autoEditStatus.fetch({ taskId });
        if (!status) return;

        if (status.status === "queued") setPhase("queued");
        else if (status.status === "processing") setPhase("processing");
        else if (status.status === "completed" && status.nodes) {
          setResult({
            nodes: status.nodes as Node[],
            edges: (status.edges ?? []) as Edge[],
            description: status.description ?? "",
            changes: status.changes ?? [],
          });
          setPhase("done");
          setTaskId(null);
        } else if (status.status === "failed") {
          setErrorMessage(status.error || "Unknown error occurred");
          setHint(status.hint ?? null);
          setPhase("error");
          setTaskId(null);
        }
      } catch (err) {
        console.warn("[AutoEdit] Poll error:", err);
      }
    };

    const startPoll = setTimeout(poll, 1000);
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(startPoll);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [taskId, phase, isProcessing, trpcUtils]);

  const appendChip = useCallback((text: string) => {
    setInstructions((prev) => {
      const sep = prev.trim() ? "\n" : "";
      const next = prev + sep + text;
      return next.length <= MAX_INSTRUCTIONS ? next : prev;
    });
    setShowExamples(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleEdit = async () => {
    setPhase("sending");
    setResult(null);
    setErrorMessage("");
    setHint(null);

    try {
      const data = await editMutation.mutateAsync({
        currentWorkflow: { nodes: currentNodes, edges: currentEdges },
        errors,
        warnings,
        instructions: instructions.trim(),
        nodeTypes: nodeTypes ?? [],
        modelId: modelId || undefined,
        defaultModel: modelId || undefined,
      });
      setTaskId(data.taskId);
      setPhase("queued");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to submit workflow editing");
      setPhase("error");
      toast.error(err.message || "Failed to submit workflow editing");
    }
  };

  const handleApply = useCallback(() => {
    if (!result) return;
    onEdited(result.nodes, result.edges, result.description, result.changes);
    onOpenChange(false);
    setInstructions("");
    setResult(null);
    setPhase("idle");
    setTaskId(null);
    toast.success("AI-edited workflow applied to canvas");
  }, [result, onEdited, onOpenChange]);

  const handleClose = () => {
    onOpenChange(false);
    setInstructions("");
    setResult(null);
    setPhase("idle");
    setTaskId(null);
    setErrorMessage("");
    setHint(null);
    setShowExamples(false);
  };

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[90vw] max-w-3xl min-w-[320px] min-h-[400px] max-h-[90vh] overflow-auto resize" style={{ resize: 'both' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-blue-500" />
            {hasIssues ? "Fix & Improve Workflow with AI" : "Improve Workflow with AI"}
          </DialogTitle>
          <DialogDescription>
            Type instructions in English or Thai — AI will fix errors, add new nodes, and
            rewire connections automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Issues summary */}
          {hasIssues && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              {errors.length > 0 && (
                <div className="px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                    <span className="font-medium text-red-700 dark:text-red-300">
                      {errors.length} Compilation Error{errors.length !== 1 ? "s" : ""} (AI will fix automatically)
                    </span>
                  </div>
                  <ul className="space-y-0.5 pl-5">
                    {errors.slice(0, 4).map((e, i) => (
                      <li key={i} className="text-xs text-red-600 dark:text-red-400 font-mono truncate">
                        {e}
                      </li>
                    ))}
                    {errors.length > 4 && (
                      <li className="text-xs text-red-400">+{errors.length - 4} more…</li>
                    )}
                  </ul>
                </div>
              )}
              {warnings.length > 0 && (
                <div className="px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                    <span className="font-medium text-amber-700 dark:text-amber-300">
                      {warnings.length} Warning{warnings.length !== 1 ? "s" : ""} (AI will address)
                    </span>
                  </div>
                  <ul className="space-y-0.5 pl-5">
                    {warnings.slice(0, 3).map((w, i) => (
                      <li key={i} className="text-xs text-amber-600 dark:text-amber-400 font-mono truncate">
                        {w}
                      </li>
                    ))}
                    {warnings.length > 3 && (
                      <li className="text-xs text-amber-400">+{warnings.length - 3} more…</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!hasIssues && (
            <div className="border border-green-200 dark:border-green-800 rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2 flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              <span className="text-green-700 dark:text-green-300">
                No issues detected — describe what you'd like to improve, or click "Improve Workflow with AI" to let the AI suggest optimizations.
              </span>
            </div>
          )}

          {/* Instructions area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {hasIssues
                  ? "Additional instructions (optional)"
                  : "Tell AI what you'd like to improve"}
              </label>
              <button
                type="button"
                onClick={() => setShowExamples(!showExamples)}
                disabled={isProcessing}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                <Sparkles className="h-3 w-3" />
                Examples
                {showExamples ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            </div>

            {/* Example chips panel */}
            {showExamples && (
              <div className="mb-2 border border-blue-200 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3">
                {/* Category tabs */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                        selectedCategory === cat
                          ? "bg-blue-600 text-white"
                          : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-blue-50"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {/* Chips for selected category */}
                <div className="flex flex-col gap-1.5">
                  {EXAMPLE_CHIPS.filter(
                    (c) => c.category === selectedCategory
                  ).map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => appendChip(chip.text)}
                      disabled={isProcessing}
                      className="text-left text-xs px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors group"
                    >
                      <span className="font-medium text-blue-700 dark:text-blue-300 group-hover:text-blue-800">
                        + {chip.label}
                      </span>
                      <p className="text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                        {chip.text}
                      </p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-blue-500 mt-2">
                  Click an example to append it to your instructions • Multiple examples can be combined
                </p>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={instructions}
              onChange={(e) => {
                if (e.target.value.length <= MAX_INSTRUCTIONS)
                  setInstructions(e.target.value);
              }}
              placeholder={
                hasIssues
                  ? "Leave blank to let AI fix errors automatically, or add extra instructions:\n• Add a human approval step before proceeding\n• Send email notification when the workflow completes\n• Let the user choose output format: Article / JSON / CSV"
                  : "Describe what you'd like to add or change, e.g.:\n• Add a human approval step — notify submitter on rejection\n• Send an email notification when the workflow completes\n• Export results as a CSV file for download\n• Ask user to choose output format: Article / JSON / CSV\n• Add retry logic if the LLM response is invalid"
              }
              rows={hasIssues ? 4 : 6}
              disabled={isProcessing}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y leading-relaxed"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-gray-400">
                Supports English and Thai • Up to {MAX_INSTRUCTIONS.toLocaleString()} characters
              </p>
              <p
                className={`text-xs tabular-nums ${
                  instructions.length > MAX_INSTRUCTIONS * 0.9
                    ? "text-red-500 font-medium"
                    : "text-gray-400"
                }`}
              >
                {instructions.length.toLocaleString()}/{MAX_INSTRUCTIONS.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Workflow stats */}
          <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              <span>{currentNodes.length} nodes on canvas</span>
            </div>
            <span>•</span>
            <span>{currentEdges.length} connections</span>
          </div>

          {/* Processing status */}
          {(isProcessing || phase === "done") && (
            <div className="border border-blue-200 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4">
              <div className="flex items-center gap-3">
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    {PHASE_LABELS[phase]}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Clock className="h-3 w-3 text-blue-400" />
                    <span className="text-xs text-blue-500 tabular-nums">
                      {formatElapsed(elapsedSeconds)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs">
                {(["sending", "queued", "processing", "done"] as const).map(
                  (step, idx, arr) => (
                    <div key={step} className="flex items-center gap-2">
                      <span
                        className={`flex items-center gap-1 ${
                          phase === step
                            ? "text-blue-600 font-medium"
                            : idx < arr.indexOf(phase) || phase === "done"
                              ? "text-green-600"
                              : "text-gray-400"
                        }`}
                      >
                        {phase === step ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : idx < arr.indexOf(phase) || phase === "done" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {step.charAt(0).toUpperCase() + step.slice(1)}
                      </span>
                      {idx < arr.length - 1 && (
                        <span className="text-gray-300">→</span>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Error state */}
          {phase === "error" && !result && (
            <div className="border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Editing failed
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errorMessage ||
                    "AI could not edit the workflow. Try providing more specific instructions or simplifying the workflow."}
                </p>
                {hint && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                    Suggestion: {hint}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPhase("idle");
                    setErrorMessage("");
                    setHint(null);
                  }}
                  className="mt-2 h-7 text-xs border-red-300 text-red-700"
                >
                  Try again
                </Button>
              </div>
            </div>
          )}

          {/* Action button */}
          {!result && !isProcessing && phase !== "error" && (
            <Button
              onClick={handleEdit}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Wrench className="h-4 w-4 mr-2" />
              {modeLabel}
            </Button>
          )}

          {/* Result preview */}
          {result && (
            <div className="border border-blue-200 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Workflow Updated — Preview
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setResult(null);
                    setPhase("idle");
                  }}
                  className="text-blue-600 hover:text-blue-700 h-7 px-2"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Re-run
                </Button>
              </div>

              {result.description && (
                <p className="text-sm text-blue-700 dark:text-blue-300 italic">
                  {result.description}
                </p>
              )}

              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                  <GitBranch className="h-4 w-4" />
                  <span className="font-medium">{result.nodes.length}</span> nodes
                </div>
                <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                  <span className="font-medium">{result.edges.length}</span> connections
                </div>
                {elapsedSeconds > 0 && (
                  <div className="flex items-center gap-1.5 text-blue-500">
                    <Clock className="h-3.5 w-3.5" />
                    {formatElapsed(elapsedSeconds)}
                  </div>
                )}
              </div>

              {/* Changes list */}
              {result.changes.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <ListChecks className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                      Changes ({result.changes.length})
                    </span>
                  </div>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {result.changes.map((change, i) => (
                      <li
                        key={i}
                        className="text-xs text-blue-800 dark:text-blue-200 flex items-start gap-1.5"
                      >
                        <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {result && (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Wrench className="h-4 w-4 mr-1.5" />
              Apply to Canvas
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
