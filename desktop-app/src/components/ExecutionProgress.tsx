import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Types
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface ExecutionStep {
  id: string;
  name: string;
  description?: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  output?: string;
  error?: string;
  llmProvider?: string;
  llmModel?: string;
  tokensUsed?: number;
  cost?: number;
}

export interface Execution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: "pending" | "running" | "completed" | "failed" | "paused" | "cancelled";
  progress: number;
  steps: ExecutionStep[];
  startedAt: string;
  completedAt?: string;
  totalTokens: number;
  totalCost: number;
  error?: string;
}

// Icons
const Icons = {
  Check: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  X: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Play: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Pause: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Stop: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  ),
  Retry: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  ChevronDown: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
};

// Status colors and icons
const statusConfig: Record<StepStatus, { color: string; bgColor: string; icon: React.ReactNode }> = {
  pending: {
    color: "text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-800",
    icon: <Icons.Clock />,
  },
  running: {
    color: "text-blue-500",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    icon: (
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    ),
  },
  completed: {
    color: "text-green-500",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    icon: <Icons.Check />,
  },
  failed: {
    color: "text-red-500",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    icon: <Icons.X />,
  },
  skipped: {
    color: "text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-800",
    icon: <span className="text-xs">—</span>,
  },
};

// Step Component
function StepItem({ step, isLast }: { step: ExecutionStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[step.status];

  return (
    <div className="relative">
      {/* Connector Line */}
      {!isLast && (
        <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
      )}

      <div className="flex gap-4">
        {/* Status Icon */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.bgColor} ${config.color} flex-shrink-0`}>
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 pb-6">
          <div
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">{step.name}</h4>
                  {step.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{step.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {step.duration !== undefined && (
                    <span className="text-xs text-gray-500">
                      {step.duration < 1000 
                        ? `${step.duration}ms` 
                        : `${(step.duration / 1000).toFixed(1)}s`}
                    </span>
                  )}
                  <motion.div
                    animate={{ rotate: expanded ? 180 : 0 }}
                    className="text-gray-400"
                  >
                    <Icons.ChevronDown />
                  </motion.div>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-gray-200 dark:border-gray-700"
                >
                  <div className="p-4 bg-gray-50 dark:bg-gray-900/50 space-y-3">
                    {/* Metadata */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {step.llmProvider && (
                        <div>
                          <span className="text-gray-500">Provider</span>
                          <p className="text-gray-900 dark:text-white font-medium">{step.llmProvider}</p>
                        </div>
                      )}
                      {step.llmModel && (
                        <div>
                          <span className="text-gray-500">Model</span>
                          <p className="text-gray-900 dark:text-white font-medium">{step.llmModel}</p>
                        </div>
                      )}
                      {step.tokensUsed !== undefined && (
                        <div>
                          <span className="text-gray-500">Tokens</span>
                          <p className="text-gray-900 dark:text-white font-medium">{step.tokensUsed.toLocaleString()}</p>
                        </div>
                      )}
                      {step.cost !== undefined && (
                        <div>
                          <span className="text-gray-500">Cost</span>
                          <p className="text-gray-900 dark:text-white font-medium">${step.cost.toFixed(4)}</p>
                        </div>
                      )}
                    </div>

                    {/* Output */}
                    {step.output && (
                      <div>
                        <span className="text-gray-500 text-sm">Output</span>
                        <pre className="mt-1 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-white overflow-x-auto">
                          {step.output}
                        </pre>
                      </div>
                    )}

                    {/* Error */}
                    {step.error && (
                      <div>
                        <span className="text-red-500 text-sm">Error</span>
                        <pre className="mt-1 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-400 overflow-x-auto">
                          {step.error}
                        </pre>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

// Progress Bar Component
function ProgressBar({ progress, status }: { progress: number; status: string }) {
  const getColor = () => {
    switch (status) {
      case "running": return "bg-blue-500";
      case "completed": return "bg-green-500";
      case "failed": return "bg-red-500";
      case "paused": return "bg-yellow-500";
      default: return "bg-gray-400";
    }
  };

  return (
    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <motion.div
        className={`h-full ${getColor()}`}
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
}

// Main Component
interface ExecutionProgressProps {
  execution: Execution;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function ExecutionProgress({
  execution,
  onPause,
  onResume,
  onCancel,
  onRetry,
}: ExecutionProgressProps) {
  const completedSteps = execution.steps.filter(s => s.status === "completed").length;
  const failedSteps = execution.steps.filter(s => s.status === "failed").length;

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = endTime - startTime;
    
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
    return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {execution.workflowName}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Execution ID: {execution.id}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {execution.status === "running" && onPause && (
              <button
                onClick={onPause}
                className="p-2 text-gray-500 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg transition-colors"
                title="Pause"
              >
                <Icons.Pause />
              </button>
            )}
            {execution.status === "paused" && onResume && (
              <button
                onClick={onResume}
                className="p-2 text-gray-500 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                title="Resume"
              >
                <Icons.Play />
              </button>
            )}
            {(execution.status === "running" || execution.status === "paused") && onCancel && (
              <button
                onClick={onCancel}
                className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="Cancel"
              >
                <Icons.Stop />
              </button>
            )}
            {execution.status === "failed" && onRetry && (
              <button
                onClick={onRetry}
                className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title="Retry"
              >
                <Icons.Retry />
              </button>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {completedSteps} of {execution.steps.length} steps completed
            </span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {Math.round(execution.progress)}%
            </span>
          </div>
          <ProgressBar progress={execution.progress} status={execution.status} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <span className="text-xs text-gray-500">Duration</span>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {formatDuration(execution.startedAt, execution.completedAt)}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <span className="text-xs text-gray-500">Total Tokens</span>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {execution.totalTokens.toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <span className="text-xs text-gray-500">Total Cost</span>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              ${execution.totalCost.toFixed(4)}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <span className="text-xs text-gray-500">Status</span>
            <p className={`text-sm font-semibold capitalize ${
              execution.status === "completed" ? "text-green-500" :
              execution.status === "failed" ? "text-red-500" :
              execution.status === "running" ? "text-blue-500" :
              "text-gray-500"
            }`}>
              {execution.status}
            </p>
          </div>
        </div>

        {/* Error */}
        {execution.error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">{execution.error}</p>
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="p-6">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          Execution Steps
        </h4>
        <div>
          {execution.steps.map((step, index) => (
            <StepItem
              key={step.id}
              step={step}
              isLast={index === execution.steps.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Demo/Example usage
export function ExecutionProgressDemo() {
  const [execution] = useState<Execution>({
    id: "exec_abc123",
    workflowId: "wf_001",
    workflowName: "Generate API Documentation",
    status: "running",
    progress: 60,
    startedAt: new Date(Date.now() - 120000).toISOString(),
    totalTokens: 4520,
    totalCost: 0.0452,
    steps: [
      {
        id: "step_1",
        name: "Analyze Codebase",
        description: "Scan and analyze the project structure",
        status: "completed",
        duration: 2340,
        llmProvider: "OpenAI",
        llmModel: "gpt-4o",
        tokensUsed: 1200,
        cost: 0.012,
        output: "Found 15 API endpoints across 5 controllers",
      },
      {
        id: "step_2",
        name: "Extract Endpoints",
        description: "Extract API endpoint definitions",
        status: "completed",
        duration: 3120,
        llmProvider: "OpenAI",
        llmModel: "gpt-4o",
        tokensUsed: 1800,
        cost: 0.018,
      },
      {
        id: "step_3",
        name: "Generate Documentation",
        description: "Create OpenAPI specification",
        status: "running",
        llmProvider: "OpenAI",
        llmModel: "gpt-4o",
        tokensUsed: 1520,
        cost: 0.0152,
      },
      {
        id: "step_4",
        name: "Write Examples",
        description: "Generate usage examples",
        status: "pending",
      },
      {
        id: "step_5",
        name: "Export Files",
        description: "Save documentation files",
        status: "pending",
      },
    ],
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <ExecutionProgress
        execution={execution}
        onPause={() => console.log("Pause")}
        onCancel={() => console.log("Cancel")}
      />
    </div>
  );
}
