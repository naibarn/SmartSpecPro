/**
 * AutomationChatModal — Chat-style modal for building and monitoring automations.
 *
 * State machine: idle → analyzing → needs_clarification/preview_ready → executing → success/failed
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  HelpCircle,
  Lightbulb,
  Loader2,
  MousePointerClick,
  Save,
  Search,
  Shield,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { AutomationPreviewPanel, type AutomationPlanSummary } from "./AutomationPreviewPanel";
import { AutomationStepTracker, type AutomationExecutionStatus } from "./AutomationStepTracker";
import { TemplateListPanel } from "./TemplateListPanel";

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
  const [rawIntent, setRawIntent] = useState<Record<string, unknown> | null>(null);
  const [executionStatus, setExecutionStatus] = useState<AutomationExecutionStatus | null>(null);
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [mode, setMode] = useState<"search" | "browse">("browse");
  const [budgetCredits, setBudgetCredits] = useState<number | null>(null);
  const [costEstimate, setCostEstimate] = useState<{
    estimated_credits: number;
    breakdown: Record<string, number>;
    max_possible_credits: number;
  } | null>(null);
  const [citations, setCitations] = useState<Array<{ url: string; title?: string; retrievedAt?: string }>>([]);
  const [additionalDomains, setAdditionalDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  const trpcUtils = trpc.useUtils();
  const analyzeMutation = trpc.automationCopilot.analyze.useMutation();
  const executeMutation = trpc.automationCopilot.execute.useMutation();
  const cancelMutation = trpc.automationCopilot.cancel.useMutation();
  const saveTemplateMutation = trpc.automationCopilot.saveTemplate.useMutation();

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
    setRawIntent(null);
    setExecutionStatus(null);
    setQuestions([]);
    setAnswers({});
    setErrorMessage(null);
    setShowTemplates(false);
    setShowSaveForm(false);
    setTemplateName("");
    setTemplateDesc("");
    setCostEstimate(null);
    setCitations([]);
    setAdditionalDomains([]);
    setDomainInput("");
    setBudgetCredits(null);
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
              const intent = status.intent as Record<string, unknown>;
              setRawIntent(intent);
              const ce = status.cost_estimate as typeof costEstimate;
              setPlanSummary({
                steps: (intent.browser_tasks as AutomationPlanSummary["steps"]) ?? (intent.steps as AutomationPlanSummary["steps"]) ?? [],
                estimatedCredits: ce?.estimated_credits ?? (status.actual_credits_used as number) ?? 25,
                estimatedDurationSeconds: 30,
              });
              if (ce) setCostEstimate(ce);
            }
            setState("preview_ready");
          } else if (status.status === "executing" || status.status === "generating" || status.status === "running") {
            // Update live progress during execution
            setExecutionStatus({
              status: "generating",
              currentStep: status.current_step as string | undefined,
              accumulatedCost: status.accumulated_cost as number | undefined,
            });
            if (status.citations) {
              setCitations(status.citations as Array<{ url: string; title?: string; retrievedAt?: string }>);
            }
          } else if (status.status === "success") {
            clearPolling();
            setExecutionStatus({
              status: "success",
              extractedData: status.extracted_data as Record<string, unknown> | undefined,
              actualCreditsUsed: status.actual_credits_used as number | undefined,
            });
            if (status.citations) {
              setCitations(status.citations as Array<{ url: string; title?: string; retrievedAt?: string }>);
            }
            setState("success");
          } else if (status.status === "failed") {
            clearPolling();
            const errMsg = (status.error_message as string) ?? (status.error as string) ?? "Automation failed";
            setErrorMessage(errMsg);
            setExecutionStatus({
              status: "failed",
              error: errMsg,
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
        intentJson: JSON.stringify(rawIntent ?? {}),
      });
      startPolling(taskId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start execution";
      toast.error(message);
      setState("preview_ready");
    }
  }, [taskId, rawIntent, executeMutation, startPolling]);

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
      <div className="relative mx-4 w-full max-w-2xl rounded-lg bg-white shadow-xl">
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
          {state === "idle" && !showTemplates && (
            <div className="space-y-4">
              {/* Collapsible Usage Guide */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/50">
                <button
                  type="button"
                  onClick={() => setShowGuide((prev) => !prev)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                >
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-900">
                      How to Use Automation Copilot
                    </span>
                  </div>
                  {showGuide ? (
                    <ChevronUp className="h-4 w-4 text-blue-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-blue-400" />
                  )}
                </button>

                {showGuide && (
                  <div className="space-y-4 border-t border-blue-200 px-3 pb-3 pt-3">
                    {/* What it does */}
                    <div>
                      <p className="text-xs leading-relaxed text-gray-600">
                        Automation Copilot uses AI to understand your instructions and
                        automate browser tasks — such as navigating websites, clicking
                        buttons, filling out forms, and extracting data. Simply describe
                        what you want in plain English.
                      </p>
                    </div>

                    {/* Step-by-step workflow */}
                    <div>
                      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        Step-by-Step Workflow
                      </h4>
                      <ol className="space-y-1.5 pl-1 text-xs text-gray-600">
                        <li className="flex gap-2">
                          <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                            1
                          </span>
                          <span>
                            <strong>Describe your task</strong> — Type what you want to
                            automate in the text box below. Be specific about which
                            website, what actions to perform, and what data to collect.
                          </span>
                        </li>
                        <li className="flex gap-2">
                          <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                            2
                          </span>
                          <span>
                            <strong>Review the plan</strong> — The AI will analyze your
                            request and show a step-by-step execution plan with estimated
                            credit cost. Review each step before confirming.
                          </span>
                        </li>
                        <li className="flex gap-2">
                          <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                            3
                          </span>
                          <span>
                            <strong>Confirm & execute</strong> — Click "Confirm" to run
                            the automation. The system will open a browser, perform each
                            step, and report results back to you in real time.
                          </span>
                        </li>
                        <li className="flex gap-2">
                          <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                            4
                          </span>
                          <span>
                            <strong>Save as template</strong> — After a successful run,
                            you can save the automation as a reusable template to run
                            again later with one click.
                          </span>
                        </li>
                      </ol>
                    </div>

                    {/* Example prompts */}
                    <div>
                      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                        <Lightbulb className="h-3.5 w-3.5 text-yellow-500" />
                        Example Prompts
                      </h4>
                      <div className="space-y-1.5">
                        {[
                          {
                            icon: Globe,
                            text: "Go to example.com, find the pricing page, and extract all plan names and prices into a table.",
                          },
                          {
                            icon: MousePointerClick,
                            text: "Navigate to my-app.com/login, enter username 'demo@test.com' and password 'demo123', then click Sign In.",
                          },
                          {
                            icon: Search,
                            text: "Search for 'AI automation tools' on Google, collect the top 5 result titles and URLs.",
                          },
                        ].map((example, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setPrompt(example.text)}
                            className="flex w-full items-start gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-left text-xs text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50/50"
                          >
                            <example.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                            <span>{example.text}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tips */}
                    <div>
                      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                        <Shield className="h-3.5 w-3.5 text-green-500" />
                        Tips for Best Results
                      </h4>
                      <ul className="space-y-1 pl-1 text-xs text-gray-600">
                        <li className="flex gap-1.5">
                          <span className="text-green-500">&#10003;</span>
                          <span>
                            Include the <strong>full URL</strong> of the target website
                            (e.g., https://example.com/page).
                          </span>
                        </li>
                        <li className="flex gap-1.5">
                          <span className="text-green-500">&#10003;</span>
                          <span>
                            Describe actions in <strong>sequential order</strong> — first
                            do X, then do Y, finally do Z.
                          </span>
                        </li>
                        <li className="flex gap-1.5">
                          <span className="text-green-500">&#10003;</span>
                          <span>
                            Specify <strong>what data to extract</strong> if you need
                            information from the page (e.g., "collect all product names
                            and prices").
                          </span>
                        </li>
                        <li className="flex gap-1.5">
                          <span className="text-green-500">&#10003;</span>
                          <span>
                            Use <strong>Browse Templates</strong> below to start from a
                            pre-built automation instead of writing from scratch.
                          </span>
                        </li>
                        <li className="flex gap-1.5">
                          <span className="text-amber-500">&#9888;</span>
                          <span>
                            Only websites on the <strong>allowed domains list</strong>{" "}
                            (configured by your admin) can be automated. Contact your
                            admin to add new domains.
                          </span>
                        </li>
                        <li className="flex gap-1.5">
                          <span className="text-amber-500">&#9888;</span>
                          <span>
                            Each execution <strong>reserves credits</strong> upfront.
                            Unused credits are refunded if the automation fails to start.
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("search")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border py-2 text-sm font-medium transition-colors ${
                    mode === "search"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Search className="h-4 w-4" />
                  Search Only
                </button>
                <button
                  type="button"
                  onClick={() => setMode("browse")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border py-2 text-sm font-medium transition-colors ${
                    mode === "browse"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Globe className="h-4 w-4" />
                  Search + Browse
                </button>
              </div>

              {/* Prompt input */}
              <div className="space-y-3">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe what you want to automate...&#10;&#10;e.g., Go to example.com, click the login button, fill in my email and password, then take a screenshot of the dashboard."
                  className="w-full rounded-md border p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  rows={4}
                />

                {/* Allowed domains input (browse mode only) */}
                {mode === "browse" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">
                      Additional Allowed Domains
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {additionalDomains.map((d) => (
                        <span
                          key={d}
                          className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs text-blue-700"
                        >
                          {d}
                          <button
                            type="button"
                            onClick={() => setAdditionalDomains((prev) => prev.filter((x) => x !== d))}
                            className="text-blue-400 hover:text-blue-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={domainInput}
                        onChange={(e) => setDomainInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && domainInput.trim()) {
                            e.preventDefault();
                            const domain = domainInput.trim().toLowerCase();
                            if (!additionalDomains.includes(domain)) {
                              setAdditionalDomains((prev) => [...prev, domain]);
                            }
                            setDomainInput("");
                          }
                        }}
                        placeholder="example.com"
                        className="flex-1 rounded-md border px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmitPrompt}
                  disabled={!prompt.trim()}
                  className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Analyze
                </button>
                <button
                  type="button"
                  onClick={() => setShowTemplates(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Browse Templates
                </button>
              </div>
            </div>
          )}

          {/* Templates browser */}
          {state === "idle" && showTemplates && (
            <TemplateListPanel
              onSelectTemplate={(intent, scripts, name) => {
                const intentObj = intent as Record<string, unknown>;
                setRawIntent(intentObj);
                setPlanSummary({
                  steps: (intentObj?.browser_tasks as AutomationPlanSummary["steps"]) ?? (intentObj?.steps as AutomationPlanSummary["steps"]) ?? [],
                  estimatedCredits: 25,
                  estimatedDurationSeconds: 30,
                });
                setPrompt(name);
                setShowTemplates(false);
                setState("preview_ready");
              }}
              onBack={() => setShowTemplates(false)}
            />
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
            <div className="space-y-4">
              <AutomationPreviewPanel
                planSummary={planSummary}
                onConfirm={handleConfirmExecution}
                onCancel={handleCancel}
              />

              {/* Cost estimate card */}
              {costEstimate && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                  <h4 className="mb-2 text-xs font-semibold text-blue-900">
                    Estimated Cost
                  </h4>
                  <div className="space-y-1 text-xs text-gray-700">
                    <div className="flex justify-between">
                      <span>Browser actions</span>
                      <span>{costEstimate.breakdown.browser_actions ?? 0} credits</span>
                    </div>
                    <div className="flex justify-between">
                      <span>LLM calls</span>
                      <span>{costEstimate.breakdown.llm_calls ?? 0} credits</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Web searches</span>
                      <span>{costEstimate.breakdown.web_searches ?? 0} credits</span>
                    </div>
                    <div className="flex justify-between border-t border-blue-200 pt-1 font-semibold">
                      <span>Estimated total</span>
                      <span>{costEstimate.estimated_credits} credits</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Max possible</span>
                      <span>{costEstimate.max_possible_credits} credits</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Budget input */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
                  Max budget (credits)
                </label>
                <input
                  type="number"
                  min={1}
                  value={budgetCredits ?? ""}
                  onChange={(e) => setBudgetCredits(e.target.value ? Number(e.target.value) : null)}
                  placeholder="No limit"
                  className="w-28 rounded-md border px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Executing */}
          {state === "executing" && (
            <div className="space-y-4">
              <AutomationStepTracker
                status={executionStatus ?? { status: "generating" }}
              />
              {executionStatus?.currentStep && (
                <div className="text-xs text-gray-500">
                  Current step: {executionStatus.currentStep}
                </div>
              )}
              {executionStatus?.accumulatedCost != null && (
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Credits used: {executionStatus.accumulatedCost}</span>
                  {budgetCredits != null && (
                    <span>Budget remaining: {budgetCredits - executionStatus.accumulatedCost}</span>
                  )}
                </div>
              )}
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
              {executionStatus.actualCreditsUsed != null && (
                <div className="text-xs text-gray-500">
                  Total credits used: {executionStatus.actualCreditsUsed}
                </div>
              )}
              <AutomationStepTracker status={executionStatus} />

              {/* Citations panel */}
              {citations.length > 0 && (
                <details className="rounded-lg border">
                  <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700">
                    <Globe className="h-3.5 w-3.5" />
                    Sources ({citations.length})
                  </summary>
                  <div className="space-y-1.5 border-t px-3 py-2">
                    {citations.map((c, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        <span className="shrink-0 text-gray-400">{i + 1}.</span>
                        <div>
                          <a
                            href={c.url?.startsWith("http") ? c.url : "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {c.title || c.url}
                          </a>
                          {c.retrievedAt && (
                            <span className="ml-1.5 text-gray-400">{c.retrievedAt}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {!showSaveForm ? (
                <button
                  type="button"
                  onClick={() => setShowSaveForm(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save as Template
                </button>
              ) : (
                <div className="space-y-2 rounded-md border p-3">
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name (required)"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                  <textarea
                    value={templateDesc}
                    onChange={(e) => setTemplateDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                    rows={2}
                  />
                  <button
                    type="button"
                    disabled={!templateName.trim() || saveTemplateMutation.isPending}
                    onClick={async () => {
                      try {
                        await saveTemplateMutation.mutateAsync({
                          name: templateName.trim(),
                          description: templateDesc.trim() || undefined,
                          intentJson: JSON.stringify(planSummary ?? {}),
                          scriptsJson: JSON.stringify(executionStatus.extractedData ?? {}),
                        });
                        toast.success("Template saved");
                        setShowSaveForm(false);
                      } catch {
                        toast.error("Failed to save template");
                      }
                    }}
                    className="w-full rounded-md bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saveTemplateMutation.isPending ? "Saving..." : "Save Template"}
                  </button>
                </div>
              )}
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
