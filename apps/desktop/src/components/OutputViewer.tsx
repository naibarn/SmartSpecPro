import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { WorkflowExecution, OutputMessage } from "../types/workflow";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";

interface OutputViewerProps {
  execution: WorkflowExecution;
}

export function OutputViewer({ execution }: OutputViewerProps) {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [execution.messages]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return { variant: "default" as const, label: "RUNNING" };
      case "completed":
        return { variant: "success" as const, label: "COMPLETED" };
      case "failed":
        return { variant: "destructive" as const, label: "FAILED" };
      case "stopped":
        return { variant: "secondary" as const, label: "STOPPED" };
      default:
        return { variant: "secondary" as const, label: status.toUpperCase() };
    }
  };

  const getMessageIcon = (message: OutputMessage) => {
    switch (message.type) {
      case "started":
        return "▶️";
      case "log":
        return "📝";
      case "progress":
        return "⏳";
      case "output":
        return "📄";
      case "error":
        return "❌";
      case "completed":
        return "✅";
      case "failed":
        return "💥";
      default:
        return "•";
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <Card className="flex flex-col h-full border-2 overflow-hidden">
      {/* Status Bar */}
      <div className="bg-gradient-to-r from-gray-50 via-blue-50 to-indigo-50 border-b-2 border-gray-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Badge variant={getStatusBadge(execution.status).variant} className="text-sm px-4 py-2">
              {getStatusBadge(execution.status).label}
            </Badge>
            <span className="text-sm font-medium text-gray-600">
              ID: <span className="font-mono text-gray-900">{execution.id}</span>
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            {execution.startTime && (
              <span>
                🕐 Started: <span className="font-medium">{execution.startTime.toLocaleTimeString()}</span>
              </span>
            )}
            {execution.endTime && (
              <span>
                🏁 Ended: <span className="font-medium">{execution.endTime.toLocaleTimeString()}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Output Messages */}
      <div
        ref={outputRef}
        className="flex-1 overflow-auto p-5 space-y-3 bg-gradient-to-br from-gray-50 to-blue-50/30"
      >
        {execution.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  rotate: [0, 10, -10, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 mb-3"
              >
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </motion.div>
              <p className="text-sm font-medium text-gray-600">Waiting for output...</p>
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {execution.messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="border-2 p-4 hover:shadow-lg transition-shadow bg-white">
                  <div className="flex items-start gap-3">
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className="text-xl flex-shrink-0 mt-0.5"
                    >
                      {getMessageIcon(message)}
                    </motion.span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">
                          {message.type}
                        </Badge>
                        <span className="text-xs text-gray-500 font-mono">
                          {formatTimestamp(message.timestamp)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-900 break-words">
                        {message.type === "progress" && "step" in message && (
                          <div className="mb-2">
                            <div className="font-semibold text-blue-700 mb-1">
                              {message.step}
                            </div>
                            {message.progress !== undefined && (
                              <div className="w-full bg-gray-200 rounded-full h-2 mb-2 overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${message.progress * 100}%` }}
                                  transition={{ duration: 0.5 }}
                                  className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2 rounded-full"
                                />
                              </div>
                            )}
                          </div>
                        )}
                        {message.type === "log" && "level" in message && (
                          <Badge
                            variant={
                              message.level === "error"
                                ? "destructive"
                                : message.level === "warn"
                                ? "warning"
                                : "secondary"
                            }
                            className="mr-2"
                          >
                            {message.level}
                          </Badge>
                        )}
                        {"message" in message && (
                          <span className="font-medium">{message.message}</span>
                        )}
                        {"content" in message && (
                          <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-lg text-xs font-mono overflow-x-auto">
                            {message.content}
                          </pre>
                        )}
                        {message.type === "error" && "code" in message && (
                          <div className="mt-2 p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                            <div className="text-xs font-bold text-red-700 mb-1">
                              Error Code: {message.code}
                            </div>
                            <div className="text-sm text-red-800">
                              {message.message}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </Card>
  );
}
