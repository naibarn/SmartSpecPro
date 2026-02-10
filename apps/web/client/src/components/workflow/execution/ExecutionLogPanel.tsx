/**
 * ExecutionLogPanel - Chronological execution log viewer with expandable details.
 *
 * Displays execution events in order with timestamps, status icons, and expandable output/error details.
 */

import React, { useState, useEffect, useRef } from "react";
import { Check, X, Loader2, AlertCircle, Copy } from "lucide-react";
import { useExecutionStore, type LogEntry } from "@/stores/executionStore";

export interface ExecutionLogPanelProps {
  className?: string;
}

/**
 * ExecutionLogPanel component.
 */
export function ExecutionLogPanel({ className = "" }: ExecutionLogPanelProps) {
  const logs = useExecutionStore((state) => state.getLogs());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest entry
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // TODO: Show toast notification
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (logs.length === 0) {
    return (
      <div className={`p-4 text-center text-gray-500 ${className}`}>
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p>No execution logs yet</p>
        <p className="text-sm mt-1">Run a workflow to see execution details</p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 p-4 ${className}`}>
      {logs.map((entry) => (
        <LogEntryRow
          key={entry.id}
          entry={entry}
          isExpanded={expandedIds.has(entry.id)}
          onToggle={() => toggleExpand(entry.id)}
          onCopy={copyToClipboard}
        />
      ))}
      <div ref={logEndRef} />
    </div>
  );
}

/**
 * Single log entry row component.
 */
interface LogEntryRowProps {
  entry: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onCopy: (text: string) => void;
}

function LogEntryRow({ entry, isExpanded, onToggle, onCopy }: LogEntryRowProps) {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });

  const statusIcon = {
    pending: <Loader2 className="w-4 h-4 text-gray-400" />,
    running: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
    success: <Check className="w-4 h-4 text-green-500" />,
    failed: <X className="w-4 h-4 text-red-500" />,
    skipped: <AlertCircle className="w-4 h-4 text-gray-400" />,
  }[entry.status];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header Row */}
      <div
        className="p-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <div className="text-xs text-gray-500 font-mono min-w-[80px]">{timestamp}</div>
        <div className="flex-shrink-0">{statusIcon}</div>
        <div className="flex-1 font-medium text-sm">{entry.nodeName}</div>
        {entry.duration && (
          <div className="text-xs text-gray-500">{entry.duration}ms</div>
        )}
        {entry.error && (
          <div className="text-xs text-red-600 font-semibold">ERROR</div>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 bg-gray-50">
          {/* Event Type */}
          <div className="text-xs text-gray-600">
            Event: <code className="bg-gray-200 px-1 rounded">{entry.eventType}</code>
          </div>

          {/* Output */}
          {entry.output && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Output:</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopy(JSON.stringify(entry.output, null, 2));
                  }}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </button>
              </div>
              <pre className="text-xs bg-white border border-gray-200 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(entry.output, null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {entry.error && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-red-700">Error:</span>
              <div className="text-xs bg-red-50 border border-red-200 rounded p-2 text-red-700">
                {entry.error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
