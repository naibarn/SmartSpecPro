import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

export interface WorkflowExecution {
  id: string;
  workflowName: string;
  command: string;
  status: "running" | "completed" | "failed";
  startTime: number;
  endTime?: number;
  output?: string;
  error?: string;
}

interface ExecutionItemProps {
  execution: WorkflowExecution;
}

export function ExecutionItem({ execution }: ExecutionItemProps) {
  const [isExpanded, setIsExpanded] = useState(execution.status === "running");

  const getStatusColor = () => {
    switch (execution.status) {
      case "running":
        return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20";
      case "completed":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
      case "failed":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20";
    }
  };

  const getStatusIcon = () => {
    switch (execution.status) {
      case "running":
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-4 h-4 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full"
          />
        );
      case "completed":
        return (
          <svg
            className="w-4 h-4 text-green-600 dark:text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        );
      case "failed":
        return (
          <svg
            className="w-4 h-4 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        );
    }
  };

  const formatDuration = () => {
    if (!execution.endTime) return "Running...";
    const duration = execution.endTime - execution.startTime;
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1">
          {/* Status Icon */}
          <div className="flex-shrink-0">{getStatusIcon()}</div>

          {/* Command Info */}
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {execution.workflowName}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor()}`}
              >
                {execution.status}
              </span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 font-mono">
              {execution.command}
            </div>
          </div>

          {/* Duration */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {formatDuration()}
          </div>

          {/* Expand Icon */}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </motion.div>
        </div>
      </button>

      {/* Expandable Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
              {/* Metadata */}
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-3 space-y-1">
                <div>
                  <span className="font-semibold">Started:</span>{" "}
                  {new Date(execution.startTime).toLocaleString()}
                </div>
                {execution.endTime && (
                  <div>
                    <span className="font-semibold">Ended:</span>{" "}
                    {new Date(execution.endTime).toLocaleString()}
                  </div>
                )}
                <div>
                  <span className="font-semibold">ID:</span>{" "}
                  <span className="font-mono">{execution.id}</span>
                </div>
              </div>

              {/* Output */}
              {execution.output && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Output:
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 max-h-96 overflow-auto">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                      >
                        {execution.output}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {execution.error && (
                <div>
                  <div className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2">
                    Error:
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                    <pre className="text-xs text-red-900 dark:text-red-200 whitespace-pre-wrap font-mono">
                      {execution.error}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
