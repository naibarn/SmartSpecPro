/**
 * AutoCreateAgencyModal — AI-powered agency generation from a text requirement.
 *
 * 7-phase pipeline: DISCOVER → INTERVIEW → DESIGN → VALIDATE → IMPLEMENT → VERIFY → DOCUMENT
 *
 * Phase flow:
 * 1. User types requirement + optional file → submit → Celery discover task
 * 2. If agency needs interview → show questions form
 * 3. User submits answers → Celery design task dispatched
 * 4. Progress bar through all phases
 * 5. On completion → navigate to agency editor
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Sparkles,
  Network,
  CheckCircle2,
  AlertCircle,
  Clock,
  Paperclip,
  X,
  ArrowRight,
  Bot,
  Lightbulb,
  Archive,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_WAIT_MS = 5 * 60 * 1000; // 5 minutes

const PHASES = [
  { id: "discover", label: "Discover" },
  { id: "plan", label: "Plan" },
  { id: "review_plan", label: "Review Plan" },
  { id: "design", label: "Design" },
  { id: "review_design", label: "Review Design" },
  { id: "validate", label: "Validate" },
  { id: "implement", label: "Implement" },
  { id: "suggest", label: "Suggest" },
  { id: "document", label: "Document" },
  { id: "done", label: "Done" },
];

type TaskStatus = "idle" | "queued" | "processing" | "awaiting_answers" | "completed" | "failed";

interface Question {
  id: string;
  question: string;
  type: string;
}

interface AutoCreateAgencyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (agencyId: string) => void;
  /** Default model from the agency toolbar (e.g. "gpt-4o", "openai/gpt-5.2") */
  defaultModel?: string;
}

