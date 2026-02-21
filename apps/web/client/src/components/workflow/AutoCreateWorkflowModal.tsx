/**
 * AutoCreateWorkflowModal - AI-powered workflow generation from a text prompt.
 *
 * User types a description (and/or attaches a .txt/.md file) → submits to queue →
 * polls for status → preview shown → user chooses to replace or append to canvas.
 *
 * Uses async task queue (Celery) to handle concurrent users safely.
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
  Sparkles,
  GitBranch,
  RefreshCw,
  Plus,
  Paperclip,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { Node, Edge } from "reactflow";

const MAX_PROMPT_LENGTH = 50000;
const ACCEPTED_FILE_TYPES = ".txt,.md,.markdown";
const POLL_INTERVAL_MS = 3000;

interface AutoCreateWorkflowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Available node types with full port specs to send to the LLM as context */
  nodeTypes?: Array<{
    type: string;
    display_name: string;
    description: string;
    inputs: Array<Record<string, unknown>>;
    outputs: Array<Record<string, unknown>>;
  }>;
  /** Workflow-level default LLM model ID to use for generation */
  modelId?: string;
  onGenerated: (
    nodes: Node[],
    edges: Edge[],
    mode: "replace" | "append"
  ) => void;
}

type GenerationPhase =
  | "idle"
  | "sending"
  | "queued"
  | "processing"
  | "done"
  | "error";

const PHASE_LABELS: Record<GenerationPhase, string> = {
  idle: "",
  sending: "Submitting to generation queue...",
  queued: "Queued — waiting for available worker...",
  processing: "LLM is generating your workflow... This may take 1-3 minutes.",
  done: "Generation complete!",
  error: "Generation failed",
};

export function AutoCreateWorkflowModal({
  open,
  onOpenChange,
  nodeTypes,
  modelId,
  onGenerated,
}: AutoCreateWorkflowModalProps) {
  const [prompt, setPrompt] = useState("");
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const [result, setResult] = useState<{
    nodes: Node[];
    edges: Edge[];
    description: string;
  } | null>(null);
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateMutation = (trpc as any).workflow.autoGenerate.useMutation();
  const trpcUtils = (trpc as any).useUtils();

  // Elapsed timer during generation
  useEffect(() => {
    if (
      phase === "sending" ||
      phase === "queued" ||
      phase === "processing"
    ) {
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
  }, [phase]);

  // Poll for task status when we have a taskId and are in a polling phase
  useEffect(() => {
    if (!taskId || (phase !== "queued" && phase !== "processing" && phase !== "sending")) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const status = await trpcUtils.workflow.autoGenerateStatus.fetch({
          taskId,
        });

        if (!status) return;

        if (status.status === "queued") {
          setPhase("queued");
        } else if (status.status === "processing") {
          setPhase("processing");
        } else if (status.status === "completed" && status.nodes) {
          setResult({
            nodes: status.nodes as Node[],
            edges: (status.edges ?? []) as Edge[],
            description: status.description ?? "",
          });
          setPhase("done");
          setTaskId(null);
        } else if (status.status === "failed") {
          setErrorMessage(status.error || "Unknown error occurred");
          setValidationError(status.validationError ?? null);
          setHint(status.hint ?? null);
          setPhase("error");
          setTaskId(null);
        }
      } catch (err) {
        // Silently continue polling on network errors
        console.warn("[AutoCreate] Poll error:", err);
      }
    };

    // Start polling immediately then every POLL_INTERVAL_MS
    const startPoll = setTimeout(poll, 1000); // first poll after 1s
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(startPoll);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [taskId, phase, trpcUtils]);

  const totalPromptLength =
    prompt.length + (attachedFile ? attachedFile.content.length : 0);

  // --- File attachment ---
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 100_000) {
        toast.error("File too large. Maximum 100 KB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        setAttachedFile({ name: file.name, content: text });
        toast.success(`Attached: ${file.name} (${text.length} chars)`);
      };
      reader.onerror = () => toast.error("Failed to read file.");
      reader.readAsText(file);

      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    []
  );

  const removeFile = useCallback(() => setAttachedFile(null), []);

  // --- Generate (submit to queue) ---
  const handleGenerate = async () => {
    if (!prompt.trim() && !attachedFile) {
      toast.error("Please describe the workflow or attach a prompt file.");
      return;
    }

    // Combine typed prompt + file content
    let fullPrompt = prompt.trim();
    if (attachedFile) {
      fullPrompt = fullPrompt
        ? `${fullPrompt}\n\n--- Attached file: ${attachedFile.name} ---\n${attachedFile.content}`
        : attachedFile.content;
    }

    setPhase("sending");
    setResult(null);
    setErrorMessage("");
    setValidationError(null);
    setHint(null);

    try {
      const data = await generateMutation.mutateAsync({
        prompt: fullPrompt,
        nodeTypes: nodeTypes ?? [],
        modelId: modelId || undefined,
        defaultModel: modelId || undefined,
      });
      // Backend returns {taskId} — start polling
      setTaskId(data.taskId);
      setPhase("queued");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to submit workflow generation");
      setPhase("error");
      toast.error(err.message || "Failed to submit workflow generation");
    }
  };

  const handleApply = (mode: "replace" | "append") => {
    if (!result) return;
    onGenerated(result.nodes, result.edges, mode);
    onOpenChange(false);
    setPrompt("");
    setAttachedFile(null);
    setResult(null);
    setPhase("idle");
    setTaskId(null);
    toast.success(
      mode === "replace"
        ? "Workflow replaced with AI-generated workflow"
        : "AI-generated nodes added to canvas"
    );
  };

  const handleClose = () => {
    onOpenChange(false);
    setPrompt("");
    setAttachedFile(null);
    setResult(null);
    setPhase("idle");
    setTaskId(null);
    setErrorMessage("");
    setValidationError(null);
    setHint(null);
  };

  const isGenerating =
    phase === "sending" || phase === "queued" || phase === "processing";

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[85vw] max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Auto Create Workflow
          </DialogTitle>
          <DialogDescription>
            Describe what you want your workflow to do, or attach a prompt file.
            The AI will generate nodes and connections for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Prompt input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Workflow description
              </label>
              <span
                className={`text-xs tabular-nums ${
                  prompt.length > 1800
                    ? "text-red-500 font-medium"
                    : prompt.length > 1500
                      ? "text-amber-500"
                      : "text-gray-400"
                }`}
              >
                {prompt.length.toLocaleString()} / {MAX_PROMPT_LENGTH.toLocaleString()}
              </span>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => {
                if (e.target.value.length <= MAX_PROMPT_LENGTH)
                  setPrompt(e.target.value);
              }}
              placeholder={`e.g. "Take a user's question, search the knowledge base for relevant documents, then use an LLM to generate a final answer based on the retrieved context."\n\nYou can describe:\n• Node types to use (LLM call, RAG query, conditional, filter, etc.)\n• How nodes should connect\n• Branching logic and conditions\n• Data transformations`}
              rows={10}
              maxLength={MAX_PROMPT_LENGTH}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y min-h-[200px] max-h-[50vh]"
              disabled={isGenerating}
            />

            {/* File attachment row */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating}
                  className="h-7 text-xs gap-1.5"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Attach prompt file
                </Button>

                {attachedFile && (
                  <div className="flex items-center gap-1.5 text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded px-2 py-1">
                    <Paperclip className="h-3 w-3" />
                    <span className="max-w-[200px] truncate">
                      {attachedFile.name}
                    </span>
                    <span className="text-purple-400">
                      ({attachedFile.content.length.toLocaleString()} chars)
                    </span>
                    <button
                      onClick={removeFile}
                      className="ml-1 text-purple-400 hover:text-red-500"
                      disabled={isGenerating}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-400">
                .txt, .md — max 100 KB
              </p>
            </div>

            {/* Total prompt size indicator when file attached */}
            {attachedFile && (
              <p className="text-xs text-gray-500 mt-1">
                Total prompt: {totalPromptLength.toLocaleString()} chars
                (typed + file)
              </p>
            )}
          </div>

          {/* Generation status */}
          {(isGenerating || phase === "done") && (
            <div className="border border-purple-200 dark:border-purple-700 rounded-lg bg-purple-50 dark:bg-purple-900/20 p-4">
              <div className="flex items-center gap-3">
                {isGenerating ? (
                  <Loader2 className="h-5 w-5 animate-spin text-purple-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-purple-800 dark:text-purple-200">
                    {PHASE_LABELS[phase]}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-3.5 w-3.5 text-purple-400" />
                    <span className="text-xs text-purple-500 tabular-nums">
                      Elapsed: {formatElapsed(elapsedSeconds)}
                    </span>
                  </div>
                </div>
              </div>
              {/* Progress steps */}
              <div className="flex items-center gap-2 mt-3 text-xs">
                <span
                  className={`flex items-center gap-1 ${phase === "sending" ? "text-purple-600 font-medium" : "text-green-600"}`}
                >
                  {phase === "sending" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  Submit
                </span>
                <span className="text-gray-300">→</span>
                <span
                  className={`flex items-center gap-1 ${phase === "queued" ? "text-purple-600 font-medium" : phase === "processing" || phase === "done" ? "text-green-600" : "text-gray-400"}`}
                >
                  {phase === "queued" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : phase === "processing" || phase === "done" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  Queue
                </span>
                <span className="text-gray-300">→</span>
                <span
                  className={`flex items-center gap-1 ${phase === "processing" ? "text-purple-600 font-medium" : phase === "done" ? "text-green-600" : "text-gray-400"}`}
                >
                  {phase === "processing" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : phase === "done" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  Generate
                </span>
                <span className="text-gray-300">→</span>
                <span
                  className={`flex items-center gap-1 ${phase === "done" ? "text-green-600" : "text-gray-400"}`}
                >
                  {phase === "done" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  Done
                </span>
              </div>
            </div>
          )}

          {/* Error state */}
          {phase === "error" && !result && (
            <div className="border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Generation failed
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errorMessage ||
                    "The LLM did not return a valid workflow. Try simplifying your description."}
                </p>
                {validationError && (
                  <details className="mt-2">
                    <summary className="text-xs text-red-500 cursor-pointer">
                      Technical details
                    </summary>
                    <pre className="text-xs text-red-500 mt-1 whitespace-pre-wrap font-mono">
                      {validationError}
                    </pre>
                  </details>
                )}
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
                    setValidationError(null);
                    setHint(null);
                  }}
                  className="mt-2 h-7 text-xs border-red-300 text-red-700"
                >
                  Try again
                </Button>
              </div>
            </div>
          )}

          {/* Generate button */}
          {!result && !isGenerating && phase !== "error" && (
            <Button
              onClick={handleGenerate}
              disabled={!prompt.trim() && !attachedFile}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Workflow
            </Button>
          )}

          {/* Preview */}
          {result && (
            <div className="border border-purple-200 dark:border-purple-700 rounded-lg bg-purple-50 dark:bg-purple-900/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-200 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Generated Workflow Preview
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setResult(null);
                    setPhase("idle");
                  }}
                  className="text-purple-600 hover:text-purple-700 h-7 px-2"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Regenerate
                </Button>
              </div>

              {result.description && (
                <p className="text-sm text-purple-700 dark:text-purple-300 italic">
                  {result.description}
                </p>
              )}

              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300">
                  <GitBranch className="h-4 w-4" />
                  <span className="font-medium">{result.nodes.length}</span>{" "}
                  nodes
                </div>
                <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300">
                  <span className="font-medium">{result.edges.length}</span>{" "}
                  connections
                </div>
                {elapsedSeconds > 0 && (
                  <div className="flex items-center gap-1.5 text-purple-500">
                    <Clock className="h-3.5 w-3.5" />
                    {formatElapsed(elapsedSeconds)}
                  </div>
                )}
              </div>

              {/* Node list */}
              <div className="max-h-40 overflow-y-auto space-y-1">
                {result.nodes.map((node: any) => (
                  <div
                    key={node.id}
                    className="flex items-center gap-2 text-xs text-purple-800 dark:text-purple-200 bg-white dark:bg-purple-900/40 rounded px-2 py-1"
                  >
                    <span className="font-mono text-purple-400">
                      {node.id}
                    </span>
                    <span className="font-medium">
                      {node.data?.label ?? node.data?.nodeType}
                    </span>
                    <span className="text-purple-400 ml-auto">
                      {node.data?.nodeType}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {result && (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleApply("append")}
                className="border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add to Canvas
              </Button>
              <Button
                onClick={() => handleApply("replace")}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                Replace Canvas
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