export function AutoCreateAgencyModal({ open, onOpenChange, onCreated, defaultModel }: AutoCreateAgencyModalProps) {
  const [requirement, setRequirement] = useState("");
  const [attachedFile, setAttachedFile] = useState<{ name: string; base64: string } | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle");
  const [currentPhase, setCurrentPhase] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [guide, setGuide] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{
    category: string;
    title: string;
    description: string;
    impact: string;
    targetNodeId?: string;
  }>>([]);
  const [dismissedSuggestions, setAppliedSuggestions] = useState<Set<number>>(new Set());
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [createdAgencyId, setCreatedAgencyId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  const trpcUtils = (trpc as any).useUtils();
  const autoCreateMutation = (trpc as any).agency?.autoCreate?.useMutation?.() ?? { mutateAsync: null };
  const autoCreateAnswerMutation = (trpc as any).agency?.autoCreateAnswer?.useMutation?.() ?? { mutateAsync: null };
  const saveAsTemplateMutation = (trpc as any).agency?.saveAsTemplate?.useMutation?.() ?? { mutateAsync: null };

  const isProcessing =
    taskStatus === "queued" || taskStatus === "processing";

  // Elapsed timer
  useEffect(() => {
    if (isProcessing || taskStatus === "awaiting_answers") {
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isProcessing, taskStatus]);

  // Poll for status
  useEffect(() => {
    if (!taskId || (!isProcessing && taskStatus !== "awaiting_answers")) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const poll = async () => {
      // Timeout guard: fail gracefully if the task takes too long
      if (Date.now() - pollStartRef.current > MAX_POLL_WAIT_MS) {
        setTaskStatus("failed");
        setErrorMsg("Agency creation timed out after 5 minutes. Please try again.");
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }

      try {
        const status = await trpcUtils.agency?.autoCreateStatus?.fetch?.({ taskId });
        if (!status) return;

        setCurrentPhase(status.phase ?? "");
        setStatusMessage(status.message ?? "");

        if (status.status === "awaiting_answers" && status.questions) {
          setQuestions(status.questions);
          setTaskStatus("awaiting_answers");
          setAnswers({});
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (status.status === "completed") {
          setTaskStatus("completed");
          setGuide(status.guide ?? "");
          if (pollRef.current) clearInterval(pollRef.current);
          if (status.suggestions && Array.isArray(status.suggestions)) {
            setSuggestions(status.suggestions);
          }
          if (status.agencyId) {
            setCreatedAgencyId(status.agencyId);
            toast.success("Agency created successfully!");
            // Don't auto-close — show suggestions first, let user navigate manually
          }
        } else if (status.status === "failed") {
          setTaskStatus("failed");
          setErrorMsg(status.error ?? "Agency creation failed");
          if (pollRef.current) clearInterval(pollRef.current);
        } else {
          setTaskStatus("processing");
        }
      } catch {
        // Continue polling on transient errors
      }
    };

    const start = setTimeout(poll, 1000);
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(start);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [taskId, isProcessing, taskStatus, trpcUtils]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 7_500_000) {
      toast.error("File too large. Maximum 7.5 MB.");
      return;
    }
    const validTypes = ["application/pdf", "text/plain", "text/markdown",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(txt|md|pdf|docx)$/i)) {
      toast.error("Unsupported file type. Use PDF, DOCX, TXT, or MD.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setAttachedFile({ name: file.name, base64 });
      toast.success(`Attached: ${file.name}`);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  const handleSubmit = async () => {
    if (!requirement.trim()) {
      toast.error("Please describe what you want the agency to do.");
      return;
    }
    if (!autoCreateMutation.mutateAsync) {
      toast.error("Agency creator not available.");
      return;
    }

    setTaskStatus("queued");
    setErrorMsg("");
    setElapsedSeconds(0);
    setCurrentPhase("discover");
    setStatusMessage("Submitting to queue...");
    pollStartRef.current = Date.now();

    try {
      const data = await autoCreateMutation.mutateAsync({
        requirement: requirement.trim(),
        specFileBase64: attachedFile?.base64,
        ...(defaultModel ? { model: defaultModel } : {}),
        skipInterview: false,
      });
      setTaskId(data.taskId);
      setTaskStatus("processing");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to start agency creation");
      setTaskStatus("failed");
      toast.error(err.message || "Failed to start agency creation");
    }
  };

  const handleSubmitAnswers = async () => {
    if (!taskId || !autoCreateAnswerMutation.mutateAsync) return;
    try {
      await autoCreateAnswerMutation.mutateAsync({ taskId, answers });
      setTaskStatus("processing");
      setCurrentPhase("design");
      setStatusMessage("Designing agency architecture...");
      // Reset the timeout clock for the design phase (which can also take time)
      pollStartRef.current = Date.now();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit answers");
    }
  };

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    onOpenChange(false);
    setRequirement("");
    setAttachedFile(null);
    setTaskId(null);
    setTaskStatus("idle");
    setCurrentPhase("");
    setStatusMessage("");
    setQuestions([]);
    setAnswers({});
    setErrorMsg("");
    setElapsedSeconds(0);
    setGuide("");
    setSuggestions([]);
    setAppliedSuggestions(new Set());
    setShowTemplateDialog(false);
    setTemplateName("");
    setTemplateDesc("");
    setCreatedAgencyId(null);
  };

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const currentPhaseIndex = PHASES.findIndex((p) => p.id === currentPhase);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Agency Creator
          </DialogTitle>
          <DialogDescription>
            Describe your agency and AI will design and build it for you automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Input */}
          {taskStatus === "idle" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="requirement">What should the agency do?</Label>
                <Textarea
                  id="requirement"
                  value={requirement}
                  onChange={(e) => {
                    if (e.target.value.length <= 10000) setRequirement(e.target.value);
                  }}
                  placeholder={`e.g. "Create a research team with 3 agents: a researcher who gathers information, an analyst who processes it, and a writer who produces the final report."`}
                  rows={5}
                  className="resize-y min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground text-right tabular-nums">
                  {requirement.length.toLocaleString()} / 10,000
                </p>
              </div>

              {/* File attachment */}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.pdf,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-7 text-xs gap-1.5"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Attach spec file
                </Button>
                {attachedFile && (
                  <div className="flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 rounded px-2 py-1">
                    <span className="truncate max-w-[160px]">{attachedFile.name}</span>
                    <button onClick={() => setAttachedFile(null)}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <span className="text-xs text-muted-foreground ml-auto">PDF, DOCX, TXT, MD</span>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!requirement.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Create Agency
              </Button>
            </>
          )}

          {/* Step 2: Processing / phase progress */}
          {(isProcessing) && (
            <div className="space-y-4">
              <div className="border border-purple-200 rounded-lg bg-purple-50 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="h-5 w-5 animate-spin text-purple-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-purple-800">
                      {statusMessage || "Processing..."}
                    </p>
                    <p className="text-xs text-purple-500 flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      {formatElapsed(elapsedSeconds)}
                    </p>
                  </div>
                </div>

                {/* Phase stepper */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PHASES.filter((p) => p.id !== "done").map((phase, idx) => {
                    const phaseIdx = PHASES.findIndex((p) => p.id === phase.id);
                    const isDone = currentPhaseIndex > phaseIdx;
                    const isCurrent = phase.id === currentPhase;
                    return (
                      <div key={phase.id} className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded",
                            isDone && "text-green-600 bg-green-50",
                            isCurrent && "text-purple-700 bg-purple-100 font-semibold",
                            !isDone && !isCurrent && "text-gray-400",
                          )}
                        >
                          {isDone ? <CheckCircle2 className="h-3 w-3 inline mr-0.5" /> : null}
                          {phase.label}
                        </span>
                        {idx < PHASES.length - 2 && (
                          <span className="text-gray-300 text-xs">→</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Interview */}
          {taskStatus === "awaiting_answers" && questions.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-purple-800">
                <Bot className="h-4 w-4" />
                A few questions to design the best agency for you:
              </div>
              {questions.map((q) => (
                <div key={q.id} className="space-y-1.5">
                  <Label htmlFor={`q-${q.id}`} className="text-sm">
                    {q.question}
                  </Label>
                  <Input
                    id={`q-${q.id}`}
                    value={answers[q.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                    placeholder="Your answer..."
                  />
                </div>
              ))}
              <Button
                onClick={handleSubmitAnswers}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Continue
              </Button>
            </div>
          )}

          {/* Error */}
          {taskStatus === "failed" && (
            <div className="border border-red-200 rounded-lg bg-red-50 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Creation failed</p>
                <p className="text-xs text-red-600 mt-1">{errorMsg}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTaskStatus("idle")}
                  className="mt-2 h-7 text-xs border-red-300 text-red-700"
                >
                  Try again
                </Button>
              </div>
            </div>
          )}

          {/* Done */}
          {taskStatus === "completed" && (
            <div className="space-y-4">
              <div className="border border-green-200 rounded-lg bg-green-50 p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800">Agency created!</p>
                  {guide && <p className="text-xs text-green-700 mt-1">{guide.slice(0, 200)}...</p>}
                </div>
              </div>

              {/* Suggestion cards */}
              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-1.5">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Recommended Improvements
                  </h4>
                  {suggestions.map((s, i) => (
                    <div key={i} className="border rounded-md p-2.5 text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={s.impact === "high" ? "destructive" : "secondary"}>
                          {s.impact}
                        </Badge>
                        <Badge variant="outline">{s.category}</Badge>
                        <span className="font-medium">{s.title}</span>
                      </div>
                      <p className="text-muted-foreground">{s.description}</p>
                      <div className="flex gap-1.5">
                        {!dismissedSuggestions.has(i) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px]"
                            onClick={() => setAppliedSuggestions(prev => new Set(prev).add(i))}
                          >
                            Skip
                          </Button>
                        ) : (
                          <span className="text-[10px] text-green-600">Noted</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Save as Template */}
              {!showTemplateDialog ? (
                <div className="border-t pt-3 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Save this agency design as a reusable template
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => setShowTemplateDialog(true)}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Save as Template
                  </Button>
                </div>
              ) : (
                <div className="border rounded-lg p-3 space-y-2">
                  <h4 className="text-sm font-medium">Save as Template</h4>
                  <div className="space-y-1.5">
                    <Label htmlFor="tpl-name" className="text-xs">Template Name</Label>
                    <Input
                      id="tpl-name"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="e.g. Research Team"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tpl-desc" className="text-xs">Description (optional)</Label>
                    <Input
                      id="tpl-desc"
                      value={templateDesc}
                      onChange={(e) => setTemplateDesc(e.target.value)}
                      placeholder="Brief description..."
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!templateName.trim() || !createdAgencyId || !saveAsTemplateMutation.mutateAsync}
                      onClick={async () => {
                        if (!createdAgencyId || !saveAsTemplateMutation.mutateAsync) return;
                        try {
                          await saveAsTemplateMutation.mutateAsync({
                            agencyId: createdAgencyId,
                            name: templateName.trim(),
                            description: templateDesc.trim() || undefined,
                          });
                          toast.success("Template saved!");
                          setShowTemplateDialog(false);
                        } catch (e) {
                          console.warn("saveAsTemplate failed", e);
                          toast.error("Failed to save template");
                        }
                      }}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setShowTemplateDialog(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Navigate to editor */}
              {createdAgencyId && (
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => {
                    onCreated(createdAgencyId);
                    handleClose();
                  }}
                >
                  Open in Agency Editor
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
